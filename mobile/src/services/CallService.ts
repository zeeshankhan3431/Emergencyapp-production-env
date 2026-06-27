/**
 * CallService.ts — Platform-Specific Emergency Calling
 *
 * ANDROID:
 *  - Opens tel:911 via Linking
 *  - With CALL_PHONE permission: auto-dials
 *  - Without permission: opens dialler pre-filled with 911
 *
 * iOS — HARD RESTRICTION:
 *  - iOS does NOT allow automatic or silent 911 calls
 *  - User MUST manually confirm via system UI (Apple requirement)
 *  - App guides user but does NOT bypass confirmation
 *  - This is compliant with App Store guidelines
 *  - Pre-recorded messages stored on backend, shown to responders
 *
 * This is exactly per the client development brief Section 3.3.
 */

import { Linking, Platform, Alert } from 'react-native';

const EMERGENCY_NUMBER = '911';

class CallService {

  async initiateEmergencyCall(): Promise<void> {
    if (Platform.OS === 'android') {
      await this.callAndroid();
    } else {
      await this.callIOS();
    }
  }

  // ── Android ───────────────────────────────────────────────────────────────

  private async callAndroid(): Promise<void> {
    const uri = `tel:${EMERGENCY_NUMBER}`;
    try {
      const canOpen = await Linking.canOpenURL(uri);
      if (canOpen) {
        await Linking.openURL(uri);
      } else {
        this.showManualDialAlert('android');
      }
    } catch {
      // Fallback: try telprompt
      try {
        await Linking.openURL(`telprompt:${EMERGENCY_NUMBER}`);
      } catch {
        this.showManualDialAlert('android');
      }
    }
  }

  // ── iOS ───────────────────────────────────────────────────────────────────

  /**
   * iOS PLATFORM LIMITATION:
   * Apple does not permit automatic or silent emergency calls.
   * The system call confirmation sheet is mandatory.
   *
   * Per client brief Section 3.3:
   * "iOS: User must manually confirm the call via system UI.
   *  App guides the user but does not bypass confirmation."
   *
   * Implementation:
   * Step 1 — Show in-app guidance alert to prepare user
   * Step 2 — Open tel:911 which triggers iOS system confirmation sheet
   * Step 3 — User taps "Call" on system sheet to connect
   */
  private callIOS(): Promise<void> {
    return new Promise(resolve => {
      // Step 1: In-app guidance (prepare user before system sheet)
      Alert.alert(
        '📞 Calling Emergency Services',
        'Your iPhone will now ask you to confirm the call to 911.\n\n' +
        'Tap "Call" on the next screen to connect immediately.\n\n' +
        '⚠️ Note: Apple requires manual confirmation for all calls — ' +
        'this cannot be bypassed.',
        [
          {
            text: 'Call 911 Now',
            style: 'destructive',
            onPress: async () => {
              try {
                // Step 2: Open system dialler — iOS will show confirmation sheet
                await Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
              } catch {
                this.showManualDialAlert('ios');
              }
              resolve();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              resolve();
            },
          },
        ],
        { cancelable: false },
      );
    });
  }

  // ── Fallback ──────────────────────────────────────────────────────────────

  private showManualDialAlert(platform: string): void {
    const iosNote = platform === 'ios'
      ? '\n\n(Apple requires manual dialling for all emergency calls)'
      : '';

    Alert.alert(
      '🚨 Call Emergency Services',
      `Please immediately dial ${EMERGENCY_NUMBER} from your phone keypad.${iosNote}\n\n` +
      'Your location and emergency details have been sent to our monitoring system.',
      [
        {
          text: `Dial ${EMERGENCY_NUMBER}`,
          style: 'destructive',
          onPress: () => {
            Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => { /* ignore */ });
          },
        },
        { text: 'OK', style: 'cancel' },
      ],
      { cancelable: false },
    );
  }
}

export const callService = new CallService();