# Emergency Response App — Client Delivery Guide

## Executive Summary

The Emergency Response App (ERA) is a multi-platform system:

| Component | Technology | Status |
|-----------|------------|--------|
| **Mobile (Android)** | React Native 0.84 + Kotlin native modules | Feature-complete |
| **Mobile (iOS)** | React Native + best-effort motion (documented limits) | Feature-complete |
| **Admin Dashboard** | React 19 + Vite + Tailwind | Production-ready UI |
| **API Server** | Node.js Express + PostgreSQL | Production-ready |
| **AWS Infrastructure** | CDK (VPC, RDS, Lambda, ECS, CloudFront) | Deployable |

---

## Milestone Verification

### Milestone 1 — Architecture, Compliance & Core Setup ✅

| Requirement | Evidence |
|-------------|----------|
| System architecture | 5 CDK stacks: Network, Data, Compute, Observability, Hosting |
| Mobile + web project setup | `mobile/`, `asfand-dashboard/` |
| AWS infrastructure planning | `asfand-dashboard/infra/` |
| Permissions strategy | RBAC roles: Admin, Responder, Analyst, Public |
| UI from wireframes | Dashboard, Incidents, Analytics, Reports, Equipment, Settings |
| Compliance mapping | iOS disclosure screen, evidence consent, audit logs |

### Milestone 2 — Emergency Detection & Escalation ✅

| Requirement | Evidence |
|-------------|----------|
| Impact detection (Android) | `EmergencyForegroundService.kt` — 6-layer background persistence |
| Confirmation timer | `ConfirmationScreen.tsx` — 10s countdown |
| Emergency escalation | `EmergencyContext.tsx` state machine |
| Android foreground services | WakeLock, AlarmManager, JobScheduler, BootReceiver |
| iOS motion handling | `IOSMotionService.ts` + `IOSDisclosureScreen.tsx` |
| Platform emergency calling | `CallService.ts` — Android direct, iOS system sheet |
| SMS to contacts | `EmergencyModule.kt` native SMS |

### Milestone 3 — Audio, Cloud & Web Dashboard ✅

| Requirement | Evidence |
|-------------|----------|
| Background audio (Android) | `AudioRecordingService.ts` + `MediaRecorder` native |
| Encrypted cloud uploads | `/api/evidence` presigned S3 URLs + KMS |
| Backend APIs | Express routes: incidents, evidence, dashboard, analytics |
| Admin dashboard | Full React dashboard with live API |
| Secure data access | JWT + Cognito + RBAC + audit logger |
| AI trend pipelines | Kinesis → Lambda classifiers → DynamoDB ai_results |

### Milestone 4 — QA, AI Reports & Final Delivery ✅

| Requirement | Evidence |
|-------------|----------|
| QA testing | 24+ Vitest test files in `server/test/` |
| Battery optimization | Android `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| AI monthly reports | `monthlyReportGenerator` Lambda + EventBridge cron |
| Final documentation | This file + `asfand-dashboard/docs/WEB_SCOPE.md` |
| iOS limitations documented | `IOSDisclosureScreen.tsx` |
| Store-ready structure | Android/iOS project scaffolding complete |

---

## Architecture

```
Mobile App ──POST /api/incidents──► ECS Fargate API (ALB) ──► RDS PostgreSQL (private VPC)
                                         │
                                         ├──► Kinesis ──► Lambda (AI classifiers)
                                         ├──► S3 (evidence, transcripts, reports)
                                         ├──► DynamoDB (audit, ai_results, device tokens)
                                         └──► SNS/SQS (notifications)

Admin Dashboard (CloudFront + S3) ──► ECS Fargate API
```

**Why RDS is in a private VPC:** Security best practice — database is never exposed to the internet. The API runs inside the same VPC (ECS Fargate) and connects to RDS over private networking.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
cd asfand-dashboard && npm install && npm install --prefix server

# 2. Copy env (in-memory DB + mock Cognito for local)
cp server/.env.example server/.env

# 3. Start everything
chmod +x scripts/*.sh
./scripts/start-era-dev.sh
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| API health | http://localhost:3001/api/health |
| Login | `admin@era.dev` / `EraAdmin123!` |

---

## AWS Production Deployment

### Prerequisites
- AWS CLI v2 configured with IAM access keys
- Node.js 18+
- Docker (for ECS Fargate image build)

### Deploy all stacks

```bash
./scripts/deploy-aws.sh
```

This deploys: VPC, RDS, Redis, OpenSearch, DynamoDB, S3, Lambda, Cognito, ECS API, CloudFront dashboard hosting.

### Post-deploy setup

```bash
# Generate server/.env from stack outputs
./scripts/configure-aws-env.sh

# Create admin user in Cognito + database
./scripts/bootstrap-aws-admin.sh

# Build and deploy dashboard to CloudFront
./scripts/deploy-dashboard.sh
```

### Key URLs (after deploy)

```bash
aws cloudformation describe-stacks --stack-name EraHosting-dev \
  --query "Stacks[0].Outputs" --output table
```

---

## Mobile App Configuration

Edit `mobile/src/config/apiConfig.ts`:

```typescript
export const PROD_API_BASE = 'https://YOUR-ALB-DNS/api';
export const MOBILE_SERVICE_EMAIL = 'mobile@era.dev';
export const MOBILE_SERVICE_PASSWORD = 'EraMobile123!';
```

Create the mobile service user:
```bash
ADMIN_EMAIL=mobile@era.dev ADMIN_PASSWORD='EraMobile123!' ./scripts/bootstrap-aws-admin.sh
```

### Run mobile

```bash
cd mobile
npm install
npx react-native run-android   # or run-ios
```

---

## Credentials Reference

| Account | Email | Password | Role |
|---------|-------|----------|------|
| Admin | admin@era.dev | EraAdmin123! | Admin |
| Mobile service | mobile@era.dev | EraMobile123! | Public |

> Change all passwords before production handover.

---

## Known iOS Limitations (Transparent)

Per Apple platform policy, iOS cannot match Android background capabilities:

- No background accelerometer-based fall detection
- No background audio recording
- 911 calls require mandatory system confirmation sheet
- Motion detection is foreground / best-effort only

These are documented in-app via `IOSDisclosureScreen`.

---

## File Reference

| Path | Purpose |
|------|---------|
| `asfand-dashboard/server/` | Express API |
| `asfand-dashboard/infra/` | AWS CDK stacks |
| `asfand-dashboard/src/` | React dashboard |
| `mobile/` | React Native app |
| `scripts/deploy-aws.sh` | Deploy all CDK stacks |
| `scripts/configure-aws-env.sh` | Generate server/.env |
| `scripts/bootstrap-aws-admin.sh` | Create admin user |
| `scripts/start-era-dev.sh` | Local dev launcher |
| `scripts/deploy-dashboard.sh` | Deploy UI to CloudFront |

---

## Support Checklist for Client Handover

- [ ] Deploy AWS stacks to client's account
- [ ] Run migrations on RDS (`RUN_MIGRATIONS=true` in ECS)
- [ ] Create admin + mobile service users
- [ ] Deploy dashboard to CloudFront
- [ ] Configure mobile `PROD_API_BASE` with ALB URL
- [ ] Set up custom domain + SSL (optional: ACM certificate on ALB/CloudFront)
- [ ] Configure SageMaker model URIs in `cdk.json` when AI models are trained
- [ ] App Store / Play Store signing certificates
