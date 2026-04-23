import Foundation
import Capacitor
import HealthKit

/**
 * HealthBridge — iOS / HealthKit implementation.
 *
 * Reads three sample types from HealthKit:
 *   • HKQuantityTypeIdentifier.stepCount
 *   • HKQuantityTypeIdentifier.activeEnergyBurned
 *   • HKQuantityTypeIdentifier.appleExerciseTime
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
        CAPPluginMethod(name: "enableBackgroundDelivery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableBackgroundDelivery", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private var observers: [HKObserverQuery] = []

    private var stepType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .stepCount)! }
    private var caloriesType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)! }
    private var exerciseType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .appleExerciseTime)! }

    private var readTypes: Set<HKObjectType> {
        return [stepType, caloriesType, exerciseType]
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        if available {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false, "reason": "healthkit-unavailable"])
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
                    call.resolve(["granted": false])
                } else {
                    call.resolve(["granted": true])
                }
            }
        }
        healthStore.execute(q)
    }

    // MARK: - requestPermissions

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit unavailable on this device")
            return
        }
        // We never write — read-only request.
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { [weak self] success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            // The system can return success=true even when the user
            // denied — iOS does this on purpose to avoid leaking
            // authorization state. Probe with a tiny query to decide.
            self?.hasPermissions(call)
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

        for type in [stepType, caloriesType, exerciseType] {
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endBound, options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1000, sortDescriptors: [sort]) { _, results, error in
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
            }
            healthStore.execute(query)
        }

        group.notify(queue: .main) {
            if let err = firstError {
                call.reject("HealthKit query failed: \(err.localizedDescription)")
                return
            }
            let samples = Array(samplesByUUID.values)
            call.resolve([
                "samples": samples,
                "cursorISO": isoFormatter.string(from: endBound),
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
            let q = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, _ in
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
                call.reject("enableBackgroundDelivery failed: \(err.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func disableBackgroundDelivery(_ call: CAPPluginCall) {
        for q in observers { healthStore.stop(q) }
        observers.removeAll()
        healthStore.disableAllBackgroundDelivery { _, error in
            if let error = error {
                call.reject("disableBackgroundDelivery failed: \(error.localizedDescription)")
            } else {
                call.resolve()
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
}
