package co.il.appout.outrun;

import android.content.ComponentCallbacks2;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MemorySafetyNet";

    // Back-off between recovery reloads. static so it survives the activity
    // recreate() below — a rapid re-crash escalates instead of hammering reload.
    private static long sTerminateBackoffMs = 1000L;
    private static final long MAX_TERMINATE_BACKOFF_MS = 30_000L;

    private View reconnectOverlay;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge: tell the system we will manage our own insets.
        // With this set to false the WebView extends behind the status bar
        // and navigation bar, and the web layer uses env(safe-area-inset-*)
        // to inset its own UI elements (BottomNavbar, headers, etc.).
        // Without this call the system pushes our content up and leaves
        // a solid black bar at the bottom on gesture-nav devices.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Runtime equivalent of android:navigationBarContrastEnforced="false"
        // (the XML attribute was removed from values-v29/styles.xml because
        // it broke AAPT2 on toolchains shipping a partial platform jar).
        //
        // By default Android 10+ paints a faint semi-opaque scrim behind the
        // navigation bar when it thinks our content lacks contrast against
        // the bar's icons. With our edge-to-edge layout that scrim shows up
        // as a smudgy band at the bottom of the screen — disabling it gives
        // us the fully transparent gesture-pill area we want.
        //
        // The setter is API 29+ only; the older devices we still support
        // (minSdk 26-28) never had the contrast scrim in the first place,
        // so the version guard is the only protection we need.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // ── Stage 3 Part B — web-content renderer recovery (the loop-breaker) ──
        // When Android OOM-kills the WebView renderer, WebViewClient.
        // onRenderProcessGone fires; if left UNHANDLED (returns false) Android
        // kills the WHOLE app process = a crash. We register a WebViewListener
        // (Capacitor's BridgeWebViewClient forwards to it, so navigation /
        // allowNavigation stays intact — no client subclassing) that returns
        // TRUE to keep the app alive, then recovers behind a "Reconnecting…"
        // overlay with a back-off. The dead WebView is UNUSABLE, so we recreate
        // the activity to get a fresh Bridge + WebView (heavier than iOS's plain
        // reload). This is the Android equivalent of iOS Part B.
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Log.e(TAG, "WebView render process gone (didCrash=" + detail.didCrash()
                            + ") — recovering with back-off");
                    recoverFromRenderProcessGone();
                    return true; // handled — do NOT let Android kill the app process
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    // A successful load = healthy again: clear overlay + reset back-off.
                    onWebContentRecovered();
                }
            });
        }
    }

    // ── Stage 3 Part A — proactive memory shed ──────────────────────────────
    // Forward Android's memory-pressure callbacks to the shared web `memoryWarning`
    // event — appForeground.ts already listens and sheds map markers/tiles + pauses
    // consumers (NO web change needed). Mirrors iOS didReceiveMemoryWarning. Only
    // the RUNNING_* (foreground) trim levels are forwarded; the background trim
    // levels are already covered by appForeground's background pause.
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
                || level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) {
            notifyWebMemoryWarning();
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        notifyWebMemoryWarning();
    }

    private void notifyWebMemoryWarning() {
        Bridge bridge = getBridge();
        if (bridge != null) {
            Log.i(TAG, "memory pressure → notifying web layer (memoryWarning)");
            bridge.triggerWindowJSEvent("memoryWarning");
        }
    }

    // ── Part B recovery helpers ─────────────────────────────────────────────
    private void recoverFromRenderProcessGone() {
        runOnUiThread(() -> {
            showReconnectOverlay();
            final long delay = sTerminateBackoffMs;
            sTerminateBackoffMs = Math.min(sTerminateBackoffMs * 2, MAX_TERMINATE_BACKOFF_MS);
            Log.e(TAG, "recreating in " + delay + "ms (back-off)");
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (!isFinishing() && !isDestroyed()) {
                    recreate();
                }
            }, delay);
        });
    }

    private void onWebContentRecovered() {
        sTerminateBackoffMs = 1000L;
        hideReconnectOverlay();
    }

    private void showReconnectOverlay() {
        if (reconnectOverlay != null) return;
        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(Color.rgb(18, 18, 18));
        overlay.setClickable(true); // swallow taps on the dead WebView underneath

        overlay.addView(new ProgressBar(this));

        TextView label = new TextView(this);
        label.setText("מתחבר מחדש…");
        label.setTextColor(Color.WHITE);
        label.setTextSize(16);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = 32;
        label.setLayoutParams(lp);
        overlay.addView(label);

        addContentView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        reconnectOverlay = overlay;
    }

    private void hideReconnectOverlay() {
        if (reconnectOverlay != null) {
            ViewGroup parent = (ViewGroup) reconnectOverlay.getParent();
            if (parent != null) parent.removeView(reconnectOverlay);
            reconnectOverlay = null;
        }
    }
}
