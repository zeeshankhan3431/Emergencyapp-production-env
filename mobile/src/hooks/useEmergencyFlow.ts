/**
 * useEmergencyFlow.ts — Updated with iOS motion service
 *
 * Android: Uses native Kotlin EmergencyForegroundService (background capable)
 * iOS:     Uses IOSMotionService (foreground/best-effort only — iOS limitation)
 */

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import { iosMotionService } from '../services/IOSMotionService';
import { emergencyService } from '../services/EmergencyService';

export function useEmergencyFlow() {
  const nav = useNavigation<any>();
  const {
    state,
    markImpact,
    startCountdown,
    confirmSafe,
    escalate,
    resolve,
    dispatch,
  } = useEmergency();
  const escalatingRef = useRef(false);

  // ── iOS: start/stop motion service based on app state ──────────────────────
  // Android: sensor managed by native Kotlin foreground service
  useEffect(() => {
    if (Platform.OS === 'ios') {
      iosMotionService.start((_magnitude, _type) => {
        markImpact();
      });

      return () => {
        iosMotionService.stop();
      };
    }
    // Android: no cleanup needed — native service manages its own lifecycle
  }, [markImpact]);

  // ── Navigate based on emergency status ─────────────────────────────────────
  useEffect(() => {
    switch (state.status) {
      case 'IMPACT_DETECTED':
        startCountdown();
        nav.navigate('Confirmation');
        break;
      case 'ESCALATING':
        nav.navigate('EmergencyActive');
        break;
      default:
        break;
    }
  }, [nav, startCountdown, state.status]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const triggerManual = useCallback(() => {
    markImpact();
  }, [markImpact]);

  const triggerEscalation = useCallback(async () => {
    if (escalatingRef.current) return;
    escalatingRef.current = true;
    try {
      // userId is no longer sent to backend — backend derives it from JWT auth
      const sessionId = await emergencyService.escalate(
        state.scenarioMessage,
        state.impactTimestamp ?? Date.now(),
      );
      escalate(sessionId);
    } finally {
      escalatingRef.current = false;
    }
  }, [escalate, state.scenarioMessage, state.impactTimestamp]);

  const confirmUserSafe = useCallback(async () => {
    if (state.sessionId) {
      await emergencyService.resolveSession(state.sessionId, 'user_cancelled');
    }
    confirmSafe();
    nav.navigate('Home');
  }, [confirmSafe, nav, state.sessionId]);

  const endEmergency = useCallback(async () => {
    if (state.sessionId) {
      await emergencyService.resolveSession(state.sessionId, 'responders_notified');
    }
    resolve();
    nav.navigate('Home');
  }, [resolve, nav, state.sessionId]);

  const setScenario = useCallback(
    (message: string) => dispatch({ type: 'SET_SCENARIO', message }),
    [dispatch],
  );

  return {
    emergencyState: state,
    triggerManual,
    triggerEscalation,
    confirmUserSafe,
    endEmergency,
    setScenario,
  };
}

// Bridge for Android native events
export const EmergencyFlowBridge = {
  _handler: null as ((magnitude: number) => void) | null,
  register(handler: (magnitude: number) => void) { this._handler = handler; },
  onImpact(magnitude: number) { this._handler?.(magnitude); },
};