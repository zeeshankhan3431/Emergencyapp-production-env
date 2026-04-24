package com.mobile

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlin.math.sqrt

/**
 * EmergencyForegroundService.kt — Final Version
 *
 * Fix for service not restarting after 5-10 minutes:
 * Root cause: AlarmManager was targeting the Service directly.
 * When service + its process dies, AlarmManager's PendingIntent
 * for the service also becomes invalid on some Android versions.
 *
 * Fix: AlarmManager now targets ServiceRestartReceiver (BroadcastReceiver).
 * BroadcastReceivers are guaranteed to run even when app process is dead.
 * Receiver then starts the service fresh.
 *
 * 6-Layer Protection:
 * Layer 1: START_STICKY — OS restarts after crash
 * Layer 2: WakeLock renewed every 5 min — CPU never sleeps
 * Layer 3: AlarmManager -> BroadcastReceiver every 8 min — guaranteed restart
 * Layer 4: JobScheduler watchdog every 5 min — secondary restart check
 * Layer 5: onTaskRemoved — restarts on swipe via BroadcastReceiver
 * Layer 6: BootReceiver — restarts after phone reboot
 */
class EmergencyForegroundService : Service(), SensorEventListener {

    companion object {
        const val CHANNEL_ID = "emergency_monitor_channel"
        const val ALERT_CHANNEL_ID = "emergency_alert_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START_MONITORING"
        const val ACTION_STOP = "ACTION_STOP_MONITORING"
        const val EXTRA_IMPACT = "IMPACT_DETECTED"
        private const val TAG = "EmergencyService"

        // Fall detection thresholds
        private const val FREE_FALL_THRESHOLD   = 3.0f
        private const val FREE_FALL_MIN_MS      = 100L
        private const val IMPACT_THRESHOLD      = 25.0f
        private const val IMPACT_WINDOW_MS      = 600L
        private const val HARD_IMPACT_THRESHOLD = 50.0f
        private const val COOLDOWN_MS           = 4000L

        // Timing
        private const val WAKELOCK_RENEW_MS     = 5 * 60 * 1000L   // renew every 5 min
        private const val ALARM_INTERVAL_MS     = 8 * 60 * 1000L   // alarm every 8 min
        private const val SENSOR_REREGISTER_MS  = 30_000L           // sensor every 30s

        fun start(context: Context) {
            val i = Intent(context, EmergencyForegroundService::class.java).apply {
                action = ACTION_START
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(i)
                } else {
                    context.startService(i)
                }
                Log.d("EmergencyService", "Service start requested")
            } catch (e: Exception) {
                Log.e("EmergencyService", "Failed to start service: ${e.message}")
            }
        }

        fun stop(context: Context) {
            cancelAlarmBroadcast(context)
            EmergencyWatchdogJob.cancel(context)
            context.stopService(Intent(context, EmergencyForegroundService::class.java))
        }

        /**
         * Schedule alarm targeting BroadcastReceiver (not Service directly).
         * This is the KEY fix — BroadcastReceivers survive app process death.
         */
        fun scheduleAlarmViaBroadcast(context: Context) {
            val restartIntent = Intent(context, ServiceRestartReceiver::class.java).apply {
                action = ServiceRestartReceiver.ACTION_RESTART
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 777, restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val triggerAt = SystemClock.elapsedRealtime() + ALARM_INTERVAL_MS

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent
                )
            } else {
                am.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent
                )
            }
            Log.d("EmergencyService", "Alarm->BroadcastReceiver scheduled in 8 min")
        }

        private fun cancelAlarmBroadcast(context: Context) {
            val restartIntent = Intent(context, ServiceRestartReceiver::class.java).apply {
                action = ServiceRestartReceiver.ACTION_RESTART
            }
            val pi = PendingIntent.getBroadcast(
                context, 777, restartIntent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            pi?.let {
                (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(it)
            }
        }
    }

    // Sensor
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null

    // 2-Phase fall detection state
    private var inFreeFall          = false
    private var freeFallStartTime   = 0L
    private var freeFallEndTime     = 0L
    private var waitingForImpact    = false
    private var lastTriggerTime     = 0L

    // Service internals
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())

    private val sensorReregisterRunnable = object : Runnable {
        override fun run() {
            unregisterSensor()
            registerSensor()
            Log.d(TAG, "Sensor re-registered")
            handler.postDelayed(this, SENSOR_REREGISTER_MS)
        }
    }

    private val wakeLockRenewRunnable = object : Runnable {
        override fun run() {
            renewWakeLock()
            // Also reschedule alarm each time wakelock renews
            // This creates a second renewal chain independent of the primary alarm
            scheduleAlarmViaBroadcast(applicationContext)
            handler.postDelayed(this, WAKELOCK_RENEW_MS)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate")
        createNotificationChannels()
        setupSensor()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: ${intent?.action}")

        when (intent?.action) {
            ACTION_STOP -> {
                Log.d(TAG, "Stop requested by user")
                handler.removeCallbacksAndMessages(null)
                releaseWakeLock()
                cancelAlarmBroadcast(applicationContext)
                EmergencyWatchdogJob.cancel(applicationContext)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                // Call startForeground immediately — required within 5s on Android 12+
                startForeground(NOTIFICATION_ID, buildMonitoringNotification())

                acquireWakeLock()
                registerSensor()

                handler.removeCallbacksAndMessages(null)
                handler.postDelayed(sensorReregisterRunnable, SENSOR_REREGISTER_MS)
                handler.postDelayed(wakeLockRenewRunnable, WAKELOCK_RENEW_MS)

                // Layer 3: Alarm -> BroadcastReceiver (survives process death)
                scheduleAlarmViaBroadcast(applicationContext)

                // Layer 4: JobScheduler watchdog
                EmergencyWatchdogJob.schedule(applicationContext)

                Log.d(TAG, "All 6 protection layers active")
            }
        }

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "onTaskRemoved — scheduling broadcast restart in 1000ms")

        // Use BroadcastReceiver for restart (more reliable than direct service start)
        val restartIntent = Intent(applicationContext, ServiceRestartReceiver::class.java).apply {
            action = ServiceRestartReceiver.ACTION_RESTART
        }
        val pendingIntent = PendingIntent.getBroadcast(
            applicationContext, 778, restartIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerAt = SystemClock.elapsedRealtime() + 1000

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAt,
                pendingIntent
            )
        } else {
            am.setExact(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAt,
                pendingIntent
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy — service killed, firing immediate aggressive restart")
        handler.removeCallbacksAndMessages(null)
        unregisterSensor()
        releaseWakeLock()
        
        // AGGRESSIVE RESTART: If the system kills us, immediately broadcast to start again
        val restartIntent = Intent(applicationContext, ServiceRestartReceiver::class.java).apply {
            action = ServiceRestartReceiver.ACTION_RESTART
        }
        sendBroadcast(restartIntent)

        // Ensure watchdog is also running
        EmergencyWatchdogJob.schedule(applicationContext)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Sensor ────────────────────────────────────────────────────────────────

    private fun setupSensor() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (accelerometer == null) Log.w(TAG, "No accelerometer!")
        else Log.d(TAG, "Accelerometer ready: ${accelerometer?.name}")
    }

    private fun registerSensor() {
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
            Log.d(TAG, "Sensor registered")
        }
    }

    private fun unregisterSensor() {
        sensorManager?.unregisterListener(this)
    }

    // ── 2-Phase Fall Detection ────────────────────────────────────────────────

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val magnitude = sqrt((x * x + y * y + z * z).toDouble()).toFloat()
        val now = System.currentTimeMillis()

        // Cooldown
        if (now - lastTriggerTime < COOLDOWN_MS) return

        // Hard direct impact — triggers without free fall phase
        if (magnitude > HARD_IMPACT_THRESHOLD) {
            Log.d(TAG, "Hard direct impact: $magnitude m/s²")
            lastTriggerTime = now
            resetFallState()
            handleImpact(magnitude, "hard_direct")
            return
        }

        // Phase 1: Free fall
        if (magnitude < FREE_FALL_THRESHOLD) {
            if (!inFreeFall) {
                inFreeFall = true
                freeFallStartTime = now
            }
            return
        }

        // Came out of free fall
        if (inFreeFall) {
            val duration = now - freeFallStartTime
            inFreeFall = false
            freeFallEndTime = now
            waitingForImpact = duration >= FREE_FALL_MIN_MS
            if (waitingForImpact) {
                Log.d(TAG, "Phase 1 confirmed: ${duration}ms free fall")
            }
        }

        // Phase 2: Impact after free fall
        if (waitingForImpact) {
            val timeSince = now - freeFallEndTime
            if (timeSince > IMPACT_WINDOW_MS) {
                resetFallState()
                return
            }
            if (magnitude > IMPACT_THRESHOLD) {
                Log.d(TAG, "Phase 2 confirmed: impact $magnitude m/s²")
                lastTriggerTime = now
                resetFallState()
                handleImpact(magnitude, "fall_and_impact")
            }
        }
    }

    private fun resetFallState() {
        inFreeFall = false
        waitingForImpact = false
        freeFallStartTime = 0L
        freeFallEndTime = 0L
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── Impact ────────────────────────────────────────────────────────────────

    private fun handleImpact(magnitude: Float, type: String) {
        Log.d(TAG, "EMERGENCY: type=$type magnitude=$magnitude")
        MainActivity.pendingImpact = true
        MainActivity.pendingMagnitude = magnitude

        val mgr = getSystemService(NotificationManager::class.java)
        mgr.notify(NOTIFICATION_ID + 1, buildImpactNotification())

        startActivity(Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_IMPACT, true)
            putExtra("magnitude", magnitude)
            putExtra("type", type)
        })
    }

    // ── WakeLock ──────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        releaseWakeLock()
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EmergencyApp::SensorWakeLock")
        wakeLock?.acquire()
        Log.d(TAG, "WakeLock acquired")
    }

    private fun renewWakeLock() {
        try {
            releaseWakeLock()
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EmergencyApp::SensorWakeLock")
            wakeLock?.acquire()
            Log.d(TAG, "WakeLock renewed")
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock renewal error: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock release error: ${e.message}")
        }
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun buildMonitoringNotification(): Notification {
        val openPi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPi = PendingIntent.getService(
            this, 1,
            Intent(this, EmergencyForegroundService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Emergency Monitor Active")
            .setContentText("Fall & impact detection running. You are protected.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun buildImpactNotification(): Notification {
        val openPi = PendingIntent.getActivity(
            this, 2,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_IMPACT, true)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setContentTitle("Fall / Impact Detected!")
            .setContentText("Tap now to confirm you are safe — or help will be called.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(openPi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Emergency Monitor",
                    NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) }
            )
            mgr.createNotificationChannel(
                NotificationChannel(ALERT_CHANNEL_ID, "Emergency Alerts",
                    NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true) }
            )
        }
    }
}