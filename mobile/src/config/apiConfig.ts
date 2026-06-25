/**
 * API configuration for mobile app.
 * Override via react-native-config or edit DEV_MACHINE_IP for physical devices.
 */
import { Platform } from 'react-native';

/** LAN IP of dev machine — run `hostname -I` and set for real devices */
export const DEV_MACHINE_IP = '10.0.2.2';

const DEV_API_PORT = 3001;

function devApiBase(): string {
  // Use CloudFront URL for mobile testing (HTTPS, accessible from mobile networks)
  return 'https://d3kj7wc3d0h4x7.cloudfront.net/api';
}

/** Production API URL — set before release build */
export const PROD_API_BASE = 'https://d3kj7wc3d0h4x7.cloudfront.net/api';

export const API_BASE = __DEV__ ? devApiBase() : PROD_API_BASE;

/** Service account for mobile → incidents API (create in Cognito + DB) */
export const MOBILE_SERVICE_EMAIL = 'mobile3@era.dev';
export const MOBILE_SERVICE_PASSWORD = 'EraMobile123!';
