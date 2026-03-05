/**
 * ImpactDetectionService.ts
 *
 * Listens to the device accelerometer/gyroscope and fires a callback when a
 * sudden physical impact is detected.
 *
 * Android  – Works in background via a Foreground Service (see HeadlessTask.js).
 *            This module manages the JS side; the native foreground service
 *            keeps the process alive when the app is minimised.
 *
 * iOS      – Works ONLY while the app is in the foreground or very recently
 *            backgrounded (Core Motion best-effort). This limitation is
 *            disclosed to users at onboarding.
 *
 * Dependency: react-native-sensors
 *   npm install react-native-sensors
 *   (auto-linking handles native setup on RN ≥ 0.60)
 */

import { Platform } from 'react-native';
import { accelerometer, gyroscope, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';

// ─── Tuneable constants ────────────────────────────────────────────────────────

/** G-force threshold that counts as a "hard impact" (in m/s²). */
const IMPACT_G_THRESHOLD = 250; // ~2.5 g

/**
 * After one impact event fires, ignore further events for this many ms.
 * Prevents double-firing from a single real impact.
 */
const COOLDOWN_MS = 5000;

/** Sensor poll interval in milliseconds. */
const SENSOR_INTERVAL_MS = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImpactCallback = (magnitude: number) => void;

interface SensorReading {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

// ─── Service class ────────────────────────────────────────────────────────────

class ImpactDetectionService {
  private accelSub: Subscription | null = null;
  private gyroSub: Subscription | null = null;
  private onImpact: ImpactCallback | null = null;
  private lastImpactTime = 0;
  private isRunning = false;

  /** Start listening for impacts. Pass a callback to receive impact events. */
  start(onImpact: ImpactCallback): void {
    if (this.isRunning) {
      console.warn('[ImpactDetection] Already running – call stop() first.');
      return;
    }

    this.onImpact = onImpact;
    this.isRunning = true;

    // Set poll interval for both sensor types
    setUpdateIntervalForType(SensorTypes.accelerometer, SENSOR_INTERVAL_MS);
    setUpdateIntervalForType(SensorTypes.gyroscope, SENSOR_INTERVAL_MS);

    // ── Accelerometer ──────────────────────────────────────────────────────
    this.accelSub = accelerometer
      .pipe(
        map((reading: SensorReading) => {
          // Calculate resultant vector magnitude
          const magnitude = Math.sqrt(
            reading.x ** 2 + reading.y ** 2 + reading.z ** 2,
          );
          return { magnitude, timestamp: reading.timestamp };
        }),
        filter(({ magnitude }) => magnitude > IMPACT_G_THRESHOLD),
      )
      .subscribe({
        next: ({ magnitude }) => this.handlePotentialImpact(magnitude),
        error: err =>
          console.error('[ImpactDetection] Accelerometer error:', err),
      });

    // ── Gyroscope (supplementary – catches rotational impacts) ────────────
    this.gyroSub = gyroscope
      .pipe(
        map((reading: SensorReading) => {
          const magnitude = Math.sqrt(
            reading.x ** 2 + reading.y ** 2 + reading.z ** 2,
          );
          return magnitude;
        }),
        // Gyro threshold is angular velocity (rad/s); high value = violent rotation
        filter(magnitude => magnitude > 10),
      )
      .subscribe({
        next: magnitude => this.handlePotentialImpact(magnitude),
        error: err => console.error('[ImpactDetection] Gyroscope error:', err),
      });

    console.log(
      `[ImpactDetection] Started on ${Platform.OS}` +
        (Platform.OS === 'ios'
          ? ' (foreground/recent-background only – iOS limitation)'
          : ' (full background via Foreground Service)'),
    );
  }

  /** Stop listening. Safe to call even if already stopped. */
  stop(): void {
    this.accelSub?.unsubscribe();
    this.gyroSub?.unsubscribe();
    this.accelSub = null;
    this.gyroSub = null;
    this.onImpact = null;
    this.isRunning = false;
    console.log('[ImpactDetection] Stopped.');
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private handlePotentialImpact(magnitude: number): void {
    const now = Date.now();
    if (now - this.lastImpactTime < COOLDOWN_MS) {
      return; // still in cooldown
    }
    this.lastImpactTime = now;
    console.log(`[ImpactDetection] Impact detected! magnitude=${magnitude.toFixed(2)}`);
    this.onImpact?.(magnitude);
  }
}

// Export a singleton so every part of the app shares the same subscription
export const impactDetectionService = new ImpactDetectionService();