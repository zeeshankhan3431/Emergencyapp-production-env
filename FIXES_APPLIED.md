# Fixes Applied - Dummy Data Issue Resolution

## Problem Summary
The admin dashboard was showing dummy data instead of real incident data from the mobile app. The root cause was that the production ECS Fargate service was not configured with `DATABASE_URL`, causing the backend to fall back to an in-memory PostgreSQL database (pg-mem) with pre-seeded dummy data.

## Root Cause Analysis

### Issue 1: Missing DATABASE_URL in Production
- **Location**: `asfand-dashboard/infra/lib/hosting-stack.ts`
- **Problem**: The ECS Fargate task environment variables included individual RDS credentials (`RDS_HOST`, `RDS_PORT`, `RDS_USER`, `RDS_DATABASE`, `RDS_PASSWORD`) but did not set `DATABASE_URL`.
- **Impact**: The backend's `pool.js` checked for `DATABASE_URL` and when missing, it would throw an error. However, the `initLocalMemoryDb.js` would initialize an in-memory database when `DATABASE_URL` was unset, leading to dummy data being used.

### Issue 2: Dummy Data Seeded in All Environments
- **Location**: `backend/src/dashboard/db/initLocalMemoryDb.js`
- **Problem**: The seed data (dummy incidents and users) was always inserted when using the in-memory database, regardless of environment.
- **Impact**: Even if the in-memory DB was used in production by mistake, dummy data would be present.

## Fixes Applied

### Fix 1: Construct DATABASE_URL from RDS Environment Variables
**File**: `backend/src/dashboard/db/pool.js`

```javascript
export function getPool() {
  if (!poolInstance) {
    let url = process.env.DATABASE_URL;
    
    // If DATABASE_URL is not set, construct it from individual RDS environment variables
    if (!url) {
      const { RDS_HOST, RDS_PORT, RDS_USER, RDS_DATABASE, RDS_PASSWORD } = process.env;
      if (!RDS_HOST || !RDS_PORT || !RDS_USER || !RDS_DATABASE || !RDS_PASSWORD) {
        throw new Error('DATABASE_URL is not set and RDS environment variables are incomplete');
      }
      url = `postgresql://${RDS_USER}:${RDS_PASSWORD}@${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}`;
    }
    
    poolInstance = new Pool({ connectionString: url });
  }
  return poolInstance;
}
```

**Rationale**: The ECS Fargate task already has RDS credentials as environment variables and secrets. This change allows the backend to construct the connection string dynamically, avoiding the need to expose the password in the environment at CDK synthesis time.

### Fix 2: Disable Dummy Data Seeding in Production
**File**: `backend/src/dashboard/db/initLocalMemoryDb.js`

```javascript
// Only seed data in development/staging, never in production
if (process.env.NODE_ENV !== 'production') {
  await pool.query(SEED_SQL);
}
```

**Rationale**: Ensures that even if the in-memory database is accidentally used in production, no dummy data will be inserted, maintaining data integrity.

## Data Flow Verification

### Mobile App → Backend
1. Mobile app triggers emergency via `EmergencyService.escalate()`
2. Calls `POST /api/incidents` with JWT authentication
3. Backend validates JWT token and extracts `user_id`
4. Incident is created in PostgreSQL RDS with real data
5. Real-time updates emitted via Socket.IO

### Backend → Dashboard
1. Dashboard calls `GET /api/dashboard/summary` with JWT authentication
2. Backend queries PostgreSQL RDS for real metrics and incidents
3. Returns actual data from the database (no dummy data)

## Authentication Setup

The mobile app uses hardcoded service account credentials:
- **Email**: `mobile3@era.dev`
- **Password**: `EraMobile123!`
- **Role**: Public

These credentials must be created in both Cognito and the PostgreSQL database via the bootstrap script:
```bash
./scripts/bootstrap-aws-admin.sh
```

## Deployment Steps

### 1. Redeploy Backend with Fixes
```bash
cd asfand-dashboard/infra
cdk deploy EraHosting-<env>  # Replace <env> with dev/staging/prod
```

This will:
- Rebuild the Docker image with the updated code
- Deploy to ECS Fargate
- The new container will use RDS credentials to connect to PostgreSQL

### 2. Verify Database Connection
Check ECS task logs to ensure:
- `[db] No DATABASE_URL — using in-memory Postgres` does NOT appear
- `[db] Database migrations applied` appears (if RUN_MIGRATIONS=true)
- No errors about missing DATABASE_URL

### 3. Create/Verify Mobile Service User
```bash
cd /home/zeeshan/emergency-response-app
./scripts/bootstrap-aws-admin.sh
```

### 4. Test Mobile App Integration
1. Update mobile app `PROD_API_BASE` in `mobile/src/config/apiConfig.ts` to point to production ALB
2. Build and install release APK
3. Trigger emergency on mobile device
4. Verify incident appears in admin dashboard

### 5. Verify Dashboard Shows Real Data
1. Login to admin dashboard
2. Check Dashboard page - metrics should reflect real incidents
3. Check Incidents page - should show incidents from mobile app
4. No dummy incidents (assault/medical with NYC coordinates) should appear

## Additional Notes

### CORS Configuration
CORS is configured with `origin: true, credentials: true` in both:
- `backend/src/server.js`
- `backend/src/dashboard/app.js`

This allows all origins with credentials, which is appropriate for the current setup. If you need to restrict origins, update the CORS configuration to specify allowed domains.

### MongoDB Connection
The backend also connects to MongoDB for emergency sessions (legacy routes `/api/emergency`). Ensure `MONGO_URI` is set in the ECS environment if you're using this feature.

### Environment Variables Required for Production
The ECS Fargate task requires these environment variables (already configured in hosting-stack.ts):
- `RDS_HOST`, `RDS_PORT`, `RDS_USER`, `RDS_DATABASE`
- `RDS_PASSWORD` (from AWS Secrets Manager)
- `NODE_ENV=production`
- `SKIP_AUTH=false`
- `RUN_MIGRATIONS=true`

## Verification Checklist

- [ ] Backend redeployed with fixes
- [ ] ECS logs show successful database connection (no in-memory DB message)
- [ ] Mobile service user exists in Cognito and PostgreSQL
- [ ] Mobile app can authenticate successfully
- [ ] Emergency trigger creates incident in PostgreSQL
- [ ] Dashboard shows real incident data (no dummy data)
- [ ] Dashboard metrics update in real-time

## Files Modified

1. `backend/src/dashboard/db/pool.js` - Added DATABASE_URL construction from RDS env vars
2. `backend/src/dashboard/db/initLocalMemoryDb.js` - Disabled dummy data seeding in production

## Support

If issues persist after deployment:
1. Check ECS task logs: `aws logs tail /era/api/<env> --follow`
2. Verify RDS connectivity from ECS task
3. Confirm mobile app authentication is working
4. Check that `mobile3@era.dev` user exists and has correct role
