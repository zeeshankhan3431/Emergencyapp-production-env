process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
process.env.JWT_ISSUER = 'security-app-api';
process.env.JWT_AUDIENCE = 'security-app-clients';
process.env.COGNITO_USE_MOCK = 'true';
process.env.AUDIT_LOG_DISABLED = 'true';
process.env.SKIP_AUTH = 'false';
process.env.KINESIS_USE_MOCK = 'true';
process.env.SNS_USE_MOCK = 'true';
process.env.S3_USE_MOCK = 'true';
process.env.SQS_USE_MOCK = 'true';
process.env.EVIDENCE_AUDIT_DISABLED = 'true';
// Module 4 mocks
process.env.SAGEMAKER_USE_MOCK       = 'true';
process.env.AI_RESULTS_DISABLED      = 'true';
process.env.SSM_USE_MOCK             = 'true';
process.env.TRANSCRIBE_USE_MOCK      = 'true';
process.env.LLM_USE_MOCK             = 'true';
process.env.SECRETS_MANAGER_USE_MOCK = 'true';
// Module 5 — dashboard / analytics
process.env.REPORTS_INDEX_DISABLED = 'true';
process.env.REPORTS_LLM_MOCK = 'true';
process.env.CONTENT_USE_MOCK = 'true';
process.env.OPENSEARCH_USE_MOCK = 'true';
// Module 6 — devices / notifications
process.env.DEVICE_TOKENS_USE_MOCK = 'true';
process.env.NOTIFICATION_LOG_DISABLED = 'true';
process.env.SMS_DISPATCH_USE_MOCK = 'true';
process.env.FCM_USE_MOCK = 'true';
