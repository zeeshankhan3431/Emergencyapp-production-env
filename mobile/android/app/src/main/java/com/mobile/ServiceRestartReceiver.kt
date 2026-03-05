package com.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * ServiceRestartReceiver.kt
 *
 * Dedicated BroadcastReceiver that restarts EmergencyForegroundService.
 *
 * Why this works better than direct AlarmManager -> Service:
 * BroadcastReceivers are instantiated fresh by Android each time they fire.
 * They are NOT subject to the same background process restrictions as services.
 * Android guarantees BroadcastReceivers will run even when the app process is dead.
 *
 * Flow:
 *   AlarmManager fires -> BroadcastReceiver wakes up (new process if needed)
 *   -> BroadcastReceiver starts EmergencyForegroundService
 *   -> Service starts fresh with all 5 protection layers
 */
class ServiceRestartReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_RESTART = "com.mobile.ACTION_RESTART_EMERGENCY_SERVICE"
        private const val TAG = "ServiceRestartReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Restart broadcast received — starting EmergencyForegroundService")
        EmergencyForegroundService.start(context)
    }
}