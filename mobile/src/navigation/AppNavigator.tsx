/**
 * AppNavigator.tsx — Updated with iOS disclosure screen
 */

import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { EmergencyProvider } from '../context/EmergencyContext';
import HomeScreen from '../screens/HomeScreen';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import EmergencyActiveScreen from '../screens/EmergencyActiveScreen';
import IOSDisclosureScreen from '../screens/IOSDisclosureScreen';

export type RootStackParamList = {
  Home: undefined;
  Confirmation: undefined;
  EmergencyActive: undefined;
  IOSDisclosure: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  // Show iOS disclosure screen first on iPhone
  const initialRoute = Platform.OS === 'ios' ? 'IOSDisclosure' : 'Home';

  return (
    <EmergencyProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_bottom',
          }}>

          {/* iOS-only: limitation disclosure screen */}
          {Platform.OS === 'ios' && (
            <Stack.Screen
              name="IOSDisclosure"
              component={IOSDisclosureScreen}
              options={{ animation: 'fade' }}
            />
          )}

          <Stack.Screen name="Home" component={HomeScreen} />

          <Stack.Screen
            name="Confirmation"
            component={ConfirmationScreen}
            options={{ gestureEnabled: false }}
          />

          <Stack.Screen
            name="EmergencyActive"
            component={EmergencyActiveScreen}
            options={{ gestureEnabled: false }}
          />

        </Stack.Navigator>
      </NavigationContainer>
    </EmergencyProvider>
  );
};

export default AppNavigator;