#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Objective-C bridge required by Capacitor 6 for plugin auto-discovery.
// The Swift implementation lives in HealthBridgePlugin.swift.
CAP_PLUGIN(HealthBridgePlugin, "HealthBridge",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(hasPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(syncSince, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(writeWorkout, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enableBackgroundDelivery, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disableBackgroundDelivery, CAPPluginReturnPromise);
)
