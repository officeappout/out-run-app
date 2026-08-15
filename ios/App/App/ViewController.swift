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
 * bypass our `App.addListener('backButton', …)` handler on Android entirely.
 * `WebContentRecoveryProxy`'s `decidePolicyFor` override below closes that gap
 * for the route guards that matter, mirroring Android's `backButton` handler
 * in `src/lib/native/init.ts` exactly — including its
 * `WORKOUT_EXIT_HARD_BLOCK_ENABLED` flag gate:
 *
 *   • FLAG OFF (legacy, previously shipped behaviour) — on `/active` /
 *     `/workout-builder`, cancel the edge-swipe-back navigation AND dispatch
 *     the `nativeBackInWorkout` window event so `ExitConfirmModal` opens
 *     (same as Android). `/map` is never touched.
 *   • FLAG ON (product-decision reversal, 12.08.2026) — silently cancel the
 *     navigation with NO event dispatch on `/active` / `/workout-builder`
 *     (no popup — the gesture feels like nothing happened), AND extend the
 *     same silent cancel to `/map` while a native-mirrored flag says an
 *     aerobic (running/walking/hybrid) session is currently active/paused.
 *     Plain map browsing is never blocked.
 *
 *   • RECOVERY_VIDEO_EXIT_BUTTON_ENABLED (checked FIRST, before either branch
 *     above, on `/active` / `/workout-builder` only) — when a native-mirrored
 *     flag says the current session is a pure recovery-video-trio eligible
 *     for the new no-confirmation exit button, cancel the edge-swipe-back
 *     navigation and dispatch a NEW, distinctly-named `nativeBackRecoveryExit`
 *     window event instead — a genuinely separate, no-save termination path
 *     that never dispatches `nativeBackInWorkout` and never falls through to
 *     the `WORKOUT_EXIT_HARD_BLOCK_ENABLED` branches above. Mirrors Android's
 *     equally-first check in `src/lib/native/init.ts`. See
 *     `src/config/feature-flags.ts` for the full writeup.
 *
 * `decidePolicyFor` is native Swift with no JS bridge round-trip available at
 * decision time, so it cannot read `useSessionStore` or `feature-flags.ts`
 * directly. All three flags are mirrored from JS into `@capacitor/preferences`
 * by `WorkoutExitGuardTracker` (`src/components/system/WorkoutExitGuardTracker.tsx`,
 * mounted in `NativeBootstrap`) and read back here directly + synchronously
 * from the underlying `UserDefaults` storage — see
 * `readNativeFlag(_:)` below and `src/lib/native/workoutExitGuard.ts` for the
 * full mechanism writeup (confirmed by reading the installed plugin source at
 * `node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/`).
 * A missing/unreadable key reads as `false` for all three flags — the
 * fail-open direction (legacy behaviour / no `/map` block / no recovery-video
 * no-confirmation exit), never fail-closed.
 *
 * ⚠️ This Swift file's behaviour, once this specific code change ships, is
 * gated at RUNTIME by the Preferences-mirrored flag — but the CODE ITSELF
 * (this decidePolicyFor override) still requires its own one-time Xcode
 * rebuild + TestFlight build to exist on-device at all. Before that build
 * ships, no flag value has any effect on iOS.
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
                onNativeBackInWorkout: { [weak self] in self?.notifyNativeBackInWorkout() },
                onNativeBackRecoveryExit: { [weak self] in self?.notifyNativeBackRecoveryExit() }
            )
            recoveryProxy = proxy                 // strong retain — navigationDelegate is weak
            webView.navigationDelegate = proxy
        }
    }

    // MARK: - Workout exit-guard parity (iOS swipe-back ↔ Android back-button)

    /// LEGACY PATH ONLY — called from `WebContentRecoveryProxy.decidePolicyFor`
    /// only when `WORKOUT_EXIT_HARD_BLOCK_ENABLED` reads `false`. Mirrors
    /// Android's flag-off branch in `src/lib/native/init.ts`: dispatch the
    /// `nativeBackInWorkout` window event so `StrengthRunner` opens
    /// `ExitConfirmModal` instead of silently discarding an in-progress
    /// workout. When the flag reads `true`, `decidePolicyFor` cancels the
    /// navigation directly WITHOUT calling this — see the class doc comment.
    fileprivate func notifyNativeBackInWorkout() {
        NSLog("[nav] intercepted back-forward swipe on active-workout route — dispatching nativeBackInWorkout")
        bridge?.triggerWindowJSEvent(eventName: "nativeBackInWorkout")
    }

    /// RECOVERY_VIDEO_EXIT_BUTTON_ENABLED — called from
    /// `WebContentRecoveryProxy.decidePolicyFor` FIRST, before the
    /// `hardBlockEnabled` check, whenever `recoveryVideoExitActivePrefKey`
    /// reads `true` (mirrors Android's equally-first check in
    /// `src/lib/native/init.ts`). Dispatches a NEW, distinctly-named window
    /// event — 'nativeBackRecoveryExit' — so active/page.tsx's
    /// handleRecoveryVideoExit runs: a genuinely separate, no-confirmation,
    /// no-save termination path that never dispatches `nativeBackInWorkout`
    /// and is never followed by a call to `notifyNativeBackInWorkout` above.
    /// See the class doc comment for the full priority order.
    fileprivate func notifyNativeBackRecoveryExit() {
        NSLog("[nav] intercepted back-forward swipe on recovery-video-trio session — dispatching nativeBackRecoveryExit")
        bridge?.triggerWindowJSEvent(eventName: "nativeBackRecoveryExit")
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
/// on active-workout routes — FIRST for RECOVERY_VIDEO_EXIT_BUTTON_ENABLED,
/// then, when `WORKOUT_EXIT_HARD_BLOCK_ENABLED` (mirrored via
/// `readNativeFlag`) is on, also on `/map` while an aerobic session is active
/// — see the class doc comment on `ViewController` for the full flag-gated
/// behaviour). Every other decidePolicyFor call is forwarded to Capacitor
/// unchanged, so its plugin overrides / `allowedNavigation` allowlist /
/// external-link handling are fully preserved.
/// Do NOT hand the raw VC to `navigationDelegate` — that would drop Capacitor's
/// nav policy / `allowNavigation` allowlist.
final class WebContentRecoveryProxy: NSObject, WKNavigationDelegate {
    /// Strong — once we become the (weak) navigationDelegate nothing else
    /// retains Capacitor's handler.
    private let capacitor: WKNavigationDelegate
    private let onTerminate: (WKWebView) -> Void
    private let onFinish: () -> Void
    private let onNativeBackInWorkout: () -> Void
    private let onNativeBackRecoveryExit: () -> Void

    // MARK: - Native-readable flags (Capacitor Preferences mirror)
    //
    // `@capacitor/preferences` stores every key as a plain string in
    // `UserDefaults.standard`, prefixed with the plugin's default group name
    // — confirmed by reading the installed plugin source at
    // `node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/
    // Preferences.swift`: `prefix = "CapacitorStorage."`, no encryption, no
    // async I/O. Keep these three string literals in sync with
    // `src/lib/native/workoutExitGuard.ts`.
    private let capacitorPreferencesPrefix = "CapacitorStorage."
    private let exitHardBlockPrefKey = "workout_exit_hard_block_enabled"
    private let aerobicSessionActivePrefKey = "aerobic_session_active"
    private let recoveryVideoExitActivePrefKey = "recovery_video_exit_active"

    /// Reads a boolean flag written by `WorkoutExitGuardTracker` via
    /// `@capacitor/preferences`. A missing/unreadable key (fresh install,
    /// plugin write never landed) reads as `false` — the fail-open direction
    /// for all three flags (legacy behaviour / no `/map` block / no
    /// recovery-video no-confirmation exit), never fail-closed.
    private func readNativeFlag(_ key: String) -> Bool {
        UserDefaults.standard.string(forKey: capacitorPreferencesPrefix + key) == "1"
    }

    init(capacitor: WKNavigationDelegate,
         onTerminate: @escaping (WKWebView) -> Void,
         onFinish: @escaping () -> Void,
         onNativeBackInWorkout: @escaping () -> Void,
         onNativeBackRecoveryExit: @escaping () -> Void) {
        self.capacitor = capacitor
        self.onTerminate = onTerminate
        self.onFinish = onFinish
        self.onNativeBackInWorkout = onNativeBackInWorkout
        self.onNativeBackRecoveryExit = onNativeBackRecoveryExit
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
    // CURRENTLY on a guarded route — checked against the route being left
    // (`webView.url`), not the back-forward destination. Mirrors
    // `src/lib/native/init.ts`'s Android `backButton` handler exactly,
    // including its `WORKOUT_EXIT_HARD_BLOCK_ENABLED` flag gate (see the
    // class doc comment on `ViewController` for the full behaviour table).
    // Every other case — a different route, or a navigationType that isn't
    // `.backForward` (link taps, JS `location` changes, form submits, the
    // SPA's own `pushState` navigations, etc.) — falls through to
    // Capacitor's own decidePolicyFor unchanged.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.navigationType == .backForward,
              let currentPath = webView.url?.path else {
            capacitor.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
            return
        }

        // RECOVERY_VIDEO_EXIT_BUTTON_ENABLED — checked FIRST, before
        // hardBlockEnabled below. Mirrors Android's equally-first check in
        // src/lib/native/init.ts. A genuinely separate, no-confirmation,
        // no-save termination path (active/page.tsx's handleRecoveryVideoExit,
        // via the 'nativeBackRecoveryExit' event) — never falls through to
        // the hardBlockEnabled / legacy-modal logic below.
        if (currentPath.contains("/active") || currentPath.contains("/workout-builder")),
           readNativeFlag(recoveryVideoExitActivePrefKey) {
            onNativeBackRecoveryExit()
            decisionHandler(.cancel)
            return
        }

        let hardBlockEnabled = readNativeFlag(exitHardBlockPrefKey)

        if currentPath.contains("/active") || currentPath.contains("/workout-builder") {
            if hardBlockEnabled {
                // Product-decision reversal: silently absorb — no event, no
                // popup. The gesture must feel like nothing happened.
                decisionHandler(.cancel)
            } else {
                // Legacy (flag off): preserve the previously shipped
                // confirm-modal behaviour byte-for-byte.
                onNativeBackInWorkout()
                decisionHandler(.cancel)
            }
            return
        }

        // /map extension — ONLY while the hard-block flag is on AND a
        // native-mirrored flag says an aerobic session is currently
        // active/paused. Plain map browsing (or the flag mechanism being
        // unavailable/unreadable) falls through to Capacitor's default
        // handling unchanged — fail-open toward normal behaviour, never
        // fail-closed toward blocking ordinary map navigation.
        if hardBlockEnabled, currentPath.contains("/map"),
           readNativeFlag(aerobicSessionActivePrefKey) {
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
