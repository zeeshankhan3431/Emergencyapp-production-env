import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

interface Props {
  navigation: NavigationProp;
}

export const USER_INFO_KEY = '@ers_user_info';

const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkExisting = async () => {
      try {
        const stored = await AsyncStorage.getItem(USER_INFO_KEY);
        if (stored) {
          // Already onboarded, navigate away
          const nextScreen = Platform.OS === 'ios' ? 'IOSDisclosure' : 'Home';
          navigation.replace(nextScreen);
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    };
    checkExisting();
  }, [navigation]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedPhone) {
      Alert.alert('Required Fields', 'Please enter both your name and phone number to continue.');
      return;
    }

    try {
      const userInfo = JSON.stringify({ name: trimmedName, phone: trimmedPhone });
      await AsyncStorage.setItem(USER_INFO_KEY, userInfo);
      
      const nextScreen = Platform.OS === 'ios' ? 'IOSDisclosure' : 'Home';
      navigation.replace(nextScreen);
    } catch {
      Alert.alert('Error', 'Failed to save your details. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>
          To provide the best emergency response, please enter your details. This information will be sent to your emergency contacts when you trigger an alert.
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 234 567 8900"
            placeholderTextColor="#999"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
  },
  button: {
    backgroundColor: '#D32F2F',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
