import Foundation
import Capacitor
import HealthKit
import os.log

/// Tagged logger for the connect/permission/sync flow — filter Console.app
/// or `xcrun simctl spawn booted log stream` by subsystem "co.il.appout.outrun"
/// / category "HealthBridge". Stage + status only, never raw health values.
private let hbLog = OSLog(subsystem: "co.il.appout.outrun", category: "HealthBridge")

/**
 * HealthBridge — iOS / HealthKit implementation.
 *
 * Reads three sample types from HealthKit:
 *   • HKQuantityTypeIdentifier.stepCount
 *   • HKQuantityTypeIdentifier.activeEnergyBurned
 *   • HKQuantityTypeIdentifier.appleExerciseTime
 *
 * Writes completed workouts to HealthKit:
 *   • HKWorkoutType — with activity type, duration, and active calories
 *
 * Background delivery is enabled per type via `enableBackgroundDelivery`,
 * which causes `HKObserverQuery` callbacks to fire even when the app is
 * suspended. On wake we emit a `samplesAvailable` event so the WebView
 * (when it's foreground) can call `syncSince()` and ship the new
 * samples to Firebase via the HTTPS callable. When the app is fully
 * suspended, the system still queues the delta — we drain it next time
 * the user opens the app via the App.appStateChange listener wired in
 * src/lib/native/init.ts.
 *
 * Idempotency
 * ───────────
 * HKSample.uuid is stable, so we send it as `sampleUUID`. The server
 * (functions/src/ingestHealthSamples.ts) dedupes on this id.
 *
 * Permissions
 * ───────────
 * iOS does NOT tell us whether *read* authorization was granted (only
 * write). We approximate by attempting a 1-day query and treating "no
 * data" as "granted but empty"; only an `errorAuthorizationDenied`
 * response is treated as "denied".
 */
@objc(HealthBridgePlugin)
public class HealthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthBridgePlugin"
    public let jsName = "HealthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncSince", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBackgroundDelivery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableBackgroundDelivery", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private var observers: [HKObserverQuery] = []

    private var stepType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .stepCount)! }
    private var caloriesType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)! }
    private var exerciseType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .appleExerciseTime)! }
    private var workoutType: HKWorkoutType { HKObjectType.workoutType() }

    private var readTypes: Set<HKObjectType> {
        return [stepType, caloriesType, exerciseType]
    }

    private var shareTypes: Set<HKSampleType> {
        return [workoutType, caloriesType]
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        os_log("isAvailable: %{public}@", log: hbLog, type: .debug, available ? "true" : "false")
        DispatchQueue.main.async {
            call.resolve(["available": available])
        }
    }

    // MARK: - hasPermissions

    @objc func hasPermissions(_ call: CAPPluginCall) {
        // iOS does not expose read-authorization status. Probe with a
        // tiny 1-day query: if it succeeds, we treat it as granted.
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -1, to: end)!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let q = HKSampleQuery(sampleType: stepType, predicate: predicate, limit: 1, sortDescriptors: nil) { _, _, error in
            DispatchQueue.main.async {
                if let nsErr = error as NSError?, nsErr.code == HKError.errorAuthorizationDenied.rawValue {
                    os_log("hasPermissions: probe denied", log: hbLog, type: .info)
                    call.resolve(["granted": false])
                } else {
                    os_log("hasPermissions: probe granted (or empty-but-authorized)", log: hbLog, type: .info)
                    call.resolve(["granted": true])
                }
            }
        }
        healthStore.execute(q)
    }

    // MARK: - requestPermissions

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            os_log("requestPermissions: HealthKit unavailable on this device", log: hbLog, type: .error)
            call.reject("HealthKit unavailable on this device")
            return
        }
        os_log("requestPermissions: presenting HealthKit authorization sheet", log: hbLog, type: .info)
        // Request both read (steps/calories/exercise) and write (workouts/calories)
        // so that completed workouts are saved back to Apple Health.
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] success, error in
            if let error = error {
                os_log("requestPermissions: authorization sheet errored: %{public}@", log: hbLog, type: .error, error.localizedDescription)
                DispatchQueue.main.async {
                    call.reject("Authorization failed: \(error.localizedDescription)")
                }
                return
            }
            // The system can return success=true even when the user
            // denied — iOS does this on purpose to avoid leaking
            // authorization state. Probe with a tiny query to decide.
            os_log("requestPermissions: sheet dismissed (success=%{public}@), probing real grant state", log: hbLog, type: .info, success ? "true" : "false")
            self?.hasPermissions(call)
        }
    }

    // MARK: - writeWorkout

    /**
     * Saves a completed workout to HealthKit.
     *
     * Expected JS call:
     *   HealthBridge.writeWorkout({
     *     workoutType: 'traditionalStrengthTraining' | 'running' | 'walking' | 'cycling' | 'other',
     *     startISO: '2026-06-03T07:00:00Z',
     *     endISO:   '2026-06-03T08:00:00Z',
     *     calories: 320,   // active kcal (integer)
     *     distanceMeters: 5200,  // optional (running / cycling)
     *   })
     *
     * Returns { saved: true, uuid: '<HKWorkout uuid>' } on success.
     */
    @objc func writeWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit unavailable on this device")
            return
        }

        let activityTypeStr = call.getString("workoutType") ?? "other"
        let startISO  = call.getString("startISO") ?? ""
        let endISO    = call.getString("endISO") ?? ""
        let calories  = call.getInt("calories") ?? 0
        let distanceM = call.getDouble("distanceMeters")

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoFallback = ISO8601DateFormatter()

        guard
            let startDate = isoFormatter.date(from: startISO) ?? isoFallback.date(from: startISO),
            let endDate   = isoFormatter.date(from: endISO)   ?? isoFallback.date(from: endISO)
        else {
            call.reject("Invalid startISO or endISO: \(startISO) / \(endISO)")
            return
        }

        let activityType = Self.hkActivityType(from: activityTypeStr)

        // Build the workout metadata
        var samples: [HKSample] = []

        if calories > 0 {
            let energyQty = HKQuantity(unit: .kilocalorie(), doubleValue: Double(calories))
            let energySample = HKQuantitySample(
                type: caloriesType,
                quantity: energyQty,
                start: startDate,
                end: endDate
            )
            samples.append(energySample)
        }

        var workoutEvents: [HKWorkoutEvent] = []

        // HKWorkout builder (iOS 12+)
        let config = HKWorkoutConfiguration()
        config.activityType = activityType

        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: config, device: .local())

        builder.beginCollection(withStart: startDate) { success, error in
            guard success else {
                DispatchQueue.main.async {
                    call.reject("beginCollection failed: \(error?.localizedDescription ?? "unknown")")
                }
                return
            }

            let group = DispatchGroup()
            var addError: Error?

            if !samples.isEmpty {
                group.enter()
                builder.add(samples) { ok, err in
                    if let err = err { addError = err }
                    group.leave()
                }
            }

            if let dist = distanceM, dist > 0 {
                group.enter()
                let distQty = HKQuantity(unit: .meter(), doubleValue: dist)
                let distType: HKQuantityType
                switch activityType {
                case .cycling:
                    distType = HKObjectType.quantityType(forIdentifier: .distanceCycling)!
                default:
                    distType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!
                }
                let distSample = HKQuantitySample(type: distType, quantity: distQty, start: startDate, end: endDate)
                builder.add([distSample]) { ok, err in
                    if let err = err { addError = err }
                    group.leave()
                }
            }

            group.notify(queue: .main) {
                if let err = addError {
                    call.reject("addSamples failed: \(err.localizedDescription)")
                    return
                }
                builder.endCollection(withEnd: endDate) { success, error in
                    guard success else {
                        DispatchQueue.main.async {
                            call.reject("endCollection failed: \(error?.localizedDescription ?? "unknown")")
                        }
                        return
                    }
                    builder.finishWorkout { workout, error in
                        DispatchQueue.main.async {
                            if let error = error {
                                call.reject("finishWorkout failed: \(error.localizedDescription)")
                            } else if let workout = workout {
                                call.resolve(["saved": true, "uuid": workout.uuid.uuidString])
                            } else {
                                call.reject("finishWorkout returned nil workout")
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - syncSince

    @objc func syncSince(_ call: CAPPluginCall) {
        let endDate = Date()
        let sinceISO = call.getString("sinceISO")
        let untilISO = call.getString("untilISO")
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let startDate: Date
        if let sinceISO = sinceISO, let parsed = isoFormatter.date(from: sinceISO) ?? ISO8601DateFormatter().date(from: sinceISO) {
            startDate = parsed
        } else {
            // Default lookback: 24h. The server idempotently dedupes by
            // sampleUUID, so over-fetching is safe.
            startDate = Calendar.current.date(byAdding: .hour, value: -24, to: endDate)!
        }
        let endBound: Date
        if let untilISO = untilISO, let parsed = isoFormatter.date(from: untilISO) ?? ISO8601DateFormatter().date(from: untilISO) {
            endBound = parsed
        } else {
            endBound = endDate
        }

        let group = DispatchGroup()
        var samplesByUUID: [String: [String: Any]] = [:]
        var firstError: Error?
        // Tracks the latest sample startDate actually returned, across all
        // three types combined — used to advance the cursor below instead of
        // always jumping to `endBound` ("now"). A single combined max (not a
        // per-type max) so a lagging type can't orphan a gap: if steps only
        // reaches day 40 of a 90-day backfill but calories reaches day 90,
        // advancing by the per-type max would silently skip days 40-90 for
        // calories on the next call.
        var latestSampleDate: Date?
        let latestSampleDateLock = NSLock()

        for type in [stepType, caloriesType, exerciseType] {
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endBound, options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            // No limit: a 90-day backfill of small step/calorie/exercise samples
            // is still a bounded, cheap query — HKSampleQuery's previous
            // `limit: 1000` silently truncated to the oldest 1000 samples
            // (ascending sort) once a dense window exceeded that count,
            // which combined with the cursor bug below meant the backfill
            // could permanently stop after as little as 1-2 days of history.
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, error in
                defer { group.leave() }
                if let error = error { firstError = error; return }
                guard let samples = results as? [HKQuantitySample] else { return }

                for s in samples {
                    let key = s.uuid.uuidString
                    var entry = samplesByUUID[key] ?? [
                        "sampleUUID": key,
                        "startISO": isoFormatter.string(from: s.startDate),
                        "endISO": isoFormatter.string(from: s.endDate),
                        "date": Self.dayString(s.startDate),
                        "steps": 0,
                        "calories": 0,
                        "activeMinutes": 0,
                        "source": s.sourceRevision.source.name,
                    ]
                    let value = s.quantity
                    if type == self.stepType {
                        let n = Int(value.doubleValue(for: HKUnit.count()).rounded())
                        entry["steps"] = n
                    } else if type == self.caloriesType {
                        let kcal = Int(value.doubleValue(for: HKUnit.kilocalorie()).rounded())
                        entry["calories"] = kcal
                    } else if type == self.exerciseType {
                        let mins = Int(value.doubleValue(for: HKUnit.minute()).rounded())
                        entry["activeMinutes"] = mins
                    }
                    samplesByUUID[key] = entry
                }

                if let maxInBatch = samples.map({ $0.startDate }).max() {
                    latestSampleDateLock.lock()
                    if latestSampleDate == nil || maxInBatch > latestSampleDate! {
                        latestSampleDate = maxInBatch
                    }
                    latestSampleDateLock.unlock()
                }
            }
            healthStore.execute(query)
        }

        group.notify(queue: .main) {
            if let err = firstError {
                os_log("syncSince: query failed: %{public}@", log: hbLog, type: .error, err.localizedDescription)
                call.reject("HealthKit query failed: \(err.localizedDescription)")
                return
            }
            let samples = Array(samplesByUUID.values)
            os_log("syncSince: %{public}d samples returned", log: hbLog, type: .info, samples.count)

            // Advance the cursor to the latest sample actually returned, not
            // blindly to `endBound` ("now"). A zero-sample sync leaves the
            // cursor exactly where it was (the original `startDate`) rather
            // than jumping forward — jumping forward on an empty result would
            // silently mark an unfetched historical range as "already synced"
            // if that call happened to race ahead of real data (e.g. a
            // temporary query hiccup), permanently orphaning it.
            let nextCursor: Date
            if let latest = latestSampleDate {
                nextCursor = latest
            } else {
                nextCursor = startDate
            }

            call.resolve([
                "samples": samples,
                "cursorISO": isoFormatter.string(from: nextCursor),
            ])
        }
    }

    // MARK: - background delivery

    @objc func enableBackgroundDelivery(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var firstError: Error?

        for type in [stepType, caloriesType, exerciseType] {
            group.enter()
            healthStore.enableBackgroundDelivery(for: type, frequency: .hourly) { _, error in
                if let error = error { firstError = error }
                group.leave()
            }
        }
        // Install one observer per type. They'll fire whenever new
        // samples land — including when the app is suspended.
        for type in [stepType, caloriesType, exerciseType] {
            let q = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                if let error = error {
                    os_log("observer query fired with error: %{public}@", log: hbLog, type: .error, error.localizedDescription)
                    completionHandler()
                    return
                }
                os_log("observer query fired — new samples available", log: hbLog, type: .debug)
                let isoFormatter = ISO8601DateFormatter()
                isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                self?.notifyListeners("samplesAvailable", data: [
                    "reason": "observer",
                    "cursorISO": isoFormatter.string(from: Date()),
                ])
                completionHandler()
            }
            healthStore.execute(q)
            observers.append(q)
        }

        group.notify(queue: .main) {
            if let err = firstError {
                os_log("enableBackgroundDelivery: failed: %{public}@", log: hbLog, type: .error, err.localizedDescription)
                call.reject("enableBackgroundDelivery failed: \(err.localizedDescription)")
            } else {
                os_log("enableBackgroundDelivery: enabled, %{public}d observers installed", log: hbLog, type: .info, self.observers.count)
                call.resolve()
            }
        }
    }

    @objc func disableBackgroundDelivery(_ call: CAPPluginCall) {
        os_log("disableBackgroundDelivery: stopping %{public}d observers", log: hbLog, type: .info, observers.count)
        for q in observers { healthStore.stop(q) }
        observers.removeAll()
        healthStore.disableAllBackgroundDelivery { _, error in
            DispatchQueue.main.async {
                if let error = error {
                    os_log("disableBackgroundDelivery: failed: %{public}@", log: hbLog, type: .error, error.localizedDescription)
                    call.reject("disableBackgroundDelivery failed: \(error.localizedDescription)")
                } else {
                    call.resolve()
                }
            }
        }
    }

    // MARK: - helpers

    private static func dayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone.current
        return f.string(from: date)
    }

    /// Maps the JS workout type string to the closest HKWorkoutActivityType.
    private static func hkActivityType(from string: String) -> HKWorkoutActivityType {
        switch string {
        case "running":                       return .running
        case "walking":                       return .walking
        case "cycling":                       return .cycling
        case "swimming":                      return .swimming
        case "hiking":                        return .hiking
        case "yoga":                          return .yoga
        case "functionalStrengthTraining":    return .functionalStrengthTraining
        case "traditionalStrengthTraining":   return .traditionalStrengthTraining
        case "crossTraining":                 return .crossTraining
        case "coreTraining":                  return .coreTraining
        case "jumpRope":                      return .jumpRope
        case "stairClimbing":                 return .stairClimbing
        default:                              return .other
        }
    }
}
