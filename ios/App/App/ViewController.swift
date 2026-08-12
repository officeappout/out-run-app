import UIKit
import Capacitor
import WebKit

/**
 * Custom bridge view controller that enables WKWebView's built-in
 * back/forward navigation gesture for iOS users.
 *
 * Without this, the SPA runs in a WKWebView where `allowsBackForwardNavigationGestures`
 * defaults to `false`, so the native "swipe from left edge to go back" gesture
 * is disabled. With `true`, iOS handles the gesture by navigating the WebView's
 * history stack directly — on its own that does NOT run any JS, so it used to
 * bypass our `App.addListener('backButton', …)` handler on Android entirely
 * (that handler dispatches `window.history.back()`, or the `nativeBackInWorkout`
 * event on `/active` and `/workout-builder` routes so `ExitConfirmModal` can
 * intercept it). `WebContentRecoveryProxy`'s `decidePolicyFor` override below
 * closes that gap for the route guard that matters: it intercepts the
 * edge-swipe-back gesture while on an active-workout route and dispatches the
 * same `nativeBackInWorkout` event Android's handler dispatches, so the exit
 * confirmation opens on both platforms instead of only Android.
 *
 * Capacitor automatically picks up a `ViewController` subclass of
 * `CAPBridgeViewController` placed in the App target, so no changes
 * to `AppDelegate.swift` are needed.
 */
class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Heat investigation diagnostic (11.08.2026) — see MARK section below.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(thermalStateDidChange),
            name: ProcessInfo.thermalStateDidChangeNotification,
            object: nil
        )
        // NOT seeded here: at viewDidLoad time the WKWebView's JS context doesn't exist
        // yet (window.Capacitor isn't defined), so triggerWindowJSEvent would silently
        // no-op (Capacitor logs the eval failure, doesn't crash). The real baseline seed
        // is in onWebContentRecovered() below, which already fires on the first
        // successful navigation finish — the actual "web content is ready" signal.

        // Enable swipe-from-left-edge back navigation in the WebView.
        // This mirrors the Android hardware-back behaviour wired in
        // src/lib/native/init.ts (window.history.back / App.minimizeApp).
        // The active-workout route guard (nativeBackInWorkout) is enforced
        // separately below, by WebContentRecoveryProxy.decidePolicyFor.
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

        // Stage 3 Part B — install the web-content recovery proxy. Capacitor has
        // already assigned its own WebViewDelegationHandler as `navigationDelegate`
        // (in loadView, before viewDidLoad). We wrap it: forward every call to
        // Capacitor unchanged, and override ONLY the terminate callback to replace
        // Capacitor's silent immediate reload() with a backed-off recovery +
        // "Reconnecting…" screen — the crash-loop breaker.
        if let webView = webView, let capacitorDelegate = webView.navigationDelegate {
            let proxy = WebContentRecoveryProxy(
                capacitor: capacitorDelegate,
                onTerminate: { [weak self] wv in self?.recoverWebContent(wv) },
                onFinish: { [weak self] in self?.onWebContentRecovered() },
                onNativeBackInWorkout: { [weak self] in self?.notifyNativeBackInWorkout() }
            )
            recoveryProxy = proxy                 // strong retain — navigationDelegate is weak
            webView.navigationDelegate = proxy
        }
    }

    // MARK: - Workout exit-guard parity (iOS swipe-back ↔ Android back-button)

    /// Mirrors Android's `App.addListener('backButton', …)` route guard in
    /// `src/lib/native/init.ts`: dispatch the same `nativeBackInWorkout`
    /// window event so `StrengthRunner` opens `ExitConfirmModal` instead of
    /// silently discarding an in-progress workout. Called from
    /// `WebContentRecoveryProxy.decidePolicyFor` after it cancels an
    /// edge-swipe-back navigation while the SPA is on an active-workout route.
    fileprivate func notifyNativeBackInWorkout() {
        NSLog("[nav] intercepted back-forward swipe on active-workout route — dispatching nativeBackInWorkout")
        bridge?.triggerWindowJSEvent(eventName: "nativeBackInWorkout")
    }

    // MARK: - Stage 3 Part A — proactive memory shed (best-effort)

    /// Forward the HOST process's memory warning to the web layer so it can drop
    /// map markers/tiles before pressure becomes a web-content OOM.
    /// NOTE: the WKWebView web-content runs in a SEPARATE process that iOS
    /// jetsams independently, so this host warning often does NOT fire for the
    /// real web-content OOM. Part B (`webViewWebContentProcessDidTerminate`) is
    /// the reliable crash-loop breaker; this is only a cheap early shed.
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        NSLog("[memory] host didReceiveMemoryWarning → notifying web layer")
        bridge?.triggerWindowJSEvent(eventName: "memoryWarning")
    }

    // MARK: - Heat investigation — real thermal-state diagnostic (11.08.2026)

    /// Forwards iOS's actual `ProcessInfo.thermalState` to the web layer — an OBJECTIVE
    /// signal for the map-heat investigation, instead of inferring heat indirectly from
    /// workload (log volume, operation timing). Diagnostic only: unlike the memory-warning
    /// signal above, nothing currently sheds behavior on this — it exists so a real number
    /// (nominal/fair/serious/critical, the same tiers iOS itself uses to throttle the CPU/
    /// GPU) shows up in the console instead of relying on "does the phone feel hot."
    /// Safe to remove once the investigation is done.
    @objc private func thermalStateDidChange() {
        notifyThermalState()
    }

    private func notifyThermalState() {
        let level: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: level = "nominal"
        case .fair: level = "fair"
        case .serious: level = "serious"
        case .critical: level = "critical"
        @unknown default: level = "unknown"
        }
        NSLog("[thermal] state=%@", level)
        bridge?.triggerWindowJSEvent(eventName: "thermalStateChanged", data: "{\"state\":\"\(level)\"}")
    }

    // MARK: - Stage 3 Part B — web-content OOM recovery (the loop-breaker)

    /// Strong ref to the recovery proxy — `navigationDelegate` is weak, so once
    /// we install the proxy nothing else keeps it (or Capacitor's handler) alive.
    private var recoveryProxy: WebContentRecoveryProxy?
    /// Full-screen "Reconnecting…" overlay shown during a backed-off reload.
    private var reconnectOverlay: UIView?
    /// Escalating delay before each recovery reload; reset on a successful load.
    private var terminateBackoff: TimeInterval = 1.0
    private let maxTerminateBackoff: TimeInterval = 30.0

    /// Called (instead of Capacitor's immediate reload) when the web-content
    /// process is terminated. Shows the overlay and reloads after a back-off so a
    /// persistent OOM can't spin a tight reload→OOM→reload crash loop.
    fileprivate func recoverWebContent(_ webView: WKWebView) {
        NSLog("[oom] web-content process terminated — recovering in %.0fs", terminateBackoff)
        showReconnectOverlay()
        let delay = terminateBackoff
        terminateBackoff = min(terminateBackoff * 2, maxTerminateBackoff)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak webView] in
            webView?.reload()
        }
    }

    /// A navigation finished successfully → we're healthy again: clear the
    /// overlay and reset the back-off.
    fileprivate func onWebContentRecovered() {
        terminateBackoff = 1.0
        hideReconnectOverlay()
        // Real baseline seed for the thermal-state diagnostic (see the MARK section
        // above): this is the first point where window.Capacitor actually exists in
        // the WebView's JS context, so it's the correct place to seed — not
        // viewDidLoad. Also harmlessly re-fires on later recoveries/reloads.
        notifyThermalState()
    }

    private func showReconnectOverlay() {
        guard reconnectOverlay == nil, isViewLoaded else { return }
        let overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor(white: 0.07, alpha: 1.0)

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = .white
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()

        let label = UILabel()
        label.text = "מתחבר מחדש…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        overlay.addSubview(spinner)
        overlay.addSubview(label)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: overlay.centerYAnchor, constant: -14),
            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
        ])
        view.addSubview(overlay)
        reconnectOverlay = overlay
    }

    private func hideReconnectOverlay() {
        reconnectOverlay?.removeFromSuperview()
        reconnectOverlay = nil
    }
}

// MARK: - Stage 3 Part B — navigation-delegate forwarding proxy

/// Wraps Capacitor's `WebViewDelegationHandler` (the real `WKNavigationDelegate`).
/// Forwards EVERY delegate call to Capacitor unchanged via ObjC message
/// forwarding, and overrides only three: `webViewWebContentProcessDidTerminate`
/// (replace the silent reload with a backed-off recovery), `didFinish`
/// (observe success to clear the overlay / reset back-off, then forward), and
/// `decidePolicyFor navigationAction` (intercept the edge-swipe-back gesture
/// while on an active-workout route and dispatch `nativeBackInWorkout` instead
/// of letting WKWebView silently pop history — see `notifyNativeBackInWorkout`
/// on `ViewController`). Every other decidePolicyFor call is forwarded to
/// Capacitor unchanged, so its plugin overrides / `allowedNavigation`
/// allowlist / external-link handling are fully preserved.
/// Do NOT hand the raw VC to `navigationDelegate` — that would drop Capacitor's
/// nav policy / `allowNavigation` allowlist.
final class WebContentRecoveryProxy: NSObject, WKNavigationDelegate {
    /// Strong — once we become the (weak) navigationDelegate nothing else
    /// retains Capacitor's handler.
    private let capacitor: WKNavigationDelegate
    private let onTerminate: (WKWebView) -> Void
    private let onFinish: () -> Void
    private let onNativeBackInWorkout: () -> Void

    init(capacitor: WKNavigationDelegate,
         onTerminate: @escaping (WKWebView) -> Void,
         onFinish: @escaping () -> Void,
         onNativeBackInWorkout: @escaping () -> Void) {
        self.capacitor = capacitor
        self.onTerminate = onTerminate
        self.onFinish = onFinish
        self.onNativeBackInWorkout = onNativeBackInWorkout
        super.init()
    }

    // Replaced: recover with back-off instead of Capacitor's immediate reload().
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        onTerminate(webView)
    }

    // Observed, then forwarded: a successful load means we've recovered.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onFinish()
        capacitor.webView?(webView, didFinish: navigation)
    }

    // Intercepted only for the back/forward gesture (edge-swipe or the
    // programmatic goBack()/goForward() it drives) while the SPA is
    // CURRENTLY on an active-workout route — mirrors the `/active` and
    // `/workout-builder` substring check in `src/lib/native/init.ts`'s
    // Android `backButton` handler exactly, checked against the route being
    // left (`webView.url`), not the back-forward destination. Every other
    // case — a different route, or a navigationType that isn't
    // `.backForward` (link taps, JS `location` changes, form submits, the
    // SPA's own `pushState` navigations, etc.) — falls through to
    // Capacitor's own decidePolicyFor unchanged.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .backForward,
           let currentPath = webView.url?.path,
           currentPath.contains("/active") || currentPath.contains("/workout-builder") {
            onNativeBackInWorkout()
            decisionHandler(.cancel)
            return
        }
        capacitor.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }

    // Everything else → Capacitor, via ObjC message forwarding.
    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return capacitor.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        return capacitor.responds(to: aSelector) ? capacitor : super.forwardingTarget(for: aSelector)
    }
}
