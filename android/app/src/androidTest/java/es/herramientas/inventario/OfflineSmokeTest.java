package es.herramientas.inventario;

import android.app.*;
import android.os.*;
import android.content.Intent;
import android.webkit.WebView;
import java.util.concurrent.*;

public class OfflineSmokeTest extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private WebView web(Activity a) {
        android.view.ViewGroup container = (android.view.ViewGroup)
                ((android.view.ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);
        return (WebView)container.getChildAt(0);
    }
    private String js(Activity a, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); String[] out = new String[1];
        runOnMainSync(() -> web(a).evaluateJavascript(script, r -> { out[0] = r; latch.countDown(); }));
        if (!latch.await(15, TimeUnit.SECONDS)) throw new Exception("JavaScript timeout");
        return out[0];
    }
    private Activity launch() throws Exception {
        Activity a = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        for (int i = 0; i < 100; i++) {
            if ("true".equals(js(a, "typeof GET === 'function' && !!document.querySelector('form')"))) return a;
            Thread.sleep(100);
        }
        throw new Exception("Login did not load");
    }
    @Override public void onStart() {
        Bundle results = new Bundle();
        try {
            Activity a = launch();
            String script = new String(getContext().getAssets().open("smoke.js").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            js(a, script);
            String result = "null";
            for (int i = 0; i < 200; i++) { result = js(a, "window.SMOKE_RESULT || null"); if (!result.equals("null")) break; Thread.sleep(100); }
            if (!result.contains("PASS")) throw new Exception(result);
            runOnMainSync(() -> a.finish()); waitForIdleSync();
            Activity b = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            for (int i = 0; i < 100; i++) { if ("true".equals(js(b, "typeof GET === 'function'"))) break; Thread.sleep(100); }
            js(b, "GET('/api/herramientas?q=MVP-SMOKE').then(rows => window.PERSIST_RESULT = rows.some(h => h.nombre === 'Prueba persistencia MVP') ? 'PASS' : 'FAIL').catch(e => window.PERSIST_RESULT = e.message)");
            String persisted = "null";
            for (int i = 0; i < 100; i++) { persisted = js(b, "window.PERSIST_RESULT || null"); if (!persisted.equals("null")) break; Thread.sleep(100); }
            if (!persisted.contains("PASS")) throw new Exception("Persistence: " + persisted);
            results.putString("stream", "PASS: offline login, validation, inventory, movement, incident, maintenance, UI and persistence after activity restart.");
            finish(Activity.RESULT_OK, results);
        } catch (Exception e) { results.putString("stream", "FAIL: " + e); finish(Activity.RESULT_CANCELED, results); }
    }
}
