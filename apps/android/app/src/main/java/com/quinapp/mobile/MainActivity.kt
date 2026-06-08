package com.quinapp.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.quinapp.mobile.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val prefs by lazy { getSharedPreferences("quinapp", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        ensureCameraPermission()
        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webview.canGoBack()) binding.webview.goBack() else finish()
            }
        })

        val saved = prefs.getString("server_url", null)
        if (saved.isNullOrBlank()) askServerUrl() else loadUrl(saved)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val w: WebView = binding.webview
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                view.loadUrl(url)
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wanted = request.resources.filter {
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                }.toTypedArray()
                if (wanted.isNotEmpty() &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED
                ) {
                    runOnUiThread { request.grant(wanted) }
                } else {
                    runOnUiThread { request.deny() }
                    ensureCameraPermission()
                }
            }

            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progress.apply {
                    if (newProgress in 1..99) {
                        visibility = android.view.View.VISIBLE
                        progress = newProgress
                    } else {
                        visibility = android.view.View.GONE
                    }
                }
            }
        }
    }

    private fun loadUrl(raw: String) {
        val url = normalize(raw)
        prefs.edit().putString("server_url", url).apply()
        binding.webview.loadUrl(url)
    }

    private fun normalize(raw: String): String {
        var u = raw.trim()
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://$u"
        return u.trimEnd('/')
    }

    private fun askServerUrl() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString("server_url", "http://192.168.1.50:3000"))
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.server_dialog_title)
            .setMessage(R.string.server_dialog_msg)
            .setView(input)
            .setCancelable(false)
            .setPositiveButton(R.string.btn_ok) { _, _ ->
                val v = input.text.toString()
                if (v.isBlank()) {
                    Toast.makeText(this, R.string.server_dialog_msg, Toast.LENGTH_LONG).show()
                    askServerUrl()
                } else {
                    loadUrl(v)
                }
            }
            .show()
    }

    private fun ensureCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 100)
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, R.string.menu_change_server)
        menu.add(0, 2, 1, R.string.menu_reload)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        1 -> { askServerUrl(); true }
        2 -> { binding.webview.reload(); true }
        else -> super.onOptionsItemSelected(item)
    }
}
