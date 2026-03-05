/**
 * HeadlessTask.js
 *
 * Android-only. Registered with AppRegistry as a Headless JS task.
 * This runs in the background (even with screen off) when the native
 * Foreground Service wakes it.
 *
 * Registration happens in index.js:
 *   AppRegistry.registerHeadlessTask('EmergencyMonitor', () => require('./HeadlessTask').default);
 *
 * The native side (EmergencyForegroundService.kt) starts this task via
 * HeadlessJsTaskService every N seconds.
 *
 * NOTE: Heavy sensor work is done on the JS side via react-native-sensors.
 *       The native service simply keeps the process alive and emits a
 *       periodic heartbeat that wakes this task to re-subscribe if needed.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { impactDetectionService } from './src/services/ImpactDetectionService';
import { EmergencyFlowBridge } from './src/hooks/useEmergencyFlow';

export default async function EmergencyMonitorTask(taskData) {
  console.log('[HeadlessTask] EmergencyMonitor woke up', taskData);

  // If sensor isn't running (e.g. after a crash recovery), restart it
  if (!impactDetectionService.running) {
    impactDetectionService.start(magnitude => {
      // In headless mode we can't navigate, so we emit a native event
      // that MainActivity picks up and opens the Confirmation screen.
      NativeModules.EmergencyModule?.onImpactDetected(magnitude);
      // Also notify the JS bridge in case the React tree is alive
      EmergencyFlowBridge.onImpact(magnitude);
    });
    console.log('[HeadlessTask] Sensor (re)started.');
  }

  // Task must resolve for Android not to kill the JS thread
  return Promise.resolve();
}