package com.mobile

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.content.pm.PackageManager
import android.Manifest
import android.speech.RecognizerIntent
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import android.app.Activity
import android.media.MediaRecorder
import java.io.File
import android.os.Build
import java.util.Locale

/**
 * EmergencyModule.kt — Updated for bridgeless architecture
 *
 * Speech-to-text on Android uses ACTION_RECOGNIZE_SPEECH (system UI). This is far more
 * reliable on emulators than SpeechRecognizer listener-only APIs (often ERROR_NO_MATCH / 7).
 */
class EmergencyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        /** Must match MainActivity.onActivityResult routing */
        const val SPEECH_ACTIVITY_REQUEST_CODE = 9912

        @Volatile
        private var pendingSpeechPromise: Promise? = null

        @JvmStatic
        fun handleSpeechActivityResult(resultCode: Int, data: Intent?) {
            val p = pendingSpeechPromise
            pendingSpeechPromise = null
            if (p == null) return

            if (resultCode == Activity.RESULT_OK && data != null) {
                val matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val best = matches?.firstOrNull()?.trim().orEmpty()
                val map: WritableMap = Arguments.createMap()
                map.putString("text", best)
                p.resolve(map)
            } else {
                p.reject(
                    "SPEECH_CANCELLED",
                    "Speech was cancelled or no audio was captured. On emulator: enable Microphone in Extended Controls.",
                )
            }
        }
    }

    private var mediaRecorder: MediaRecorder? = null
    private var recordingFilePath: String? = null

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

    @ReactMethod
    fun getPendingImpact(promise: Promise) {
        try {
            val map: WritableMap = Arguments.createMap()
            map.putBoolean("impact", MainActivity.pendingImpact)
            map.putDouble("magnitude", MainActivity.pendingMagnitude.toDouble())

            MainActivity.pendingImpact = false
            MainActivity.pendingMagnitude = 0f

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val packageName = reactContext.packageName
            val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent().apply {
                    action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    data = Uri.parse("package:$packageName")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val packageName = reactContext.packageName
            val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
            promise.resolve(pm.isIgnoringBatteryOptimizations(packageName))
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * Opens the **system** speech recognizer (Google UI). Resolves when user finishes speaking.
     */
    @ReactMethod
    fun startSpeechRecognition(language: String?, promise: Promise) {
        if (pendingSpeechPromise != null) {
            promise.reject("BUSY", "Speech recognition already in progress")
            return
        }

        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.RECORD_AUDIO,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("NO_PERMISSION", "Microphone permission not granted")
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active screen available for voice recognition")
            return
        }

        val resolvedLang = language?.takeIf { it.isNotBlank() } ?: Locale.getDefault().toLanguageTag()

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, resolvedLang)
            putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                "Speak clearly. Your words will appear as text.",
            )
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        }

        activity.runOnUiThread {
            try {
                pendingSpeechPromise = promise
                activity.startActivityForResult(intent, SPEECH_ACTIVITY_REQUEST_CODE)
            } catch (e: Exception) {
                pendingSpeechPromise = null
                promise.reject("SPEECH_START_ERROR", e.message ?: "Could not open speech recognizer")
            }
        }
    }

    @ReactMethod
    fun sendEmergencySms(phone: String, message: String, promise: Promise) {
        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.SEND_SMS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("NO_PERMISSION", "SMS permission not granted")
            return
        }

        try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                reactContext.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            
            val parts = smsManager.divideMessage(message)
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(phone, null, message, null, null)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            // Fallback: If direct SMS fails (e.g. dual SIM or carrier restriction), open SMS app
            try {
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse("sms:$phone")
                    putExtra("sms_body", message)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } catch (fallbackErr: Exception) {
                promise.reject("SMS_ERROR", "Direct send and fallback both failed: " + e.message)
            }
        }
    }

    @ReactMethod
    fun startEmergencyRecording(promise: Promise) {
        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.RECORD_AUDIO,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("NO_PERMISSION", "Microphone permission not granted")
            return
        }

        try {
            val outputFile = File(
                reactContext.cacheDir,
                "emergency_${System.currentTimeMillis()}.m4a",
            )

            val recorder = createMediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(96000)
                setAudioSamplingRate(44100)
                setOutputFile(outputFile.absolutePath)
                prepare()
                start()
            }

            mediaRecorder = recorder
            recordingFilePath = outputFile.absolutePath
            val map: WritableMap = Arguments.createMap()
            map.putString("filePath", outputFile.absolutePath)
            map.putBoolean("recording", true)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("RECORDING_START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopEmergencyRecording(promise: Promise) {
        try {
            mediaRecorder?.apply {
                stop()
                reset()
                release()
            }
            mediaRecorder = null
            val map: WritableMap = Arguments.createMap()
            map.putString("filePath", recordingFilePath)
            map.putBoolean("recording", false)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("RECORDING_STOP_ERROR", e.message)
        } finally {
            mediaRecorder = null
        }
    }

    @Suppress("DEPRECATION")
    private fun createMediaRecorder(): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(reactContext)
        } else {
            MediaRecorder()
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
