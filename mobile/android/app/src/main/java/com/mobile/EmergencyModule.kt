package com.mobile

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

/**
 * EmergencyModule.kt — Updated for bridgeless architecture
 *
 * Added: getPendingImpact() — JS calls this on HomeScreen mount
 * to check if app was opened via an impact notification.
 * This avoids any crash-prone native-to-JS event emission at startup.
 */
class EmergencyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "EmergencyModule"

    @ReactMethod
    fun startForegroundService(promise: Promise) {
        try {
            EmergencyForegroundService.start(reactContext)
            promise.resolve("started")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        try {
            EmergencyForegroundService.stop(reactContext)
            promise.resolve("stopped")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * JS calls this on HomeScreen mount to check if app was launched
     * from an impact notification. Returns { impact: true, magnitude: 30.0 }
     * or { impact: false, magnitude: 0.0 }
     */
    @ReactMethod
    fun getPendingImpact(promise: Promise) {
        try {
            val map: WritableMap = Arguments.createMap()
            map.putBoolean("impact", MainActivity.pendingImpact)
            map.putDouble("magnitude", MainActivity.pendingMagnitude.toDouble())

            // Clear after reading so it doesn't fire again on next mount
            MainActivity.pendingImpact = false
            MainActivity.pendingMagnitude = 0f

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}