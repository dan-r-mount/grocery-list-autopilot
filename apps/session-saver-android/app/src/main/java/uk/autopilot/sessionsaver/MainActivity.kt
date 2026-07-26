package uk.autopilot.sessionsaver

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private lateinit var apiBase: EditText
    private lateinit var pairCode: EditText
    private lateinit var passphrase: EditText

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        status = findViewById(R.id.status)
        apiBase = findViewById(R.id.apiBase)
        pairCode = findViewById(R.id.pairCode)
        passphrase = findViewById(R.id.passphrase)

        // Prefill from deep link extras if present
        intent?.getStringExtra("apiBase")?.let { apiBase.setText(it) }
        intent?.getStringExtra("pairCode")?.let { pairCode.setText(it) }

        if (apiBase.text.isNullOrBlank()) {
            // Leave blank — user must paste the current Autopilot HTTPS URL from the browser.
            apiBase.hint = "Paste Autopilot https:// URL from Chrome"
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.userAgentString =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36"

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                status.text = "Loaded: ${url ?: ""}"
            }
        }

        findViewById<Button>(R.id.openLogin).setOnClickListener {
            webView.loadUrl("https://www.sainsburys.co.uk/gol-ui/Hello")
            status.text = "Sign in fully (including MFA), then tap Save session."
        }

        findViewById<Button>(R.id.saveSession).setOnClickListener {
            saveSession()
        }
    }

    private fun saveSession() {
        val base = apiBase.text.toString().trim().trimEnd('/')
        val code = pairCode.text.toString().trim()
        val pass = passphrase.text.toString()
        if (base.isEmpty() || code.isEmpty() || pass.length < 8) {
            Toast.makeText(this, "Need API URL, pair code, and passphrase (8+ chars)", Toast.LENGTH_LONG).show()
            return
        }

        val cookieHeader = CookieManager.getInstance().getCookie("https://www.sainsburys.co.uk") ?: ""
        if (cookieHeader.isBlank()) {
            Toast.makeText(this, "No Sainsbury’s cookies yet — finish logging in first", Toast.LENGTH_LONG).show()
            return
        }

        status.text = "Saving encrypted session…"
        thread {
            try {
                val url = URL("$base/api/sainsburys/device-pair/import")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 20000
                    readTimeout = 20000
                }
                val body = JSONObject()
                    .put("code", code)
                    .put("passphrase", pass)
                    .put("cookieText", cookieHeader)
                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
                val codeResp = conn.responseCode
                val stream = if (codeResp in 200..299) conn.inputStream else conn.errorStream
                val resp = stream?.bufferedReader()?.readText().orEmpty()
                runOnUiThread {
                    if (codeResp in 200..299) {
                        status.text = "Saved. Return to Autopilot — vault should show a Sainsbury’s session."
                        Toast.makeText(this, "Session saved to Autopilot", Toast.LENGTH_LONG).show()
                    } else {
                        val err = try {
                            JSONObject(resp).optString("error", resp)
                        } catch (_: Exception) {
                            resp.ifBlank { "HTTP $codeResp" }
                        }
                        status.text = "Save failed: $err"
                        Toast.makeText(this, err, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    val msg =
                        "Could not reach Autopilot (${e.message}). Check the https:// URL is the current tunnel link and you are online."
                    status.text = msg
                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
