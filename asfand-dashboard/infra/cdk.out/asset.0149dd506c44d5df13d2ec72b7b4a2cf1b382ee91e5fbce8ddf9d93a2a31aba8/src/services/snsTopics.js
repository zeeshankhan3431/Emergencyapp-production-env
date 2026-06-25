/**
 * SNS topic ARNs — naming: {name}-{env}
 * Set via environment / CDK outputs.
 */

/** @returns {string} */
export function emergencyAlertsTopicArn() {
  return process.env.SNS_EMERGENCY_ALERTS_ARN ?? '';
}

/** @returns {string} */
export function incidentUpdatesTopicArn() {
  return process.env.SNS_INCIDENT_UPDATES_ARN ?? '';
}

/** @returns {string} */
export function adminDigestTopicArn() {
  return process.env.SNS_ADMIN_DIGEST_ARN ?? '';
}
