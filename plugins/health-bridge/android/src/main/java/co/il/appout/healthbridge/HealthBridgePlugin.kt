package co.il.appout.healthbridge

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
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
import java.time.ZoneOffset
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

    private val writePermissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
    )

    /**
     * Holds the PluginCall that was parked while the user is inside the
     * Health Connect permission settings screen. Resolved by onAppResumed()
     * (called from the JS App.appStateChange listener) once the app returns
     * to the foreground and we can re-probe the actual grant state.
     */
    @Volatile
    private var savedPermissionsCall: PluginCall? = null

    override fun load() {
        super.load()
        HealthBridgeRegistry.current = this
    }

    override fun handleOnDestroy() {
        // Release any parked call so we don't hold a stale reference.
        savedPermissionsCall?.reject("plugin destroyed")
        savedPermissionsCall = null
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
    override fun requestPermissions(call: PluginCall) {
        // Health Connect only allows permission requests via an
        // ActivityResultContract launched from an Activity. Capacitor 6
        // does not yet ship with a built-in launcher for the new
        // PermissionController.createRequestPermissionResultContract,
        // so we delegate by deep-linking the user into the Health
        // Connect permission settings screen.
        //
        // Unlike the previous implementation (which resolved immediately
        // with denied values), we now PARK the call in `savedPermissionsCall`
        // and resolve it only after the user returns to the foreground.
        // The JS App.appStateChange listener in src/lib/native/init.ts
        // calls our `onAppResumed` PluginMethod, which probes the actual
        // grant state and then resolves this saved call.
        try {
            val ctx = context ?: throw IllegalStateException("no-context")
            // Park the call before leaving the app — must be done before
            // startActivity() to avoid a race where onAppResumed fires
            // before we've stored the reference.
            savedPermissionsCall = call
            // Health Connect 1.1.0-alpha+ removed the static
            // `getHealthConnectSettingsIntent(ctx)` helper. The supported
            // way to open the Health Connect permission/settings screen
            // is to launch an Intent with the action constant.
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            ctx.startActivity(intent)
            // Do NOT resolve here — the call is held open until onAppResumed().
        } catch (e: Exception) {
            savedPermissionsCall = null
            call.reject("requestPermissions failed: ${e.message}", e)
        }
    }

    /**
     * Called by the JS layer (src/lib/native/init.ts) whenever the app
     * returns to the foreground (App.appStateChange → isActive = true).
     *
     * If there is a parked [requestPermissions] call, we re-probe Health
     * Connect for the actual grant state and resolve it now — this is the
     * earliest moment after the user may have toggled permissions in the
     * Health Connect settings screen.
     */
    @PluginMethod
    fun onAppResumed(call: PluginCall) {
        val pending = savedPermissionsCall
        savedPermissionsCall = null

        if (pending == null) {
            // No pending requestPermissions call — nothing to do.
            call.resolve()
            return
        }

        val client = client()
        if (client == null) {
            pending.resolve(JSObject().put("granted", false))
            call.resolve()
            return
        }

        scope.launch {
            try {
                val grantedPerms = client.permissionController.getGrantedPermissions()
                val allGranted = readPermissions.all { grantedPerms.contains(it) }
                pending.resolve(JSObject().put("granted", allGranted))
            } catch (e: Exception) {
                pending.resolve(JSObject().put("granted", false))
            }
            call.resolve()
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

    /**
     * Write a completed workout session to Health Connect.
     *
     * Inserts an ExerciseSessionRecord plus optional
     * TotalCaloriesBurnedRecord and DistanceRecord.
     *
     * JS parameters (mirrors WriteWorkoutOptions in definitions.ts):
     *   workoutType  — HKWorkoutActivityType string
     *   startISO     — ISO-8601 start time
     *   endISO       — ISO-8601 end time
     *   calories     — kcal (integer ≥ 0)
     *   distanceMeters — optional metres (number ≥ 0)
     */
    @PluginMethod
    fun writeWorkout(call: PluginCall) {
        val client = client() ?: run {
            call.reject("Health Connect unavailable")
            return
        }
        val startISO = call.getString("startISO") ?: run { call.reject("startISO required"); return }
        val endISO = call.getString("endISO") ?: run { call.reject("endISO required"); return }
        val workoutType = call.getString("workoutType") ?: "other"
        val calories = call.getInt("calories") ?: 0
        val distanceMeters = call.getDouble("distanceMeters")

        scope.launch {
            try {
                val start = Instant.parse(startISO)
                val end = Instant.parse(endISO)

                val exerciseType = when (workoutType) {
                    "running"                    -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING
                    "walking"                    -> ExerciseSessionRecord.EXERCISE_TYPE_WALKING
                    "cycling"                    -> ExerciseSessionRecord.EXERCISE_TYPE_BIKING
                    "swimming"                   -> ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER
                    "hiking"                     -> ExerciseSessionRecord.EXERCISE_TYPE_HIKING
                    "yoga"                       -> ExerciseSessionRecord.EXERCISE_TYPE_YOGA
                    "traditionalStrengthTraining",
                    "functionalStrengthTraining" -> ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
                    "crossTraining"              -> ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS
                    // alpha07 has no CORE_TRAINING / JUMP_ROPE session types —
                    // map to the closest supported broad session types.
                    "coreTraining"               -> ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS
                    "jumpRope"                   -> ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
                    "stairClimbing"              -> ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE
                    else                         -> ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT
                }

                val recordsToInsert = mutableListOf<androidx.health.connect.client.records.Record>()

                recordsToInsert.add(
                    ExerciseSessionRecord(
                        startTime = start,
                        startZoneOffset = ZoneOffset.UTC,
                        endTime = end,
                        endZoneOffset = ZoneOffset.UTC,
                        exerciseType = exerciseType,
                    )
                )

                if (calories > 0) {
                    recordsToInsert.add(
                        TotalCaloriesBurnedRecord(
                            startTime = start,
                            startZoneOffset = ZoneOffset.UTC,
                            endTime = end,
                            endZoneOffset = ZoneOffset.UTC,
                            energy = Energy.kilocalories(calories.toDouble()),
                        )
                    )
                }

                if (distanceMeters != null && distanceMeters > 0.0) {
                    recordsToInsert.add(
                        DistanceRecord(
                            startTime = start,
                            startZoneOffset = ZoneOffset.UTC,
                            endTime = end,
                            endZoneOffset = ZoneOffset.UTC,
                            distance = Length.meters(distanceMeters),
                        )
                    )
                }

                val response = client.insertRecords(recordsToInsert)
                val out = JSObject()
                out.put("saved", true)
                out.put("uuid", response.recordIdsList.firstOrNull() ?: "")
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("writeWorkout failed: ${e.message}", e)
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
