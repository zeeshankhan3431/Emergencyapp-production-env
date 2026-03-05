/**
 * ConfirmationScreen.tsx  — Milestone 2 rewrite
 *
 * Shows a 10-second animated countdown after an impact is detected.
 * If the user does NOT confirm they are safe within the window, escalation
 * is triggered automatically.
 *
 * This screen is mandatory on iOS for App Store compliance (Apple requires
 * explicit user involvement before emergency calls).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { useEmergencyFlow } from '../hooks/useEmergencyFlow';
import { CONFIRMATION_SECONDS } from '../context/EmergencyContext';
import { colors } from '../theme/colors';

const HomeScreen: React.FC = () => null; // re-exported below to avoid lint warning

const ConfirmationScreen: React.FC = () => {
  const { confirmUserSafe, triggerEscalation, emergencyState } = useEmergencyFlow();

  // ── Countdown state ─────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState(CONFIRMATION_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasEscalated = useRef(false);

  // ── Animated ring ───────────────────────────────────────────────────────────
  const progress = useRef(new Animated.Value(1)).current; // 1 → 0

  useEffect(() => {
    // Start the shrinking arc animation
    Animated.timing(progress, {
      toValue: 0,
      duration: CONFIRMATION_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    // Vibrate on Android to alert a potentially incapacitated user
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 500, 300, 500]);
    }

    // Announce via accessibility (screen reader)
    AccessibilityInfo.announceForAccessibility(
      'Emergency detected. You have 10 seconds to confirm you are safe, or help will be called.',
    );

    // Countdown ticker
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          if (!hasEscalated.current) {
            hasEscalated.current = true;
            triggerEscalation();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      Vibration.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interpolate ring colour: green → amber → red ────────────────────────────
  const ringColor = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: ['#D32F2F', '#FFA000', '#4CAF50'],
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSafe = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.cancel();
    confirmUserSafe();
  };

  const handleNeedHelp = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.cancel();
    if (!hasEscalated.current) {
      hasEscalated.current = true;
      triggerEscalation();
    }
  };

  const urgency = secondsLeft <= 3 ? 'critical' : secondsLeft <= 6 ? 'warning' : 'normal';

  return (
    <View style={styles.root}>
      {/* ── Title ── */}
      <Text style={styles.title}>Are you OK?</Text>
      <Text style={styles.subtitle}>
        An impact was detected. Emergency services will be alerted in:
      </Text>

      {/* ── Animated countdown ring ── */}
      <View style={styles.ringContainer}>
        <Animated.View
          style={[
            styles.ring,
            { borderColor: ringColor },
            urgency === 'critical' && styles.ringCritical,
          ]}>
          <Text
            style={[
              styles.countdown,
              urgency === 'warning' && styles.countdownWarning,
              urgency === 'critical' && styles.countdownCritical,
            ]}>
            {secondsLeft}
          </Text>
          <Text style={styles.countdownLabel}>seconds</Text>
        </Animated.View>
      </View>

      {/* ── Scenario message preview ── */}
      <View style={styles.messageBox}>
        <Text style={styles.messageLabel}>Message that will be sent:</Text>
        <Text style={styles.messageText}>{emergencyState.scenarioMessage}</Text>
      </View>

      {/* ── Action buttons ── */}
      <TouchableOpacity
        style={styles.safeButton}
        onPress={handleSafe}
        accessibilityLabel="I am safe – cancel emergency"
        accessibilityRole="button">
        <Text style={styles.safeButtonText}>✅  I'm Safe – Cancel</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.helpButton}
        onPress={handleNeedHelp}
        accessibilityLabel="Send help now"
        accessibilityRole="button">
        <Text style={styles.helpButtonText}>🆘  Send Help Now</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <Text style={styles.iosNote}>
          On iPhone, you will be prompted to confirm the call to 911.
        </Text>
      )}
    </View>
  );
};

export default ConfirmationScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  ringContainer: {
    marginBottom: 32,
  },
  ring: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
  },
  ringCritical: {
    shadowColor: '#D32F2F',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  countdown: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
  },
  countdownWarning: { color: '#FFD600' },
  countdownCritical: { color: '#FF5252' },
  countdownLabel: {
    fontSize: 14,
    color: '#aaa',
    marginTop: -4,
  },
  messageBox: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 28,
  },
  messageLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  messageText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  safeButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  safeButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  helpButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  helpButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  iosNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});