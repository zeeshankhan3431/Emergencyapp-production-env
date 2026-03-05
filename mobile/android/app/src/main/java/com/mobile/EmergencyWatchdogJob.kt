package com.mobile

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log

class EmergencyWatchdogJob : JobService() {

    companion object {
        private const val TAG = "WatchdogJob"
        const val JOB_ID = 2001

        fun schedule(context: Context) {
            val scheduler =
                context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            val job = JobInfo.Builder(
                JOB_ID,
                ComponentName(context, EmergencyWatchdogJob::class.java)
            )
                .setMinimumLatency(5 * 60 * 1000L)
                .setOverrideDeadline(7 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE)
                .setRequiresCharging(false)
                .setRequiresDeviceIdle(false)
                .build()
            val result = scheduler.schedule(job)
            Log.d(TAG, if (result == JobScheduler.RESULT_SUCCESS) "Scheduled OK" else "Failed")
        }

        fun cancel(context: Context) {
            (context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).cancel(JOB_ID)
        }
    }

    override fun onStartJob(params: JobParameters?): Boolean {
        Log.d(TAG, "Watchdog fired")
        if (!isServiceRunning()) {
            Log.w(TAG, "Service dead - restarting")
            EmergencyForegroundService.start(applicationContext)
        } else {
            Log.d(TAG, "Service alive")
        }
        schedule(applicationContext)
        jobFinished(params, false)
        return false
    }

    override fun onStopJob(params: JobParameters?): Boolean { return true }

    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        return manager.getRunningServices(Int.MAX_VALUE)
            .any { it.service.className == EmergencyForegroundService::class.java.name }
    }
}