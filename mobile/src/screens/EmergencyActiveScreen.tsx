/**
 * EmergencyActiveScreen.tsx  — Milestone 2 rewrite
 *
 * Displayed while an emergency session is ACTIVE (after escalation).
 * Shows:
 *  - Session ID / status
 *  - Elapsed time
 *  - Location sharing status
 *  - "I'm Safe – End Emergency" button
 *  - Retry call button
 *
 * Audio recording (Milestone 3) will plug into this screen later.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { useEmergencyFlow } from '../hooks/useEmergencyFlow';
import { callService } from '../services/CallService';
import { emergencyService } from '../services/EmergencyService';
import { colors } from '../theme/colors';

const EmergencyActiveScreen: React.FC = () => {
  const { emergencyState, endEmergency } = useEmergencyFlow();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [locationText, setLocationText] = useState('Fetching…');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Elapsed timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Location display ────────────────────────────────────────────────────────
  useEffect(() => {
    if (emergencyState.location) {
      const { lat, lng } = emergencyState.location;
      setLocationText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else {
      // Try fetching again (may not have been available at escalation time)
      emergencyService.getCurrentLocation().then(loc => {
        if (loc) setLocationText(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
        else setLocationText('Unavailable');
      });
    }
  }, [emergencyState.location]);

  // ── Pulsing red dot animation ───────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatElapsed = (s: number): string => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      scrollEnabled={false}>
      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <Animated.View style={[styles.activeDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.headerText}>EMERGENCY ACTIVE</Text>
      </View>

      {/* ── Elapsed time ── */}
      <Text style={styles.elapsed}>{formatElapsed(elapsedSeconds)}</Text>
      <Text style={styles.elapsedLabel}>elapsed</Text>

      {/* ── Info cards ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Session ID</Text>
        <Text style={styles.cardValue}>{emergencyState.sessionId ?? '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Your Location (shared with responders)</Text>
        <Text style={styles.cardValue}>{locationText}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Message Sent</Text>
        <Text style={styles.cardValue}>{emergencyState.scenarioMessage}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Platform</Text>
        <Text style={styles.cardValue}>
          {Platform.OS === 'android' ? '🤖 Android' : '🍎 iOS'}
        </Text>
      </View>

      {/* ── Recording notice (M3 placeholder) ── */}
      <View style={[styles.card, styles.recordingCard]}>
        <Text style={styles.cardLabel}>🎙 Audio Recording</Text>
        <Text style={styles.cardValue}>Will activate in Milestone 3</Text>
      </View>

      {/* ── Retry call ── */}
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => callService.initiateEmergencyCall()}
        accessibilityRole="button"
        accessibilityLabel="Retry call to 911">
        <Text style={styles.retryButtonText}>📞  Retry 911 Call</Text>
      </TouchableOpacity>

      {/* ── End emergency ── */}
      <TouchableOpacity
        style={styles.endButton}
        onPress={endEmergency}
        accessibilityRole="button"
        accessibilityLabel="I am safe – end emergency">
        <Text style={styles.endButtonText}>✅  I'm Safe – End Emergency</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Your data is encrypted and shared only with authorised responders.
      </Text>
    </ScrollView>
  );
};

export default EmergencyActiveScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 24, paddingBottom: 48, alignItems: 'center' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF1744',
    marginRight: 10,
  },
  headerText: {
    color: '#FF1744',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },

  elapsed: { color: '#fff', fontSize: 64, fontWeight: '900', marginTop: 8 },
  elapsedLabel: { color: '#888', fontSize: 14, marginBottom: 28 },

  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    marginBottom: 12,
  },
  recordingCard: { borderWidth: 1, borderColor: '#333', borderStyle: 'dashed' },
  cardLabel: { fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { fontSize: 15, color: '#fff', fontWeight: '600' },

  retryButton: {
    backgroundColor: '#1565C0',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  endButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  endButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  footer: { fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 18 },
});