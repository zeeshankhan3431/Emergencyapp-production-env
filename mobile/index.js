/**
 * index.js  — Milestone 2 update
 *
 * Registers the Headless JS task so Android can run background sensor
 * monitoring even when the React UI is not visible.
 */
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import HeadlessTask from './HeadlessTask';

// Main app
AppRegistry.registerComponent(appName, () => App);

// Android background task — no-op on iOS
AppRegistry.registerHeadlessTask('EmergencyMonitor', () => HeadlessTask);