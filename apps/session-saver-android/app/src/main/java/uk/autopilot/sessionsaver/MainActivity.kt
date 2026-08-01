package uk.autopilot.sessionsaver

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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

/**
 * Automated Sainsbury's session capture for Pixel:
 * - Deep link autofills Autopilot URL + pair code
 * - Opens login immediately
 * - Watches for auth cookies and saves to Autopilot without a second tap when possible
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private lateinit var apiBase: EditText
    private lateinit var pairCode: EditText
    private lateinit var passphrase: EditText

    private val handler = Handler(Looper.getMainLooper())
    private var saveInFlight = false
    private var savedOk = false
    private var autoMode = false

    private val cookiePoll = object : Runnable {
        override fun run() {
            if (savedOk || isFinishing) return
            if (autoMode && hasLoggedInCookies() && !saveInFlight) {
                status.text = "Login detected — saving session automatically…"
                saveSession(fromAuto = true)
            }
            handler.postDelayed(this, 1500)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        status = findViewById(R.id.status)
        apiBase = findViewById(R.id.apiBase)
        pairCode = findViewById(R.id.pairCode)
        passphrase = findViewById(R.id.passphrase)

        val prefs = getSharedPreferences("saver", MODE_PRIVATE)
        passphrase.setText(prefs.getString("passphrase", "") ?: "")

        applyIntent(intent)

        if (apiBase.text.isNullOrBlank()) {
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
                if (autoMode && hasLoggedInCookies() && !saveInFlight && !savedOk) {
                    status.text = "Login detected — saving session automatically…"
                    saveSession(fromAuto = true)
                }
            }
        }

        findViewById<Button>(R.id.openLogin).setOnClickListener {
            startLogin(auto = false)
        }

        findViewById<Button>(R.id.saveSession).setOnClickListener {
            saveSession(fromAuto = false)
        }

        // Fully automated path when launched from Autopilot deep link
        if (autoMode && apiBase.text.isNotBlank() && pairCode.text.isNotBlank()) {
            if (passphrase.text.length >= 8) {
                startLogin(auto = true)
            } else {
                status.text = "Enter your vault passphrase once, then tap Open login (next time this is automatic)."
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyIntent(intent)
        if (autoMode && passphrase.text.length >= 8) {
            startLogin(auto = true)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(cookiePoll)
        super.onDestroy()
    }

    private fun applyIntent(intent: Intent?) {
        if (intent == null) return

        intent.getStringExtra("apiBase")?.let { apiBase.setText(it) }
        intent.getStringExtra("pairCode")?.let { pairCode.setText(it) }
        intent.getStringExtra("passphrase")?.let {
            if (it.length >= 8) passphrase.setText(it)
        }
        if (intent.getBooleanExtra("auto", false)) autoMode = true

        val data: Uri? = intent.data
        if (data != null) {
            // autopilot://session-saver?api=...&code=...&auto=1
            // https://host/open/session-saver?api=...&code=...&auto=1
            data.getQueryParameter("api")?.let { apiBase.setText(it) }
            data.getQueryParameter("apiBase")?.let { apiBase.setText(it) }
            data.getQueryParameter("code")?.let { pairCode.setText(it) }
            data.getQueryParameter("pairCode")?.let { pairCode.setText(it) }
            data.getQueryParameter("passphrase")?.let {
                if (it.length >= 8) passphrase.setText(it)
            }
            if (data.getQueryParameter("auto") == "1" || data.getQueryParameter("auto") == "true") {
                autoMode = true
            }
        }
    }

    private fun startLogin(auto: Boolean) {
        autoMode = auto || autoMode
        savedOk = false
        webView.loadUrl("https://www.sainsburys.co.uk/gol-ui/Hello")
        status.text =
            if (autoMode) "Sign in (incl. MFA). When login succeeds, Session Saver will save automatically."
            else "Sign in fully (including MFA), then tap Save session."
        handler.removeCallbacks(cookiePoll)
        handler.postDelayed(cookiePoll, 2000)
    }

    private fun hasLoggedInCookies(): Boolean {
        val cookieHeader = CookieManager.getInstance().getCookie("https://www.sainsburys.co.uk") ?: return false
        val lower = cookieHeader.lowercase()
        return lower.contains("wc_authentication") ||
            lower.contains("wcauthtoken") ||
            lower.contains("wcrememberme")
    }

    private fun saveSession(fromAuto: Boolean) {
        if (saveInFlight || savedOk) return

        val base = apiBase.text.toString().trim().trimEnd('/')
        val code = pairCode.text.toString().trim()
        val pass = passphrase.text.toString()
        if (base.isEmpty() || code.isEmpty() || pass.length < 8) {
            if (!fromAuto) {
                Toast.makeText(this, "Need API URL, pair code, and passphrase (8+ chars)", Toast.LENGTH_LONG).show()
            }
            return
        }

        val cookieHeader = CookieManager.getInstance().getCookie("https://www.sainsburys.co.uk") ?: ""
        if (cookieHeader.isBlank() || !hasLoggedInCookies()) {
            if (!fromAuto) {
                Toast.makeText(this, "No logged-in Sainsbury’s cookies yet — finish signing in first", Toast.LENGTH_LONG).show()
            }
            return
        }

        getSharedPreferences("saver", MODE_PRIVATE)
            .edit()
            .putString("passphrase", pass)
            .apply()

        saveInFlight = true
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
                    saveInFlight = false
                    if (codeResp in 200..299) {
                        savedOk = true
                        handler.removeCallbacks(cookiePoll)
                        status.text = "Saved automatically. Returning to Autopilot…"
                        Toast.makeText(this, "Sainsbury’s session saved", Toast.LENGTH_LONG).show()
                        // Bounce user back to Autopilot web UI
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(base)))
                        } catch (_: Exception) {
                            // ignore
                        }
                    } else {
                        val err = try {
                            JSONObject(resp).optString("error", resp)
                        } catch (_: Exception) {
                            resp.ifBlank { "HTTP $codeResp" }
                        }
                        status.text = "Save failed: $err"
                        if (!fromAuto) Toast.makeText(this, err, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    saveInFlight = false
                    val msg =
                        "Could not reach Autopilot (${e.message}). Check the https:// URL is the current tunnel link and you are online."
                    status.text = msg
                    if (!fromAuto) Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
