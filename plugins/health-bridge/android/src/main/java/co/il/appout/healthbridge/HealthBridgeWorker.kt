package co.il.appout.healthbridge

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Periodic worker installed by `HealthBridgePlugin.enableBackgroundDelivery`.
 *
 * The worker itself does not push samples to Firebase — it cannot,
 * because Firebase Auth and App Check tokens live in the WebView's
 * IndexedDB / local storage. Instead, it fires a `samplesAvailable`
 * event the next time the WebView is alive (foreground or recently
 * cached service worker). When the user opens the app, the `App.appStateChange`
 * listener (src/lib/native/init.ts) calls `healthBridgeSyncNow()`
 * which drains everything since the last cursor.
 *
 * For users who keep the app pinned in the background (most fitness
 * users), this is enough to keep the rings near-live. For users who
 * cold-launch only occasionally, the catch-up sync on launch handles
 * the gap.
 */
class HealthBridgeWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        // The cleanest way to "wake" the WebView is to leave a marker
        // for the plugin singleton to pick up the next time the bridge
        // attaches. We rely on the catch-up sync triggered by
        // App.appStateChange:active (see src/lib/native/init.ts).
        //
        // If the WebView is currently attached, notifyListeners() will
        // fire immediately; if not, the event is dropped and the
        // foreground sync covers the gap.
        try {
            HealthBridgeRegistry.notifySamplesAvailable("background")
        } catch (_: Throwable) {
            // never fail the worker — health data is non-critical and
            // we don't want WorkManager to mark this job as failed.
        }
        return Result.success()
    }
}

/**
 * Static registry that lets HealthBridgeWorker reach the active plugin
 * instance without holding an Activity reference.
 */
object HealthBridgeRegistry {
    @Volatile var current: HealthBridgePlugin? = null

    fun notifySamplesAvailable(reason: String) {
        current?.emitSamplesAvailable(reason)
    }
}
