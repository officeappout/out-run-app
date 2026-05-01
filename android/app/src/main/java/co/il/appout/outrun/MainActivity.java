package co.il.appout.outrun;

import android.os.Build;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
    }
}

