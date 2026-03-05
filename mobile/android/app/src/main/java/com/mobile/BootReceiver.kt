package com.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BootReceiver.kt
 *
 * Automatically restarts EmergencyForegroundService after phone reboot.
 * Registered in AndroidManifest.xml with RECEIVE_BOOT_COMPLETED permission.
 *
 * Flow:
 *   Phone reboots → Android fires BOOT_COMPLETED → BootReceiver starts service
 *   → Service starts native accelerometer listening → User is protected again
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            Log.d("BootReceiver", "Boot completed — starting EmergencyForegroundService")
            EmergencyForegroundService.start(context)
        }
    }
}