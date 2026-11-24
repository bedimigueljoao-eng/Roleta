package ao.roletaquant.lab;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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
 * - Splits the screen cleanly between a top WebView (with cookies preserved) and the bottom Capacitor app.
 * - Respects Android status bar and bottom system navigation bar insets so buttons never collide.
 * - Renders an interactive, draggable ROI frame directly over the top WebView for OCR capture.
 */
@CapacitorPlugin(name = "RouletteSplitBrowser")
public class RouletteSplitBrowserPlugin extends Plugin {
    private WebView topWebView = null;
    private RoiOverlayView roiOverlayView = null;
    private int currentSplitPercent = 48;
    private boolean isSplitOpen = false;
    private boolean roiVisible = false;

    private double roiX = 4.0;
    private double roiY = 68.0;
    private double roiW = 92.0;
    private double roiH = 20.0;

    @Override
    public void load() {
        super.load();
        getActivity().runOnUiThread(this::applySafeInsetsWhenClosed);
    }

    private int[] getSystemBarInsets() {
        int topInset = 0;
        int bottomInset = 0;
        View decor = getActivity().getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            WindowInsets insets = decor.getRootWindowInsets();
            if (insets != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets sys = insets.getInsets(WindowInsets.Type.systemBars());
                    topInset = sys.top;
                    bottomInset = sys.bottom;
                } else {
                    topInset = insets.getSystemWindowInsetTop();
                    bottomInset = insets.getSystemWindowInsetBottom();
                }
            }
        }
        return new int[]{topInset, bottomInset};
    }

    private void applySafeInsetsWhenClosed() {
        if (isSplitOpen) return;
        ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
        if (rootLayout == null) return;
        int[] insets = getSystemBarInsets();
        int topInset = insets[0];
        int bottomInset = insets[1];
        View capView = getBridge().getWebView();
        if (capView == null) return;
        ViewGroup.LayoutParams rawLp = capView.getLayoutParams();
        if (rawLp instanceof FrameLayout.LayoutParams) {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) rawLp;
            lp.topMargin = topInset;
            lp.bottomMargin = bottomInset;
            lp.height = FrameLayout.LayoutParams.MATCH_PARENT;
            capView.setLayoutParams(lp);
        }
    }

    private void layoutSplitViews() {
        ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
        if (rootLayout == null) return;
        int totalHeight = rootLayout.getHeight();
        if (totalHeight <= 0) return;

        int[] insets = getSystemBarInsets();
        int topInset = insets[0];
        int bottomInset = insets[1];
        int usableHeight = Math.max(200, totalHeight - topInset - bottomInset);
        int topHeight = (usableHeight * currentSplitPercent) / 100;
        int bottomHeight = Math.max(160, usableHeight - topHeight);

        if (topWebView != null) {
            FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                topHeight,
                Gravity.TOP
            );
            topParams.topMargin = topInset;
            topWebView.setLayoutParams(topParams);
            topWebView.setVisibility(View.VISIBLE);
        }

        if (roiOverlayView != null) {
            FrameLayout.LayoutParams ovParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                topHeight,
                Gravity.TOP
            );
            ovParams.topMargin = topInset;
            roiOverlayView.setLayoutParams(ovParams);
            roiOverlayView.setVisibility(roiVisible ? View.VISIBLE : View.GONE);
            roiOverlayView.invalidate();
        }

        View capView = getBridge().getWebView();
        if (capView != null && capView.getLayoutParams() instanceof FrameLayout.LayoutParams) {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) capView.getLayoutParams();
            lp.topMargin = topInset + topHeight;
            lp.bottomMargin = bottomInset;
            lp.height = bottomHeight;
            capView.setLayoutParams(lp);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void openSplitBrowser(PluginCall call) {
        final String url = call.getString("url", "https://www.kwanzabet.ao");
        Integer splitArg = call.getInt("splitPercent", 48);
        final boolean preserveCookies = Boolean.TRUE.equals(call.getBoolean("preserveCookies", true));
        currentSplitPercent = Math.max(28, Math.min(68, splitArg != null ? splitArg : 48));

        getActivity().runOnUiThread(() -> {
            ViewGroup rootLayout = getActivity().findViewById(android.R.id.content);
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
                rootLayout.addView(webView);
                topWebView = webView;
            }

            if (roiOverlayView == null) {
                roiOverlayView = new RoiOverlayView(getContext());
                rootLayout.addView(roiOverlayView);
            }

            isSplitOpen = true;
            layoutSplitViews();

            String currentLoaded = topWebView.getUrl();
            if (currentLoaded == null || !currentLoaded.equals(url)) {
                topWebView.loadUrl(url);
            }

            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("url", url);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void closeSplitBrowser(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            isSplitOpen = false;
            if (topWebView != null) {
                topWebView.setVisibility(View.GONE);
            }
            if (roiOverlayView != null) {
                roiOverlayView.setVisibility(View.GONE);
            }
            applySafeInsetsWhenClosed();
            JSObject ret = new JSObject();
            ret.put("closed", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void updateSplitPercent(PluginCall call) {
        Integer splitArg = call.getInt("splitPercent", 48);
        currentSplitPercent = Math.max(28, Math.min(68, splitArg != null ? splitArg : 48));

        getActivity().runOnUiThread(() -> {
            if (isSplitOpen) {
                layoutSplitViews();
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
    public void setRoiOverlay(PluginCall call) {
        roiVisible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        JSObject roi = call.getObject("roi", null);
        if (roi != null) {
            roiX = roi.optDouble("xPercent", roiX);
            roiY = roi.optDouble("yPercent", roiY);
            roiW = roi.optDouble("widthPercent", roiW);
            roiH = roi.optDouble("heightPercent", roiH);
        }

        getActivity().runOnUiThread(() -> {
            if (roiOverlayView != null && isSplitOpen) {
                roiOverlayView.setVisibility(roiVisible ? View.VISIBLE : View.GONE);
                roiOverlayView.invalidate();
            }
            JSObject ret = new JSObject();
            ret.put("visible", roiVisible);
            ret.put("xPercent", roiX);
            ret.put("yPercent", roiY);
            ret.put("widthPercent", roiW);
            ret.put("heightPercent", roiH);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void captureRoiFrame(PluginCall call) {
        if (topWebView == null || !isSplitOpen) {
            call.reject("Navegador embutido não está aberto");
            return;
        }

        JSObject roi = call.getObject("roi", null);
        final double xPct = roi != null ? roi.optDouble("xPercent", roiX) : roiX;
        final double yPct = roi != null ? roi.optDouble("yPercent", roiY) : roiY;
        final double wPct = roi != null ? roi.optDouble("widthPercent", roiW) : roiW;
        final double hPct = roi != null ? roi.optDouble("heightPercent", roiH) : roiH;

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
        cropped.compress(Bitmap.CompressFormat.JPEG, 92, out);
        String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);

        JSObject ret = new JSObject();
        ret.put("imageDataUrl", "data:image/jpeg;base64," + b64);
        ret.put("width", sw);
        ret.put("height", sh);
        call.resolve(ret);
    }

    /**
     * Interactive draggable ROI frame drawn directly over the top WebView.
     */
    private class RoiOverlayView extends View {
        private final Paint borderPaint = new Paint();
        private final Paint fillPaint = new Paint();
        private final Paint labelBgPaint = new Paint();
        private final Paint labelTextPaint = new Paint();
        private float lastTouchX = 0f;
        private float lastTouchY = 0f;
        private boolean dragging = false;

        RoiOverlayView(Context ctx) {
            super(ctx);
            borderPaint.setColor(Color.parseColor("#FBBF24"));
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(6f);

            fillPaint.setColor(Color.argb(38, 251, 191, 36));
            fillPaint.setStyle(Paint.Style.FILL);

            labelBgPaint.setColor(Color.parseColor("#FBBF24"));
            labelBgPaint.setStyle(Paint.Style.FILL);

            labelTextPaint.setColor(Color.parseColor("#0B0F17"));
            labelTextPaint.setTextSize(28f);
            labelTextPaint.setFakeBoldText(true);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int vw = getWidth();
            int vh = getHeight();
            if (vw <= 0 || vh <= 0) return;

            float left = (float) ((roiX / 100.0) * vw);
            float top = (float) ((roiY / 100.0) * vh);
            float right = Math.min(vw, left + (float) ((roiW / 100.0) * vw));
            float bottom = Math.min(vh, top + (float) ((roiH / 100.0) * vh));

            RectF rect = new RectF(left, top, right, bottom);
            canvas.drawRect(rect, fillPaint);
            canvas.drawRect(rect, borderPaint);

            float badgeW = Math.min(right - left, 320f);
            canvas.drawRect(left, Math.max(0f, top - 36f), left + badgeW, top, labelBgPaint);
            canvas.drawText("QUADRO OCR · ARRASTE", left + 10f, Math.max(24f, top - 10f), labelTextPaint);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (!roiVisible) return false;
            int vw = Math.max(1, getWidth());
            int vh = Math.max(1, getHeight());
            float left = (float) ((roiX / 100.0) * vw);
            float top = (float) ((roiY / 100.0) * vh);
            float right = left + (float) ((roiW / 100.0) * vw);
            float bottom = top + (float) ((roiH / 100.0) * vh);

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (event.getX() >= left - 30 && event.getX() <= right + 30 &&
                        event.getY() >= top - 45 && event.getY() <= bottom + 30) {
                        dragging = true;
                        lastTouchX = event.getX();
                        lastTouchY = event.getY();
                        return true;
                    }
                    return false;

                case MotionEvent.ACTION_MOVE:
                    if (dragging) {
                        float dxPct = ((event.getX() - lastTouchX) / vw) * 100.0f;
                        float dyPct = ((event.getY() - lastTouchY) / vh) * 100.0f;
                        roiX = Math.max(0.0, Math.min(100.0 - roiW, roiX + dxPct));
                        roiY = Math.max(0.0, Math.min(100.0 - roiH, roiY + dyPct));
                        lastTouchX = event.getX();
                        lastTouchY = event.getY();
                        invalidate();

                        JSObject ev = new JSObject();
                        ev.put("xPercent", Math.round(roiX));
                        ev.put("yPercent", Math.round(roiY));
                        ev.put("widthPercent", Math.round(roiW));
                        ev.put("heightPercent", Math.round(roiH));
                        notifyListeners("roiChanged", ev);
                        return true;
                    }
                    return false;

                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    return true;
            }
            return false;
        }
    }
}
