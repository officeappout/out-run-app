package co.il.appout.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * HealthBridge — Android / Health Connect implementation.
 *
 * Reads three record types:
 *   • StepsRecord                  → steps
 *   • ActiveCaloriesBurnedRecord   → active kcal
 *   • ExerciseSessionRecord        → active minutes (duration of session)
 *
 * Background sync is implemented via WorkManager: a unique periodic
 * worker (`HealthBridgeWorker`) runs every ~30 minutes and emits a
 * `samplesAvailable` event into the WebView when it finds new records.
 * The web layer (src/lib/healthBridge/init.ts) calls `syncSince()` on
 * receipt and ships samples to the ingestHealthSamples callable.
 *
 * Permissions
 * ───────────
 * Health Connect uses fine-grained per-record permissions. The plugin
 * advertises READ_STEPS, READ_ACTIVE_CALORIES_BURNED, READ_EXERCISE in
 * its AndroidManifest; the host app must replicate these declarations
 * (see plugins/health-bridge/README.md).
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)

    private val readPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    override fun load() {
        super.load()
        HealthBridgeRegistry.current = this
    }

    override fun handleOnDestroy() {
        if (HealthBridgeRegistry.current === this) {
            HealthBridgeRegistry.current = null
        }
        super.handleOnDestroy()
    }

    private fun client(): HealthConnectClient? {
        val ctx: Context = context ?: return null
        return try {
            HealthConnectClient.getOrCreate(ctx)
        } catch (e: Exception) {
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ctx: Context = context ?: run {
            call.resolve(JSObject().put("available", false).put("reason", "no-context"))
            return
        }
        val status = HealthConnectClient.getSdkStatus(ctx)
        val available = status == HealthConnectClient.SDK_AVAILABLE
        val out = JSObject().put("available", available)
        if (!available) {
            out.put("reason", when (status) {
                HealthConnectClient.SDK_UNAVAILABLE -> "sdk-unavailable"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider-update-required"
                else -> "unknown"
            })
        }
        call.resolve(out)
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        val client = client() ?: run {
            call.resolve(JSObject().put("granted", false))
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val ok = readPermissions.all { granted.contains(it) }
                call.resolve(JSObject().put("granted", ok))
            } catch (e: Exception) {
                call.reject("hasPermissions failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        // Health Connect only allows permission requests via an
        // ActivityResultContract launched from an Activity. Capacitor 6
        // does not yet ship with a built-in launcher for the new
        // PermissionController.createRequestPermissionResultContract,
        // so we delegate by deep-linking the user into the Health
        // Connect permission settings screen and asking the WebView to
        // re-call hasPermissions() when the app returns to foreground
        // (handled by the App.appStateChange listener in
        // src/lib/native/init.ts).
        try {
            val ctx = context ?: throw IllegalStateException("no-context")
            val intent = HealthConnectClient.getHealthConnectSettingsIntent(ctx)
            ctx.startActivity(intent)
            // Resolve immediately with empty/denied; the web layer will
            // re-check on resume.
            call.resolve(JSObject().apply {
                put("granted", JSArray())
                put("denied", JSArray().apply {
                    put("steps"); put("activeEnergy"); put("exerciseTime")
                })
            })
        } catch (e: Exception) {
            call.reject("requestPermissions failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun syncSince(call: PluginCall) {
        val client = client() ?: run {
            call.reject("Health Connect unavailable")
            return
        }
        val sinceISO = call.getString("sinceISO")
        val untilISO = call.getString("untilISO")
        val now = Instant.now()
        val start = sinceISO?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?: now.minusSeconds(24L * 3600L)
        val end = untilISO?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: now

        scope.launch {
            try {
                val samples = mutableListOf<JSObject>()

                // Steps
                val steps = client.readRecords(
                    ReadRecordsRequest(
                        recordType = StepsRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    )
                )
                for (r in steps.records) {
                    samples.add(buildSample(
                        uuid = r.metadata.id,
                        startInstant = r.startTime,
                        endInstant = r.endTime,
                        steps = r.count.toInt(),
                        calories = 0,
                        activeMinutes = 0,
                        source = r.metadata.dataOrigin.packageName,
                    ))
                }

                // Active calories
                val cals = client.readRecords(
                    ReadRecordsRequest(
                        recordType = ActiveCaloriesBurnedRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    )
                )
                for (r in cals.records) {
                    samples.add(buildSample(
                        uuid = r.metadata.id,
                        startInstant = r.startTime,
                        endInstant = r.endTime,
                        steps = 0,
                        calories = r.energy.inKilocalories.toInt(),
                        activeMinutes = 0,
                        source = r.metadata.dataOrigin.packageName,
                    ))
                }

                // Exercise sessions → active minutes (duration in minutes)
                val sessions = client.readRecords(
                    ReadRecordsRequest(
                        recordType = ExerciseSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    )
                )
                for (r in sessions.records) {
                    val minutes = ((r.endTime.epochSecond - r.startTime.epochSecond) / 60L).toInt()
                    samples.add(buildSample(
                        uuid = r.metadata.id,
                        startInstant = r.startTime,
                        endInstant = r.endTime,
                        steps = 0,
                        calories = 0,
                        activeMinutes = if (minutes > 0) minutes else 0,
                        source = r.metadata.dataOrigin.packageName,
                    ))
                }

                val arr = JSArray()
                for (s in samples) arr.put(s)
                val out = JSObject()
                out.put("samples", arr)
                out.put("cursorISO", DateTimeFormatter.ISO_INSTANT.format(end))
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("syncSince failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun enableBackgroundDelivery(call: PluginCall) {
        val ctx = context ?: run { call.reject("no-context"); return }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val req = PeriodicWorkRequestBuilder<HealthBridgeWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            "outrun-healthbridge-poll",
            ExistingPeriodicWorkPolicy.UPDATE,
            req,
        )
        call.resolve()
    }

    @PluginMethod
    fun disableBackgroundDelivery(call: PluginCall) {
        val ctx = context ?: run { call.resolve(); return }
        WorkManager.getInstance(ctx).cancelUniqueWork("outrun-healthbridge-poll")
        call.resolve()
    }

    private fun buildSample(
        uuid: String,
        startInstant: Instant,
        endInstant: Instant,
        steps: Int,
        calories: Int,
        activeMinutes: Int,
        source: String?,
    ): JSObject {
        val date = LocalDate.ofInstant(startInstant, ZoneId.systemDefault()).toString()
        val obj = JSObject()
        obj.put("sampleUUID", uuid)
        obj.put("startISO", DateTimeFormatter.ISO_INSTANT.format(startInstant))
        obj.put("endISO", DateTimeFormatter.ISO_INSTANT.format(endInstant))
        obj.put("date", date)
        obj.put("steps", steps)
        obj.put("calories", calories)
        obj.put("activeMinutes", activeMinutes)
        if (source != null) obj.put("source", source)
        return obj
    }

    /**
     * Public hook used by HealthBridgeWorker to wake the WebView and
     * say "new samples are available — please call syncSince()".
     */
    internal fun emitSamplesAvailable(reason: String) {
        val data = JSObject()
        data.put("reason", reason)
        data.put("cursorISO", DateTimeFormatter.ISO_INSTANT.format(Instant.now()))
        notifyListeners("samplesAvailable", data)
    }
}
