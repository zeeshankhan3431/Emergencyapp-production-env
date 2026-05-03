package com.mobile

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * MainActivity.kt — Bridgeless Architecture Fix
 *
 * In RN 0.76+ bridgeless mode, we cannot use reactInstanceManager or
 * DeviceEventManagerModule directly from native.
 *
 * Fix: Store impact data in a static companion object.
 * HomeScreen reads it on mount and triggers the flow from JS side.
 * This completely avoids any native-to-JS bridge calls at launch time.
 */
class MainActivity : ReactActivity() {

    companion object {
        // Static flag read by JS side via NativeModules.EmergencyModule
        var pendingImpact: Boolean = false
        var pendingMagnitude: Float = 0f

        private const val TAG = "MainActivity"
    }

    override fun getMainComponentName(): String = "mobile"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleImpactIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleImpactIntent(it) }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == EmergencyModule.SPEECH_ACTIVITY_REQUEST_CODE) {
            EmergencyModule.handleSpeechActivityResult(resultCode, data)
        }
    }

    private fun handleImpactIntent(intent: Intent) {
        val impactDetected = intent.getBooleanExtra(
            EmergencyForegroundService.EXTRA_IMPACT, false
        )
        if (!impactDetected) return

        val magnitude = intent.getFloatExtra("magnitude", 30f)
        Log.d(TAG, "Impact intent received, magnitude=$magnitude")

        // Store in static variable — JS will poll this on mount
        pendingImpact = true
        pendingMagnitude = magnitude
    }
}