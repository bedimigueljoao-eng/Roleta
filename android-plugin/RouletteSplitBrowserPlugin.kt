package ao.roletaquant.lab

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

/**
 * Native Capacitor Plugin for Roleta Quant Lab.
 * Renders a top-half native WebView with persistent session cookies above the Capacitor WebView
 * and captures only the configured ROI bounding box without system-wide screen recording.
 */
@CapacitorPlugin(name = "RouletteSplitBrowser")
class RouletteSplitBrowserPlugin : Plugin() {
    private var topWebView: WebView? = null
    private var currentSplitPercent: Int = 56

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    fun openSplitBrowser(call: PluginCall) {
        val url = call.getString("url") ?: "https://www.kwanzabet.ao"
        val splitPercent = call.getInt("splitPercent") ?: 56
        val preserveCookies = call.getBoolean("preserveCookies") ?: true
        currentSplitPercent = splitPercent.coerceIn(30, 75)

        activity.runOnUiThread {
            val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)
            val totalHeight = rootLayout.height
            val topHeight = (totalHeight * currentSplitPercent) / 100

            if (topWebView == null) {
                val webView = WebView(context)
                val settings: WebSettings = webView.settings
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true

                val cookieManager = CookieManager.getInstance()
                cookieManager.setAcceptCookie(preserveCookies)
                cookieManager.setAcceptThirdPartyCookies(webView, preserveCookies)

                webView.webViewClient = WebViewClient()
                val params = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    topHeight,
                    Gravity.TOP
                )
                rootLayout.addView(webView, params)
                topWebView = webView
            } else {
                val lp = topWebView?.layoutParams
                if (lp != null) {
                    lp.height = topHeight
                    topWebView?.layoutParams = lp
                }
                topWebView?.visibility = View.VISIBLE
            }

            topWebView?.loadUrl(url)
            adjustCapacitorWebViewOffset(topHeight, totalHeight - topHeight)

            val ret = JSObject()
            ret.put("opened", true)
            ret.put("url", url)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun closeSplitBrowser(call: PluginCall) {
        activity.runOnUiThread {
            topWebView?.visibility = View.GONE
            val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)
            adjustCapacitorWebViewOffset(0, rootLayout.height)
            val ret = JSObject()
            ret.put("closed", true)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun updateSplitPercent(call: PluginCall) {
        val splitPercent = (call.getInt("splitPercent") ?: 56).coerceIn(30, 75)
        currentSplitPercent = splitPercent
        activity.runOnUiThread {
            val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)
            val totalHeight = rootLayout.height
            val topHeight = (totalHeight * currentSplitPercent) / 100
            topWebView?.layoutParams?.let {
                it.height = topHeight
                topWebView?.layoutParams = it
            }
            if (topWebView?.visibility == View.VISIBLE) {
                adjustCapacitorWebViewOffset(topHeight, totalHeight - topHeight)
            }
            val ret = JSObject()
            ret.put("splitPercent", currentSplitPercent)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun navigateTo(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("URL obrigatória")
        activity.runOnUiThread {
            topWebView?.loadUrl(url)
            val ret = JSObject()
            ret.put("url", url)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun captureRoiFrame(call: PluginCall) {
        val webView = topWebView ?: return call.reject("Navegador embutido não está aberto")
        val roi = call.getObject("roi") ?: JSObject()
        val xPct = roi.optDouble("xPercent", 4.0)
        val yPct = roi.optDouble("yPercent", 72.0)
        val wPct = roi.optDouble("widthPercent", 92.0)
        val hPct = roi.optDouble("heightPercent", 18.0)

        activity.runOnUiThread {
            val w = webView.width
            val h = webView.height
            if (w <= 0 || h <= 0) {
                call.reject("WebView sem dimensões válidas")
                return@runOnUiThread
            }

            val fullBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val finishCrop: (Bitmap) -> Unit = { bmp ->
                val sx = ((xPct / 100.0) * bmp.width).toInt().coerceIn(0, bmp.width - 1)
                val sy = ((yPct / 100.0) * bmp.height).toInt().coerceIn(0, bmp.height - 1)
                val sw = ((wPct / 100.0) * bmp.width).toInt().coerceIn(10, bmp.width - sx)
                val sh = ((hPct / 100.0) * bmp.height).toInt().coerceIn(10, bmp.height - sy)

                val cropped = Bitmap.createBitmap(bmp, sx, sy, sw, sh)
                val out = ByteArrayOutputStream()
                cropped.compress(Bitmap.CompressFormat.JPEG, 90, out)
                val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)

                val ret = JSObject()
                ret.put("imageDataUrl", "data:image/jpeg;base64,$b64")
                ret.put("width", sw)
                ret.put("height", sh)
                call.resolve(ret)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val loc = IntArray(2)
                webView.getLocationInWindow(loc)
                val rect = android.graphics.Rect(loc[0], loc[1], loc[0] + w, loc[1] + h)
                PixelCopy.request(activity.window, rect, fullBitmap, { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        finishCrop(fullBitmap)
                    } else {
                        val canvas = android.graphics.Canvas(fullBitmap)
                        webView.draw(canvas)
                        finishCrop(fullBitmap)
                    }
                }, Handler(Looper.getMainLooper()))
            } else {
                val canvas = android.graphics.Canvas(fullBitmap)
                webView.draw(canvas)
                finishCrop(fullBitmap)
            }
        }
    }

    private fun adjustCapacitorWebViewOffset(topOffset: Int, bottomHeight: Int) {
        val capView = bridge.webView
        val lp = capView.layoutParams as? FrameLayout.LayoutParams ?: return
        lp.topMargin = topOffset
        lp.height = if (topOffset == 0) FrameLayout.LayoutParams.MATCH_PARENT else bottomHeight
        capView.layoutParams = lp
    }
}
