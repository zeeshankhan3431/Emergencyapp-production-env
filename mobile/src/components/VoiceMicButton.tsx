/**
 * VoiceMicButton — speech-to-text for emergency message fields.
 *
 * Android: system speech recognizer (Intent) via NativeModules.EmergencyModule
 *   — reliable on emulator; shows Google “Speak now” UI.
 * iOS: @react-native-voice/voice if linked; else type manually.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Alert,
  Platform,
  NativeModules,
  PermissionsAndroid,
} from 'react-native';
import { colors } from '../theme/colors';

/** Do not import @react-native-voice/voice at top level — on Android it can throw / reject and cause a red "uncaught (in promise)" banner. */
function getIOSVoiceModule(): {
  onSpeechStart: (cb: () => void) => void;
  onSpeechResults: (cb: (e: { value?: string[] }) => void) => void;
  onSpeechError: (cb: () => void) => void;
  onSpeechEnd: (cb: () => void) => void;
  start: (locale: string) => Promise<void>;
  destroy: () => Promise<void> | void;
  removeAllListeners: () => void;
} | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-voice/voice').default;
  } catch {
    return null;
  }
}

interface Props {
  onResult: (text: string) => void;
  language?: string; // BCP-47 e.g. 'en-US', 'ur-PK', 'hi-IN'
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: '🇺🇸 English' },
  { code: 'ur-PK', label: '🇵🇰 Urdu' },
  { code: 'hi-IN', label: '🇮🇳 Hindi' },
  { code: 'ar-SA', label: '🇸🇦 Arabic' },
  { code: 'fr-FR', label: '🇫🇷 French' },
];

function formatSpeechError(err: any): string {
  const raw = String(err?.message ?? err ?? '');
  // Android SpeechRecognizer legacy codes; error 7 = NO_MATCH
  if (raw.includes('error code: 7') || raw.includes('code: 7')) {
    return (
      'No speech recognized (code 7).\n\n' +
      'Emulator: open Extended Controls (⋯) → Microphone → turn on virtual mic, or use a real device.\n' +
      'Also try English (en-US) first, speak after the beep, and keep the mic close.'
    );
  }
  if (raw.includes('code: 6') || raw.includes('error code: 6')) {
    return 'Listening timed out. Please speak a little longer, then pause.';
  }
  return raw || 'Could not capture speech. Please try again or type your message.';
}

const VoiceMicButton: React.FC<Props> = ({ onResult, language = 'en-US' }) => {
  const [isListening, setIsListening] = useState(false);
  const [selectedLang, setSelectedLang] = useState(language);

  // iOS only: react-native-voice event wiring
  useEffect(() => {
    const Voice = getIOSVoiceModule();
    if (!Voice) return;

    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechResults = (event: { value?: string[] }) => {
      const text = event?.value?.[0]?.trim();
      if (text) onResult(text);
    };
    Voice.onSpeechError = () => setIsListening(false);
    Voice.onSpeechEnd = () => setIsListening(false);

    return () => {
      void Promise.resolve(Voice.destroy?.())
        .catch(() => {})
        .finally(() => {
          try {
            Voice.removeAllListeners();
          } catch {
            /* noop */
          }
        });
    };
  }, [onResult]);

  const startAndroidSpeech = useCallback(async () => {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        'Microphone Permission',
        'Please allow microphone permission to use voice input.',
      );
      return;
    }

    if (!NativeModules.EmergencyModule?.startSpeechRecognition) {
      Alert.alert('Voice Error', 'Speech module not linked. Rebuild the app.');
      return;
    }

    setIsListening(true);
    try {
      const result = await NativeModules.EmergencyModule.startSpeechRecognition(
        selectedLang,
      );
      const text = result?.text?.trim();
      if (text) {
        onResult(text);
      } else {
        Alert.alert(
          'Voice Error',
          'No text returned. Try speaking again or type your message.',
        );
      }
    } catch (err: any) {
      Alert.alert('Voice Error', formatSpeechError(err));
    } finally {
      setIsListening(false);
    }
  }, [onResult, selectedLang]);

  const startListening = useCallback(async () => {
    if (Platform.OS === 'android') {
      await startAndroidSpeech();
      return;
    }

    if (Platform.OS === 'ios') {
      const Voice = getIOSVoiceModule();
      if (!Voice) {
        Alert.alert(
          'Voice Input',
          'Voice module is not available. Type your message or rebuild with @react-native-voice/voice linked.',
        );
        return;
      }
      try {
        setIsListening(true);
        await Voice.start(selectedLang);
      } catch (err: any) {
        setIsListening(false);
        Alert.alert('Voice Error', err?.message ?? 'Voice input failed.');
      }
      return;
    }

    Alert.alert('Voice Input', 'Voice input is only configured for Android and iOS.');
  }, [selectedLang, startAndroidSpeech]);

  const showLangPicker = () => {
    Alert.alert(
      '🌐 Select Language',
      'Choose the language you will speak in:',
      [
        ...SUPPORTED_LANGUAGES.map(lang => ({
          text: lang.label,
          onPress: () => setSelectedLang(lang.code),
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.micButton, isListening && styles.micButtonActive]}
        onPress={startListening}
        onLongPress={showLangPicker}
        accessibilityLabel="Tap to speak, long press to change language"
        accessibilityRole="button">
        <Text style={styles.micIcon}>{isListening ? '🔴' : '🎤'}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        {isListening ? 'Listening…' : `Tap to speak (${selectedLang})`}
      </Text>
      {Platform.OS === 'android' ? (
        <Text style={styles.langHint}>
          Google speech UI opens — enable Microphone in emulator Extended Controls (⋯)
        </Text>
      ) : null}
    </View>
  );
};

export default VoiceMicButton;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 8,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  micButtonActive: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FF0000',
    shadowColor: '#FF0000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  micIcon: { fontSize: 28 },
  hint: { marginTop: 6, fontSize: 12, color: '#555', fontWeight: '600' },
  langHint: { fontSize: 10, color: '#999', marginTop: 2, textAlign: 'center' },
});
