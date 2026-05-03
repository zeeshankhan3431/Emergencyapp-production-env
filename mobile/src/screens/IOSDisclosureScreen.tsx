/**
 * IOSDisclosureScreen.tsx
 *
 * Shown to iOS users on first launch.
 * Clearly explains platform limitations per client brief Section 2 & 3.1:
 * "Feature behaviour is equivalent in purpose, not identical in implementation"
 * "This limitation is clearly disclosed to users."
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';

const IOSDisclosureScreen: React.FC = () => {
  const nav = useNavigation<any>();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      <Text style={styles.title}>Important iOS Information</Text>
      <Text style={styles.subtitle}>
        Please read before using the Emergency Response app on iPhone
      </Text>

      {/* What works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✅ What Works on iPhone</Text>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Manual Emergency Button</Text>
          <Text style={styles.itemDesc}>
            Always available. Tap the red button to trigger emergency flow instantly.
          </Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Impact Detection (App Open)</Text>
          <Text style={styles.itemDesc}>
            When the app is open or recently used, the accelerometer monitors for
            sudden impacts using Core Motion. A 10-second confirmation screen
            will appear automatically.
          </Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>10-Second Confirmation Timer</Text>
          <Text style={styles.itemDesc}>
            After any impact or manual trigger, you have 10 seconds to confirm
            you are safe. If no action taken, emergency services are alerted.
          </Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Location Sharing</Text>
          <Text style={styles.itemDesc}>
            Your location is shared with emergency responders when an emergency is active.
          </Text>
        </View>
      </View>

      {/* iOS Limitations */}
      <View style={[styles.section, styles.limitationSection]}>
        <Text style={[styles.sectionTitle, styles.limitationTitle]}>
          ⚠️ iOS Platform Limitations
        </Text>

        <View style={styles.limitationItem}>
          <Text style={styles.limitationItemTitle}>
            Background Impact Detection — Not Available
          </Text>
          <Text style={styles.limitationItemDesc}>
            Apple does not allow always-on background sensor access. Impact
            detection is only active when the app is open or very recently used.
            For maximum protection, keep the app open in the foreground.
          </Text>
        </View>

        <View style={styles.limitationItem}>
          <Text style={styles.limitationItemTitle}>
            Automatic 911 Calling — Not Available
          </Text>
          <Text style={styles.limitationItemDesc}>
            Apple strictly prohibits automatic or silent emergency calls.
            When an emergency is triggered, your iPhone will show a
            confirmation screen — you must tap "Call" to connect.
            This is an Apple requirement that cannot be bypassed.
          </Text>
        </View>

        <View style={styles.limitationItem}>
          <Text style={styles.limitationItemTitle}>
            Hardware Button Triggers — Not Available
          </Text>
          <Text style={styles.limitationItemDesc}>
            iOS reserves hardware button combinations for Apple Emergency SOS.
            Only the in-app red button can trigger emergencies.
          </Text>
        </View>
      </View>

      {/* Recommendation */}
      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>💡 Recommendation for iPhone Users</Text>
        <Text style={styles.tipText}>
          Keep the Emergency Response app open in the foreground when you need
          full impact detection protection. Use the manual Emergency button
          whenever possible for the most reliable response.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => nav.navigate('Home')}
        accessibilityRole="button">
        <Text style={styles.buttonText}>I Understand — Continue</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

export default IOSDisclosureScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },

  title: {
    fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: '#666', marginBottom: 28, lineHeight: 20,
  },

  section: {
    backgroundColor: '#F8F9FA', borderRadius: 14, padding: 16, marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 14,
  },

  item: { marginBottom: 14 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginBottom: 3 },
  itemDesc: { fontSize: 13, color: '#555', lineHeight: 19 },

  limitationSection: { backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#FFCDD2' },
  limitationTitle: { color: '#C62828' },
  limitationItem: {
    marginBottom: 14, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#FFCDD2',
  },
  limitationItemTitle: {
    fontSize: 14, fontWeight: '700', color: '#B71C1C', marginBottom: 4,
  },
  limitationItemDesc: { fontSize: 13, color: '#555', lineHeight: 19 },

  tipBox: {
    backgroundColor: '#E8F5E9', borderRadius: 12, padding: 16,
    marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#4CAF50',
  },
  tipTitle: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginBottom: 6 },
  tipText: { fontSize: 13, color: '#2E7D32', lineHeight: 19 },

  button: {
    backgroundColor: colors.danger, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});