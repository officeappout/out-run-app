import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // Configure Firebase only once. Guard against missing GoogleService-Info.plist
        // which would otherwise cause a fatal crash in Release/TestFlight builds.
        if FirebaseApp.app() == nil {
            guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
                assertionFailure("[AppDelegate] GoogleService-Info.plist not found in bundle — Firebase not configured.")
                return true
            }
            FirebaseApp.configure()
        }

        // Register for remote notifications so FirebaseMessaging can obtain an
        // APNs token. Without this call the OS never provisions a token and
        // FirebaseMessaging.getToken() hangs indefinitely (no aps-environment →
        // APNs refuses the request silently). UNUserNotificationCenter.delegate
        // must be set BEFORE the app finishes launching per Apple's guidance.
        UNUserNotificationCenter.current().delegate = self
        application.registerForRemoteNotifications()

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Stage 3 Part A — app-scope breadcrumb only. The active
    // CAPBridgeViewController's own didReceiveMemoryWarning does the web-layer
    // notify (it holds the bridge); this hook just logs for crash triage.
    func applicationDidReceiveMemoryWarning(_ application: UIApplication) {
        NSLog("[memory] applicationDidReceiveMemoryWarning")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - APNs + UNUserNotificationCenter delegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Firebase SDK 9+ fails getToken() immediately when apnsToken is nil;
        // setting it here guarantees it's populated even if swizzling races
        // with our delegate. The previous forward to ApplicationDelegateProxy
        // is gone — that overload no longer exists on the current
        // @capacitor/ios (only .application(open:) and .application(continue:)
        // remain; APNs token forwarding isn't part of its proxied surface).
        Messaging.messaging().apnsToken = deviceToken
        NSLog("[push] APNs device token received (%d bytes) — forwarded to FirebaseMessaging", deviceToken.count)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Non-fatal — app runs without push notifications. Previously silent;
        // logging now because the JS side's getToken() retry (push.ts) fails
        // fast with "No APNS token specified" whenever this fires, and with
        // no log here there was no way to tell that error apart from a slow
        // registration (JS-side race) vs. a genuine registration failure
        // (e.g. entitlement/certificate mismatch) without a device console.
        NSLog("[push] Failed to register for remote notifications: %@", error.localizedDescription)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // ApplicationDelegateProxy no longer owns notification routing in the
        // current @capacitor/ios — that moved to CapacitorBridge's own
        // notificationRouter (see CAPBridgeProtocol.swift / CapacitorBridge.swift),
        // which is what actually dispatches to plugins like FirebaseMessaging
        // (NotificationHandlerProtocol conformance). Forward there instead.
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let bridge = bridgeVC.bridge else {
            completionHandler()
            return
        }
        bridge.notificationRouter.userNotificationCenter(
            center, didReceive: response, withCompletionHandler: completionHandler)
    }

}
