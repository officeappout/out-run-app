package co.il.appout.healthbridge

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
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
import com.getcapacitor.annotation.ActivityCallback
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

private const val TAG = "HealthBridge"

/**
 * HealthBridge — Android / Health Connect implementation.
 *
 * Reads four record types:
 *   • StepsRecord                  → steps
 *   • ActiveCaloriesBurnedRecord   → active kcal
 *   • ExerciseSessionRecord        → active minutes (duration of session)
 *   • DistanceRecord                → distance (metres)
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
 *
 * requestPermissions() launches the real Health Connect grant screen via
 * PermissionController.createRequestPermissionResultContract() — the
 * documented first-time consent flow (a per-app "Allow access" dialog
 * scoped to the requested permissions). It does NOT deep-link to
 * ACTION_HEALTH_CONNECT_SETTINGS: that intent only opens the general
 * Health Connect app home/management screen and is not a request flow —
 * an app that has never called the permission contract may not even be
 * listed there, which left users with no clear action to take.
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)

    private val readPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        // Without this, Health Connect enforces its own ~30-day read-back
        // ceiling regardless of the TimeRangeFilter requested in
        // syncSince() — declaring it in the manifest alone isn't enough,
        // it must also be part of the actually-requested grant set.
        // Raw string, not HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
        // — that named constant doesn't exist in connect-client
        // 1.1.0-alpha07 (verified: javap on the actual AAR only shows
        // PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND, no _HISTORY variant;
        // upgrading to a client version that has it requires AGP 8.9.1+,
        // this project is pinned to 8.2.1 — see build.gradle comment).
        // The permission-request contract takes a plain Set<String>, so the
        // exact platform permission string works the same as a named
        // constant would — this is the same string already declared in
        // both AndroidManifest.xml files.
        "android.permission.health.READ_HEALTH_DATA_HISTORY",
    )

    private val writePermissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
    )

    /**
     * Everything requestPermissions() asks for in one grant screen. Must
     * include writePermissions too — the OS contract only grants exactly
     * the permission set passed as input, unlike the old deep-link-to-
     * settings approach which could incidentally surface every permission
     * declared in the manifest. Without this, writeWorkout() (saving
     * completed workouts back to Health Connect) would silently have no
     * grant to work with.
     */
    private val requestedPermissions = readPermissions + writePermissions

    /** The documented Health Connect first-time consent flow (see class doc above). */
    private val requestPermissionsContract = PermissionController.createRequestPermissionResultContract()

    /**
     * Last permission-grant state we observed, used only to decide whether
     * onAppResumed() needs to emit a `permissionsChanged` event (avoids
     * spamming the WebView on every foreground resume when nothing changed).
     */
    @Volatile
    private var lastKnownGranted: Boolean? = null

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
            Log.w(TAG, "isAvailable: no context")
            call.resolve(JSObject().put("available", false).put("reason", "no-context"))
            return
        }
        val status = HealthConnectClient.getSdkStatus(ctx)
        val available = status == HealthConnectClient.SDK_AVAILABLE
        val out = JSObject().put("available", available)
        if (!available) {
            val reason = when (status) {
                HealthConnectClient.SDK_UNAVAILABLE -> "sdk-unavailable"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider-update-required"
                else -> "unknown"
            }
            out.put("reason", reason)
            Log.i(TAG, "isAvailable: false (reason=$reason)")
        } else {
            Log.d(TAG, "isAvailable: true")
        }
        call.resolve(out)
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        val client = client() ?: run {
            Log.w(TAG, "hasPermissions: no Health Connect client")
            call.resolve(JSObject().put("granted", false))
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val ok = readPermissions.all { granted.contains(it) }
                Log.d(TAG, "hasPermissions: granted=$ok")
                call.resolve(JSObject().put("granted", ok))
            } catch (e: Exception) {
                Log.e(TAG, "hasPermissions: probe failed: ${e.message}", e)
                call.reject("hasPermissions failed: ${e.message}", e)
            }
        }
    }

    /**
     * Launches the real Health Connect "Allow access" grant screen for
     * [readPermissions] via [requestPermissionsContract]. Resolves
     * synchronously from [handlePermissionsResult] once the user responds —
     * no parking, no polling, no client-side timeout needed, because the
     * ActivityResultContract round-trip is a normal Android
     * startActivityForResult() call that always returns a result (including
     * on back-press/dismiss, which parseResult() reports as an empty set).
     */
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val ctx = context ?: run {
            Log.e(TAG, "requestPermissions: no context")
            call.reject("requestPermissions failed: no-context")
            return
        }
        val status = HealthConnectClient.getSdkStatus(ctx)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            val reason = when (status) {
                HealthConnectClient.SDK_UNAVAILABLE -> "sdk-unavailable"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider-update-required"
                else -> "unknown"
            }
            // Health Connect isn't usable yet (not installed on Android <14,
            // or provider needs an update) — resolve with a reason the JS
            // layer already knows how to turn into an install-prompt UI
            // (see checkHealthAvailability() in src/lib/healthBridge/init.ts),
            // instead of launching a grant screen that would crash or no-op.
            Log.i(TAG, "requestPermissions: Health Connect unavailable (reason=$reason) — no dialog shown")
            call.resolve(JSObject().put("granted", false).put("reason", reason))
            return
        }
        try {
            Log.d(TAG, "requestPermissions: launching Health Connect grant screen (${requestedPermissions.size} permissions requested)")
            val intent = requestPermissionsContract.createIntent(ctx, requestedPermissions)
            startActivityForResult(call, intent, "handlePermissionsResult")
        } catch (e: Exception) {
            Log.e(TAG, "requestPermissions: failed to launch grant screen: ${e.message}", e)
            call.reject("requestPermissions failed: ${e.message}", e)
        }
    }

    /**
     * ActivityResultContract callback for [requestPermissions]. Capacitor
     * invokes this once the Health Connect grant screen returns a result
     * (granted, denied, or dismissed — all three come back through here;
     * there is no separate "dismissed" outcome to handle).
     */
    @ActivityCallback
    private fun handlePermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) {
            // Process death while the grant screen was open — Capacitor
            // could not restore the saved call. Nothing to resolve.
            Log.w(TAG, "handlePermissionsResult: saved call missing (process death?)")
            return
        }
        try {
            val granted = requestPermissionsContract.parseResult(result.resultCode, result.data)
            // "granted" (the boolean the JS layer gates sync/UI on) reflects
            // read access only — write access (workout logging) is best-effort
            // and never blocks the connect flow, matching writeWorkoutToHealth()'s
            // existing "non-critical" handling on the JS side.
            val allGranted = readPermissions.all { granted.contains(it) }
            lastKnownGranted = allGranted
            Log.i(TAG, "handlePermissionsResult: readGranted=$allGranted, total=${granted.size}/${requestedPermissions.size} of requested permissions allowed")
            call.resolve(JSObject().put("granted", allGranted))
        } catch (e: Exception) {
            Log.e(TAG, "handlePermissionsResult: failed to parse activity result: ${e.message}", e)
            call.reject("permission result parse failed: ${e.message}", e)
        }
    }

    /**
     * Called by the JS layer (src/lib/native/init.ts) whenever the app
     * returns to the foreground (App.appStateChange → isActive = true).
     *
     * Does NOT gate [requestPermissions] anymore — that resolves directly
     * from [handlePermissionsResult]. This re-probes the actual Health
     * Connect grant state and emits a `permissionsChanged` event only when
     * it differs from what we last observed, covering the case where the
     * user revoked or granted permissions from the OS Health Connect
     * settings screen directly (outside our request flow) while the app
     * was backgrounded.
     */
    @PluginMethod
    fun onAppResumed(call: PluginCall) {
        val client = client()
        if (client == null) {
            call.resolve()
            return
        }
        scope.launch {
            try {
                val grantedPerms = client.permissionController.getGrantedPermissions()
                val allGranted = readPermissions.all { grantedPerms.contains(it) }
                if (allGranted != lastKnownGranted) {
                    Log.i(TAG, "onAppResumed: permission state changed → granted=$allGranted")
                    lastKnownGranted = allGranted
                    notifyListeners("permissionsChanged", JSObject().put("granted", allGranted))
                }
            } catch (e: Exception) {
                Log.w(TAG, "onAppResumed: re-probe failed: ${e.message}")
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
                // Tracks the latest record startTime actually returned, across
                // all three record types combined — mirrors the iOS fix
                // (HealthBridgePlugin.swift syncSince): a single combined max,
                // not per-type, so a lagging type can't orphan its own gap on
                // the next sync.
                var maxSampleTime: Instant? = null

                // Steps — ReadRecordsRequest's default pageSize is 1000
                // (undocumented in this file, inherited from the SDK) with no
                // pagination previously implemented: a 90-day backfill with
                // dense sampling silently returned only the first page and
                // dropped the rest, permanently, because cursorISO was always
                // stamped from `end` ("now") regardless of what was actually
                // fetched — the exact bug class fixed on iOS
                // (HKObjectQueryNoLimit + real-max-date cursor). Loop pageToken
                // until exhausted instead of reading one page and stopping.
                var stepsPageToken: String? = null
                do {
                    val stepsPage = client.readRecords(
                        ReadRecordsRequest(
                            recordType = StepsRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            pageToken = stepsPageToken,
                        )
                    )
                    for (r in stepsPage.records) {
                        samples.add(buildSample(
                            uuid = r.metadata.id,
                            startInstant = r.startTime,
                            endInstant = r.endTime,
                            steps = r.count.toInt(),
                            calories = 0,
                            activeMinutes = 0,
                            source = r.metadata.dataOrigin.packageName,
                        ))
                        if (maxSampleTime == null || r.startTime.isAfter(maxSampleTime)) {
                            maxSampleTime = r.startTime
                        }
                    }
                    stepsPageToken = stepsPage.pageToken
                } while (stepsPageToken != null)

                // Active calories — same pagination fix.
                var calsPageToken: String? = null
                do {
                    val calsPage = client.readRecords(
                        ReadRecordsRequest(
                            recordType = ActiveCaloriesBurnedRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            pageToken = calsPageToken,
                        )
                    )
                    for (r in calsPage.records) {
                        samples.add(buildSample(
                            uuid = r.metadata.id,
                            startInstant = r.startTime,
                            endInstant = r.endTime,
                            steps = 0,
                            calories = r.energy.inKilocalories.toInt(),
                            activeMinutes = 0,
                            source = r.metadata.dataOrigin.packageName,
                        ))
                        if (maxSampleTime == null || r.startTime.isAfter(maxSampleTime)) {
                            maxSampleTime = r.startTime
                        }
                    }
                    calsPageToken = calsPage.pageToken
                } while (calsPageToken != null)

                // Exercise sessions → active minutes (duration in minutes) —
                // same pagination fix.
                var sessionsPageToken: String? = null
                do {
                    val sessionsPage = client.readRecords(
                        ReadRecordsRequest(
                            recordType = ExerciseSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            pageToken = sessionsPageToken,
                        )
                    )
                    for (r in sessionsPage.records) {
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
                        if (maxSampleTime == null || r.startTime.isAfter(maxSampleTime)) {
                            maxSampleTime = r.startTime
                        }
                    }
                    sessionsPageToken = sessionsPage.pageToken
                } while (sessionsPageToken != null)

                // Distance (walking/running) — same pagination fix.
                var distancePageToken: String? = null
                do {
                    val distancePage = client.readRecords(
                        ReadRecordsRequest(
                            recordType = DistanceRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            pageToken = distancePageToken,
                        )
                    )
                    for (r in distancePage.records) {
                        samples.add(buildSample(
                            uuid = r.metadata.id,
                            startInstant = r.startTime,
                            endInstant = r.endTime,
                            steps = 0,
                            calories = 0,
                            activeMinutes = 0,
                            distanceMeters = r.distance.inMeters,
                            source = r.metadata.dataOrigin.packageName,
                        ))
                        if (maxSampleTime == null || r.startTime.isAfter(maxSampleTime)) {
                            maxSampleTime = r.startTime
                        }
                    }
                    distancePageToken = distancePage.pageToken
                } while (distancePageToken != null)

                val arr = JSArray()
                for (s in samples) arr.put(s)
                val out = JSObject()
                out.put("samples", arr)
                // Advance the cursor to the latest sample actually returned,
                // not blindly to `end` ("now"). Zero samples this call leaves
                // the cursor at the original `start` — matches iOS: a
                // transient empty result must not silently mark an unfetched
                // historical range as already-synced.
                out.put("cursorISO", DateTimeFormatter.ISO_INSTANT.format(maxSampleTime ?: start))
                Log.i(TAG, "syncSince: ${samples.size} samples returned")
                call.resolve(out)
            } catch (e: Exception) {
                Log.e(TAG, "syncSince: query failed: ${e.message}", e)
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
                    // As of 1.1.0-alpha07 there was no CORE_TRAINING / JUMP_ROPE
                    // session type, so these map to the closest broad type.
                    // NOT re-verified against the 1.1.0 stable release this
                    // file now targets (couldn't confirm via docs whether more
                    // specific constants exist now) — leaving the mapping as-is
                    // rather than guess; low-priority follow-up to check in
                    // Android Studio autocomplete against the SDK jar directly.
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
        distanceMeters: Double = 0.0,
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
        obj.put("distanceMeters", distanceMeters)
        if (source != null) obj.put("source", source)
        return obj
    }

    /**
     * Reads today's step count from the hardware step counter sensor
     * (TYPE_STEP_COUNTER). This sensor reports cumulative steps since last
     * boot, so we maintain a per-day baseline in SharedPreferences to
     * derive today's delta.
     *
     * Falls back gracefully when the sensor is absent or ACTIVITY_RECOGNITION
     * is not granted. Resolves within 3 seconds (timeout or first sensor event).
     *
     * JS return: { available: Boolean, stepsToday: Long, totalSinceBoot: Long }
     */
    @PluginMethod
    fun readStepsFromSensor(call: PluginCall) {
        val ctx: Context = context ?: run {
            call.resolve(JSObject().put("available", false).put("stepsToday", 0L).put("totalSinceBoot", 0L))
            return
        }
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: run {
            call.resolve(JSObject().put("available", false).put("stepsToday", 0L).put("totalSinceBoot", 0L))
            return
        }
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: run {
            call.resolve(JSObject().put("available", false).put("stepsToday", 0L).put("totalSinceBoot", 0L))
            return
        }
        val prefs = ctx.getSharedPreferences("outrun.sensor", Context.MODE_PRIVATE)
        val handler = Handler(Looper.getMainLooper())

        val listener = object : SensorEventListener {
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
            override fun onSensorChanged(event: SensorEvent) {
                sm.unregisterListener(this)
                handler.removeCallbacksAndMessages(null)

                val totalSinceBoot = event.values[0].toLong()
                val today = LocalDate.now(ZoneId.systemDefault()).toString()
                val storedDay = prefs.getString("stepSensor.day", null)

                val stepsToday: Long
                if (storedDay == today) {
                    val storedBaseline = prefs.getLong("stepSensor.baseline", totalSinceBoot)
                    if (totalSinceBoot >= storedBaseline) {
                        stepsToday = totalSinceBoot - storedBaseline
                    } else {
                        // Device rebooted — counter reset mid-day
                        prefs.edit().putLong("stepSensor.baseline", totalSinceBoot).apply()
                        stepsToday = 0L
                    }
                } else {
                    // New day — record baseline, steps = 0
                    prefs.edit()
                        .putString("stepSensor.day", today)
                        .putLong("stepSensor.baseline", totalSinceBoot)
                        .apply()
                    stepsToday = 0L
                }

                call.resolve(
                    JSObject()
                        .put("available", true)
                        .put("stepsToday", stepsToday)
                        .put("totalSinceBoot", totalSinceBoot)
                )
            }
        }

        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)

        handler.postDelayed({
            sm.unregisterListener(listener)
            call.resolve(JSObject().put("available", true).put("stepsToday", 0L).put("totalSinceBoot", 0L))
        }, 3_000L)
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
