/**
 * IOSMotionService.ts
 *
 * iOS Core Motion best-effort impact detection.
 *
 * iOS PLATFORM LIMITATIONS (explicitly documented per client brief):
 * - iOS does NOT allow always-on background sensor access
 * - Detection works ONLY when:
 *   a) App is in the foreground, OR
 *   b) App was recently active and not yet suspended by iOS
 * - Uses react-native-sensors on a best-effort basis
 * - Detection is ASSISTIVE, not guaranteed
 * - This limitation is clearly disclosed to users
 *
 * These are hard iOS restrictions — no workaround exists without
 * violating Apple App Store guidelines.
 */

import { AppState, AppStateStatus } from 'react-native';
import {
  accelerometer,
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';

// ── Thresholds ────────────────────────────────────────────────────────────────

// Phase 1: Free fall — magnitude below this for FREE_FALL_MIN_MS
const FREE_FALL_THRESHOLD = 3.0;   // m/s²
const FREE_FALL_MIN_MS    = 100;   // milliseconds

// Phase 2: Impact after free fall
const IMPACT_THRESHOLD    = 25.0;  // m/s²
const IMPACT_WINDOW_MS    = 600;   // ms window after free fall to detect impact

// Direct hard hit — no free fall phase needed
const HARD_HIT_THRESHOLD  = 50.0;  // m/s²

// Cooldown between triggers
const COOLDOWN_MS         = 4000;

// Sensor poll interval
const SENSOR_INTERVAL_MS  = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImpactCallback = (magnitude: number, type: string) => void;

interface SensorReading {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

class IOSMotionService {
  private accelSub: Subscription | null = null;
  private onImpact: ImpactCallback | null = null;
  private appStateSub: any = null;
  private isRunning = false;

  // 2-phase detection state
  private inFreeFall = false;
  private freeFallStartTime = 0;
  private freeFallEndTime = 0;
  private waitingForImpact = false;
  private lastTriggerTime = 0;

  /**
   * Start best-effort motion detection.
   * Automatically pauses when app is backgrounded (iOS requirement).
   * Resumes when app returns to foreground.
   */
  start(onImpact: ImpactCallback): void {
    if (this.isRunning) return;
    this.onImpact = onImpact;
    this.isRunning = true;

    // Start sensor immediately (app is in foreground when this is called)
    this.startSensor();

    // Listen to app state — pause/resume sensor accordingly
    this.appStateSub = AppState.addEventListener(
      'change',
      this.handleAppState,
    );

    console.log(
      '[IOSMotionService] Started — best-effort mode\n' +
      'LIMITATION: Detection pauses when app is backgrounded (iOS policy)',
    );
  }

  stop(): void {
    this.stopSensor();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.onImpact = null;
    this.isRunning = false;
    console.log('[IOSMotionService] Stopped');
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private handleAppState = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      console.log('[IOSMotionService] App foregrounded — resuming sensor');
      this.startSensor();
    } else if (nextState === 'background' || nextState === 'inactive') {
      console.log('[IOSMotionService] App backgrounded — pausing sensor (iOS limitation)');
      this.stopSensor();
      this.resetFallState();
    }
  };

  private startSensor(): void {
    if (this.accelSub) return; // already running

    setUpdateIntervalForType(SensorTypes.accelerometer, SENSOR_INTERVAL_MS);

    this.accelSub = accelerometer
      .pipe(
        map((r: SensorReading) => ({
          magnitude: Math.sqrt(r.x ** 2 + r.y ** 2 + r.z ** 2),
          timestamp: r.timestamp,
        })),
      )
      .subscribe({
        next: ({ magnitude }) => this.processSample(magnitude),
        error: err => console.error('[IOSMotionService] Sensor error:', err),
      });
  }

  private stopSensor(): void {
    this.accelSub?.unsubscribe();
    this.accelSub = null;
  }

  private processSample(magnitude: number): void {
    const now = Date.now();

    // Cooldown
    if (now - this.lastTriggerTime < COOLDOWN_MS) return;

    // Hard direct impact (no free fall needed)
    if (magnitude > HARD_HIT_THRESHOLD) {
      this.lastTriggerTime = now;
      this.resetFallState();
      this.onImpact?.(magnitude, 'hard_direct');
      return;
    }

    // Phase 1: Free fall detection
    if (magnitude < FREE_FALL_THRESHOLD) {
      if (!this.inFreeFall) {
        this.inFreeFall = true;
        this.freeFallStartTime = now;
      }
      return;
    }

    // Came out of free fall
    if (this.inFreeFall) {
      const duration = now - this.freeFallStartTime;
      this.inFreeFall = false;
      this.freeFallEndTime = now;

      if (duration >= FREE_FALL_MIN_MS) {
        this.waitingForImpact = true;
        console.log(`[IOSMotionService] Phase 1 confirmed: ${duration}ms free fall`);
      } else {
        this.waitingForImpact = false;
      }
    }

    // Phase 2: Impact after free fall
    if (this.waitingForImpact) {
      const timeSince = now - this.freeFallEndTime;

      if (timeSince > IMPACT_WINDOW_MS) {
        this.resetFallState();
        return;
      }

      if (magnitude > IMPACT_THRESHOLD) {
        console.log(`[IOSMotionService] Phase 2 confirmed: impact ${magnitude} m/s²`);
        this.lastTriggerTime = now;
        this.resetFallState();
        this.onImpact?.(magnitude, 'fall_and_impact');
      }
    }
  }

  private resetFallState(): void {
    this.inFreeFall = false;
    this.waitingForImpact = false;
    this.freeFallStartTime = 0;
    this.freeFallEndTime = 0;
  }
}

export const iosMotionService = new IOSMotionService();