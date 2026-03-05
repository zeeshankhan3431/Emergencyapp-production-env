/**
 * HomeScreen.tsx — Final stable version
 *
 * Key fix: On mount, calls NativeModules.EmergencyModule.getPendingImpact()
 * to check if app was opened from a background impact notification.
 * This is safe because it happens AFTER JS is fully loaded.
 * No more crashes from premature native-to-JS bridge calls.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  StatusBar,
  Alert,
  PermissionsAndroid,
  NativeModules,
  Linking,
} from 'react-native';
import { useEmergencyFlow, EmergencyFlowBridge } from '../hooks/useEmergencyFlow';
import { useEmergency } from '../context/EmergencyContext';
import { impactDetectionService } from '../services/ImpactDetectionService';
import { colors } from '../theme/colors';

let setupDone = false;

const SCENARIOS = [
  { label: '🚨 Assault / Violence', message: 'I am being assaulted. Send help immediately.' },
  { label: '🏥 Medical Emergency', message: 'Medical emergency. I need an ambulance.' },
  { label: '🚗 Kidnapping', message: 'I am being kidnapped. Track this device.' },
  { label: '🔥 Fire / Hazard', message: 'Fire or hazardous situation. Evacuate needed.' },
];

const HomeScreen: React.FC = () => {
  const { triggerManual, setScenario, emergencyState } = useEmergencyFlow();
  const { markImpact } = useEmergency();

  // ── 1. Check if opened from background impact notification ─────────────────
  useEffect(() => {
    const checkPendingImpact = async () => {
      if (Platform.OS !== 'android') return;
      if (!NativeModules.EmergencyModule) return;

      try {
        // Safe to call here — JS is fully loaded at this point
        const result = await NativeModules.EmergencyModule.getPendingImpact();
        if (result?.impact === true) {
          console.log('[HomeScreen] Pending impact found, magnitude:', result.magnitude);
          // Small delay to let navigation settle before triggering flow
          setTimeout(() => {
            markImpact();
          }, 300);
        }
      } catch (err) {
        console.warn('[HomeScreen] getPendingImpact error:', err);
      }
    };

    checkPendingImpact();
  }, [markImpact]);

  // ── 2. One-time permissions + battery optimization request ──────────────────
  useEffect(() => {
    if (setupDone) return;
    setupDone = true;

    const setup = async () => {
      if (Platform.OS !== 'android') return;
      try {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        ]);

        const locationGranted =
          results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted' ||
          results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === 'granted';

        if (!locationGranted) {
          Alert.alert(
            'Location Required',
            'Location permission is needed to share your position with emergency responders.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Later', style: 'cancel' },
            ],
          );
          return;
        }

        // Request Doze exemption once
        setTimeout(() => {
          Alert.alert(
            '🔋 Enable Background Protection',
            'To detect emergencies when screen is locked:\n\n' +
            'Settings → Apps → Emergency Response → Battery → Unrestricted\n\n' +
            'This only needs to be done once.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Already Done', style: 'cancel' },
            ],
          );
        }, 1500);

      } catch (err) {
        console.warn('[HomeScreen] Setup error:', err);
      }
    };

    setup();
  }, []);

  // ── 3. Start foreground service + JS sensor ─────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android' && NativeModules.EmergencyModule) {
      NativeModules.EmergencyModule.startForegroundService()
        .then(() => console.log('[HomeScreen] Foreground service started'))
        .catch((err: any) => console.warn('[HomeScreen] Service error:', err));
    }

    EmergencyFlowBridge.register(() => {
      markImpact();
    });

    if (!impactDetectionService.running) {
      impactDetectionService.start(magnitude => {
        EmergencyFlowBridge.onImpact(magnitude);
      });
    }

    return () => {
      EmergencyFlowBridge.register(() => {});
    };
  }, [markImpact]);

  const handleScenarioSelect = (message: string, label: string) => {
    setScenario(message);
    Alert.alert('Scenario Set', `"${label}" selected.`, [{ text: 'OK' }]);
  };

  const sensorActive = impactDetectionService.running;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>Emergency Response</Text>
        <View style={[styles.badge, sensorActive ? styles.badgeOn : styles.badgeOff]}>
          <Text style={styles.badgeText}>
            {sensorActive ? '🟢 Sensor Active' : '🔴 Sensor Off'}
          </Text>
        </View>
      </View>

      {Platform.OS === 'ios' && (
        <View style={styles.warningNotice}>
          <Text style={styles.noticeText}>
            ⚠️ On iOS, impact detection only works while the app is open.
          </Text>
        </View>
      )}

      {Platform.OS === 'android' && sensorActive && (
        <View style={styles.successNotice}>
          <Text style={styles.noticeText}>
            🛡️ Protected while app is open or minimized.{'\n'}
            For lock screen protection: set battery to Unrestricted.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={triggerManual}
        activeOpacity={0.8}
        accessibilityLabel="Trigger emergency"
        accessibilityRole="button">
        <Text style={styles.emergencyIcon}>🚨</Text>
        <Text style={styles.emergencyLabel}>EMERGENCY</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Select Scenario (Optional)</Text>
      <Text style={styles.sectionSubtitle}>
        Pre-select your situation so responders receive the right message.
      </Text>

      {SCENARIOS.map(s => (
        <TouchableOpacity
          key={s.message}
          style={[
            styles.scenarioCard,
            emergencyState.scenarioMessage === s.message && styles.scenarioCardSelected,
          ]}
          onPress={() => handleScenarioSelect(s.message, s.label)}
          accessibilityRole="button">
          <Text style={styles.scenarioLabel}>{s.label}</Text>
          {emergencyState.scenarioMessage === s.message && (
            <Text style={styles.scenarioCheck}>✓</Text>
          )}
        </TouchableOpacity>
      ))}

      <Text style={styles.footer}>
        Impact threshold: 2.5g · Confirmation: 10 seconds{'\n'}
        Native Kotlin sensor · Background protection active
      </Text>
    </ScrollView>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  badgeOn: { backgroundColor: '#E6F4EA' },
  badgeOff: { backgroundColor: '#FDECEA' },
  badgeText: { fontSize: 13, fontWeight: '600' },
  warningNotice: {
    backgroundColor: '#FFF8E1', borderRadius: 10, padding: 14,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#FFC107',
  },
  successNotice: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 14,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#4CAF50',
  },
  noticeText: { fontSize: 13, color: '#333', lineHeight: 19 },
  emergencyButton: {
    backgroundColor: colors.danger, borderRadius: 120,
    width: 200, height: 200, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginVertical: 28,
    shadowColor: '#D32F2F', shadowOpacity: 0.5, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  emergencyIcon: { fontSize: 60 },
  emergencyLabel: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 2, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
  scenarioCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  scenarioCardSelected: { borderColor: colors.danger, backgroundColor: '#FFF5F5' },
  scenarioLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  scenarioCheck: { fontSize: 18, color: colors.danger },
  footer: { marginTop: 32, fontSize: 11, color: '#999', textAlign: 'center', lineHeight: 18 },
});