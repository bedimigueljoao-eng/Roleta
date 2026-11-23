package ao.roletaquant.lab;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

/**
 * Native Capacitor Plugin for Roleta Quant Lab.
 * Renders a top-half native WebView with persistent session cookies above the Capacitor WebView
 * and captures only the configured ROI bounding box without system-wide screen recording.
 */
@CapacitorPlugin(name = "RouletteSplitBrowser")
public class RouletteSplitBrowserPlugin extends Plugin {
    private WebView topWebView = null;
    private int currentSplitPercent = 56;

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void openSplitBrowser(PluginCall call) {
        final String url = call.getString("url", "https://www.kwanzabet.ao");
        Integer splitArg = call.getInt("splitPercent", 56);
        final boolean preserveCookies = Boolean.TRUE.equals(call.getBoolean("preserveCookies", true));
        currentSplitPercent = Math.max(30, Math.min(75, splitArg != null ? splitArg : 56));

        getActivity().runOnUiThread(() -> {
            ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
            int totalHeight = rootLayout.getHeight();
            int topHeight = (totalHeight * currentSplitPercent) / 100;

            if (topWebView == null) {
                WebView webView = new WebView(getContext());
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setUseWideViewPort(true);
                settings.setLoadWithOverviewMode(true);

                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(preserveCookies);
                cookieManager.setAcceptThirdPartyCookies(webView, preserveCookies);

                webView.setWebViewClient(new WebViewClient());
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    topHeight,
                    Gravity.TOP
                );
                rootLayout.addView(webView, params);
                topWebView = webView;
            } else {
                ViewGroup.LayoutParams lp = topWebView.getLayoutParams();
                if (lp != null) {
                    lp.height = topHeight;
                    topWebView.setLayoutParams(lp);
                }
                topWebView.setVisibility(View.VISIBLE);
            }

            topWebView.loadUrl(url);
            adjustCapacitorWebViewOffset(topHeight, totalHeight - topHeight);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("url", url);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void closeSplitBrowser(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (topWebView != null) {
                topWebView.setVisibility(View.GONE);
            }
            ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
            adjustCapacitorWebViewOffset(0, rootLayout.getHeight());
            JSObject ret = new JSObject();
            ret.put("closed", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void updateSplitPercent(PluginCall call) {
        Integer splitArg = call.getInt("splitPercent", 56);
        currentSplitPercent = Math.max(30, Math.min(75, splitArg != null ? splitArg : 56));

        getActivity().runOnUiThread(() -> {
            ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
            int totalHeight = rootLayout.getHeight();
            int topHeight = (totalHeight * currentSplitPercent) / 100;
            if (topWebView != null) {
                ViewGroup.LayoutParams lp = topWebView.getLayoutParams();
                if (lp != null) {
                    lp.height = topHeight;
                    topWebView.setLayoutParams(lp);
                }
                if (topWebView.getVisibility() == View.VISIBLE) {
                    adjustCapacitorWebViewOffset(topHeight, totalHeight - topHeight);
                }
            }
            JSObject ret = new JSObject();
            ret.put("splitPercent", currentSplitPercent);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void navigateTo(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL obrigatória");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (topWebView != null) {
                topWebView.loadUrl(url);
            }
            JSObject ret = new JSObject();
            ret.put("url", url);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void captureRoiFrame(PluginCall call) {
        if (topWebView == null) {
            call.reject("Navegador embutido não está aberto");
            return;
        }

        JSObject roi = call.getObject("roi", new JSObject());
        final double xPct = roi.optDouble("xPercent", 4.0);
        final double yPct = roi.optDouble("yPercent", 72.0);
        final double wPct = roi.optDouble("widthPercent", 92.0);
        final double hPct = roi.optDouble("heightPercent", 18.0);

        getActivity().runOnUiThread(() -> {
            final WebView webView = topWebView;
            int w = webView.getWidth();
            int h = webView.getHeight();
            if (w <= 0 || h <= 0) {
                call.reject("WebView sem dimensões válidas");
                return;
            }

            final Bitmap fullBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                int[] loc = new int[2];
                webView.getLocationInWindow(loc);
                Rect rect = new Rect(loc[0], loc[1], loc[0] + w, loc[1] + h);
                PixelCopy.request(getActivity().getWindow(), rect, fullBitmap, copyResult -> {
                    if (copyResult == PixelCopy.SUCCESS) {
                        cropAndResolve(fullBitmap, xPct, yPct, wPct, hPct, call);
                    } else {
                        Canvas canvas = new Canvas(fullBitmap);
                        webView.draw(canvas);
                        cropAndResolve(fullBitmap, xPct, yPct, wPct, hPct, call);
                    }
                }, new Handler(Looper.getMainLooper()));
            } else {
                Canvas canvas = new Canvas(fullBitmap);
                webView.draw(canvas);
                cropAndResolve(fullBitmap, xPct, yPct, wPct, hPct, call);
            }
        });
    }

    private void cropAndResolve(
        Bitmap bmp,
        double xPct,
        double yPct,
        double wPct,
        double hPct,
        PluginCall call
    ) {
        int sx = Math.max(0, Math.min(bmp.getWidth() - 1, (int) ((xPct / 100.0) * bmp.getWidth())));
        int sy = Math.max(0, Math.min(bmp.getHeight() - 1, (int) ((yPct / 100.0) * bmp.getHeight())));
        int sw = Math.max(10, Math.min(bmp.getWidth() - sx, (int) ((wPct / 100.0) * bmp.getWidth())));
        int sh = Math.max(10, Math.min(bmp.getHeight() - sy, (int) ((hPct / 100.0) * bmp.getHeight())));

        Bitmap cropped = Bitmap.createBitmap(bmp, sx, sy, sw, sh);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        cropped.compress(Bitmap.CompressFormat.JPEG, 90, out);
        String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);

        JSObject ret = new JSObject();
        ret.put("imageDataUrl", "data:image/jpeg;base64," + b64);
        ret.put("width", sw);
        ret.put("height", sh);
        call.resolve(ret);
    }

    private void adjustCapacitorWebViewOffset(int topOffset, int bottomHeight) {
        View capView = getBridge().getWebView();
        if (capView == null) return;
        ViewGroup.LayoutParams rawLp = capView.getLayoutParams();
        if (!(rawLp instanceof FrameLayout.LayoutParams)) return;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) rawLp;
        lp.topMargin = topOffset;
        lp.height = (topOffset == 0) ? FrameLayout.LayoutParams.MATCH_PARENT : bottomHeight;
        capView.setLayoutParams(lp);
    }
}
