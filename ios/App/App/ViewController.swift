import UIKit
import Capacitor

/**
 * Custom bridge view controller that enables WKWebView's built-in
 * back/forward navigation gesture for iOS users.
 *
 * Without this, the SPA runs in a WKWebView where `allowsBackForwardNavigationGestures`
 * defaults to `false`, so the native "swipe from left edge to go back" gesture
 * is disabled. With `true`, iOS handles the gesture by navigating the WebView's
 * history stack — which matches exactly what our `App.addListener('backButton', …)`
 * handler does on Android via `window.history.back()`.
 *
 * Capacitor automatically picks up a `ViewController` subclass of
 * `CAPBridgeViewController` placed in the App target, so no changes
 * to `AppDelegate.swift` are needed.
 */
class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        // Enable swipe-from-left-edge back navigation in the WebView.
        // This mirrors the Android hardware-back behaviour wired in
        // src/lib/native/init.ts (window.history.back / App.minimizeApp).
        webView?.allowsBackForwardNavigationGestures = true

        // Disable the native WKWebView rubber-band / elastic overscroll.
        // CSS `overscroll-behavior: none` cannot fully suppress the bounce
        // at the platform level on iOS, so we turn it off on the underlying
        // UIScrollView. Internal scrollable regions in the web layer keep
        // working — only the viewport-edge bounce is removed.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false

        // Allow all media — including <video autoplay>, <video muted>, and
        // programmatic play() calls — without requiring a prior user gesture.
        // iOS 10+ defaults to `.all`, which blocks the workout player's
        // autoplay loop and the exercise detail video from starting without
        // an explicit tap. Setting to [] mirrors the web/desktop behaviour
        // where muted autoplaying videos work without user interaction.
        webView?.configuration.mediaTypesRequiringUserActionForPlayback = []
    }
}
