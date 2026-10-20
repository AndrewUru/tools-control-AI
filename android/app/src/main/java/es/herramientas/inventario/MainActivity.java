package es.herramientas.inventario;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.net.Uri;
import android.webkit.*;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.Manifest;
import android.content.pm.PackageManager;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.os.Build;
import android.graphics.Insets;
import org.json.*;
import java.io.*;
import java.security.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class MainActivity extends Activity {
    private WebView web;
    private SQLiteDatabase database;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest cameraRequest;
    private static final String HOST = "appassets.androidplatform.net";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            File file = getDatabasePath("inventario-mvp.db");
            if (!file.exists()) {
                file.getParentFile().mkdirs();
                File temporary = new File(file.getPath() + ".tmp");
                try (InputStream in = getAssets().open("demo.db"); OutputStream out = new FileOutputStream(temporary)) {
                    byte[] buffer = new byte[8192]; int n;
                    while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                }
                if (!temporary.renameTo(file)) throw new IOException("No se pudo crear la base de datos");
            }
            database = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READWRITE);
            database.setForeignKeyConstraintsEnabled(true);
        } catch (Exception e) { throw new IllegalStateException("Error al preparar el inventario", e); }
        web = new WebView(this);
        web.setBackgroundColor(0xfff4f5f7);
        // Resize the WebView itself: padding on WebView does not reliably
        // keep fixed-position HTML controls away from the system bars.
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(0xfff4f5f7);
        container.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        container.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                // Forward zeroed insets so WebView does not apply them twice.
                return new WindowInsets.Builder(insets)
                        .setInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime(), Insets.NONE).build();
            }
            int left = insets.getSystemWindowInsetLeft();
            int top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight();
            int bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
            }
            v.setPadding(left, top, right, bottom);
            WindowInsets remaining = insets.replaceSystemWindowInsets(0, 0, 0, 0);
            return Build.VERSION.SDK_INT >= 28 ? remaining.consumeDisplayCutout() : remaining;
        });
        setContentView(container);
        getWindow().setStatusBarColor(0xfff4f5f7);
        getWindow().setNavigationBarColor(0xfff4f5f7);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        container.requestApplyInsets();
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.addJavascriptInterface(new OfflineBridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) {
                    String path = uri.getPath();
                    if (path == null || path.equals("/")) path = "/index.html";
                    if (!path.contains("..")) try {
                        String mime = "application/octet-stream";
                        if (path.endsWith(".html")) mime = "text/html";
                        else if (path.endsWith(".js")) mime = "text/javascript";
                        else if (path.endsWith(".css")) mime = "text/css";
                        else if (path.endsWith(".svg")) mime = "image/svg+xml";
                        else if (path.endsWith(".woff2")) mime = "font/woff2";
                        else if (path.endsWith(".webmanifest")) mime = "application/manifest+json";
                        return new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + path));
                    } catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (!isLocal(request.getOrigin()) || request.getResources().length != 1
                        || !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(request.getResources()[0])) {
                    request.deny(); return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (cameraRequest != null) cameraRequest.deny();
                    cameraRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, 20);
                }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (cameraRequest == request) cameraRequest = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), 10); }
                catch (Exception e) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, () -> goBack());
        }
        web.loadUrl("https://" + HOST + "/");
    }
    private boolean isLocal(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()); }
    private void goBack() { if (web.canGoBack()) web.goBack(); else finish(); }
    @Override public void onBackPressed() { goBack(); }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 20 && cameraRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else cameraRequest.deny();
            cameraRequest = null;
        }
    }
    @Override protected void onPause() {
        if (cameraRequest == null)
            web.evaluateJavascript("document.querySelectorAll('dialog[open]').forEach(d => d.close())", null);
        web.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 10 && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }
    @Override protected void onDestroy() {
        if (cameraRequest != null) { cameraRequest.deny(); cameraRequest = null; }
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.removeJavascriptInterface("Android");
        web.destroy();
        database.close();
        super.onDestroy();
    }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format("%02x", b & 255));
        return out.toString();
    }
    private static String derive(String password, String salt) throws Exception {
        return hex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(password.toCharArray(), salt.getBytes("UTF-8"), 120000, 256)).getEncoded());
    }
    public class OfflineBridge {
        @JavascriptInterface public String randomHex(int size) {
            byte[] bytes = new byte[Math.min(Math.max(size, 1), 64)];
            new SecureRandom().nextBytes(bytes); return hex(bytes);
        }
        @JavascriptInterface public String hashPassword(String password) {
            try { String salt = randomHex(16); return salt + ":" + derive(password, salt); }
            catch (Exception e) { throw new IllegalStateException(e); }
        }
        @JavascriptInterface public boolean verifyPassword(String password, String saved) {
            try { String[] parts = saved.split(":"); return parts.length == 2 && MessageDigest.isEqual(derive(password, parts[0]).getBytes("UTF-8"), parts[1].getBytes("UTF-8")); }
            catch (Exception e) { return false; }
        }
        @JavascriptInterface public void print(String format) {
            runOnUiThread(() -> {
                PrintAttributes.MediaSize paper = PrintAttributes.MediaSize.ISO_A4;
                if ("rollo50".equals(format))
                    paper = new PrintAttributes.MediaSize("LABEL50", "Etiqueta 50 x 30 mm", 1969, 1181);
                else if ("rollo100".equals(format))
                    paper = new PrintAttributes.MediaSize("LABEL100", "Etiqueta 100 x 50 mm", 3937, 1969);
                PrintAttributes attributes = new PrintAttributes.Builder().setMediaSize(paper)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME).build();
                ((PrintManager)getSystemService(PRINT_SERVICE)).print(
                        "Etiquetas de herramientas", web.createPrintDocumentAdapter("Etiquetas"), attributes);
            });
        }
        @JavascriptInterface public synchronized String database(String sql, String json, String mode) {
            JSONObject response = new JSONObject();
            try {
                JSONArray args = new JSONArray(json);
                if (mode.equals("all")) {
                    String[] values = new String[args.length()];
                    for (int i = 0; i < values.length; i++) values[i] = args.isNull(i) ? null : args.get(i).toString();
                    JSONArray rows = new JSONArray();
                    try (Cursor cursor = database.rawQuery(sql, values)) {
                        while (cursor.moveToNext()) {
                            JSONObject row = new JSONObject();
                            for (int i = 0; i < cursor.getColumnCount(); i++) {
                                Object value = JSONObject.NULL;
                                switch (cursor.getType(i)) {
                                    case Cursor.FIELD_TYPE_INTEGER: value = cursor.getLong(i); break;
                                    case Cursor.FIELD_TYPE_FLOAT: value = cursor.getDouble(i); break;
                                    case Cursor.FIELD_TYPE_STRING: value = cursor.getString(i); break;
                                }
                                row.put(cursor.getColumnName(i), value);
                            }
                            rows.put(row);
                        }
                    }
                    response.put("value", rows);
                } else if (mode.equals("exec")) {
                    if (sql.equals("BEGIN")) database.beginTransaction();
                    else if (sql.equals("COMMIT")) { database.setTransactionSuccessful(); database.endTransaction(); }
                    else if (sql.equals("ROLLBACK")) database.endTransaction();
                    else database.execSQL(sql);
                    response.put("value", JSONObject.NULL);
                } else {
                    try (SQLiteStatement statement = database.compileStatement(sql)) {
                        for (int i = 0; i < args.length(); i++) {
                            Object v = args.get(i);
                            if (v == JSONObject.NULL) statement.bindNull(i + 1);
                            else if (v instanceof Float || v instanceof Double) statement.bindDouble(i + 1, ((Number)v).doubleValue());
                            else if (v instanceof Number) statement.bindLong(i + 1, ((Number)v).longValue());
                            else statement.bindString(i + 1, v.toString());
                        }
                        statement.execute();
                    }
                    try (Cursor cursor = database.rawQuery("SELECT last_insert_rowid(), changes()", null)) {
                        cursor.moveToFirst();
                        response.put("value", new JSONObject().put("lastInsertRowid", cursor.getLong(0)).put("changes", cursor.getInt(1)));
                    }
                }
            } catch (Exception e) { try { response.put("error", e.getMessage()); } catch (JSONException ignored) {} }
            return response.toString();
        }
    }
}
