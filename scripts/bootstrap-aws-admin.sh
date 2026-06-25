#!/usr/bin/env bash
# Create ERA admin + mobile service user in Cognito + PostgreSQL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/asfand-dashboard/server"
DEPLOY_ENV="${DEPLOY_ENV:-dev}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@era.dev}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-EraAdmin123!}"
ADMIN_NAME="${ADMIN_NAME:-ERA Admin}"

MOBILE_EMAIL="${MOBILE_EMAIL:-mobile3@era.dev}"
MOBILE_PASSWORD="${MOBILE_PASSWORD:-EraMobile123!}"
MOBILE_NAME="${MOBILE_NAME:-ERA Mobile Service}"

if [[ -f "$SERVER/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SERVER/.env"
  set +a
fi

POOL_ID="${COGNITO_USER_POOL_ID:-}"
CLIENT_ID="${COGNITO_CLIENT_ID:-}"

if [[ -z "$POOL_ID" ]]; then
  POOL_ID="$(aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "EraCompute-${DEPLOY_ENV}" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" \
    --output text 2>/dev/null || true)"
fi

if [[ -z "$POOL_ID" || "$POOL_ID" == "None" ]]; then
  echo "ERROR: COGNITO_USER_POOL_ID not found. Run ./scripts/configure-aws-env.sh first."
  exit 1
fi

echo "=== Creating Cognito users (pool: $POOL_ID) ==="

# Create or update Admin user
if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$ADMIN_EMAIL" --region "$REGION" >/dev/null 2>&1; then
  echo "Admin user exists — resetting password"
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" \
    --permanent \
    --region "$REGION"
else
  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true Name=name,Value="$ADMIN_NAME" \
    --message-action SUPPRESS \
    --region "$REGION"
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" \
    --permanent \
    --region "$REGION"
fi

# Create or update Mobile service user
if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$MOBILE_EMAIL" --region "$REGION" >/dev/null 2>&1; then
  echo "Mobile user exists — resetting password"
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$MOBILE_EMAIL" \
    --password "$MOBILE_PASSWORD" \
    --permanent \
    --region "$REGION"
else
  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$MOBILE_EMAIL" \
    --user-attributes Name=email,Value="$MOBILE_EMAIL" Name=email_verified,Value=true Name=name,Value="$MOBILE_NAME" \
    --message-action SUPPRESS \
    --region "$REGION"
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$MOBILE_EMAIL" \
    --password "$MOBILE_PASSWORD" \
    --permanent \
    --region "$REGION"
fi

# Enable USER_PASSWORD_AUTH on client
if [[ -n "${CLIENT_ID:-}" ]]; then
  aws cognito-idp update-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-id "$CLIENT_ID" \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --region "$REGION" >/dev/null 2>&1 || true
fi

# Determine API URL (production ALB or localhost)
API_URL="${API_URL:-}"
if [[ -z "$API_URL" ]]; then
  ALB_DNS="$(aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "EraHosting-${DEPLOY_ENV}" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiLoadBalancerUrl'].OutputValue | [0]" \
    --output text 2>/dev/null || true)"
  if [[ -n "$ALB_DNS" && "$ALB_DNS" != "None" ]]; then
    # ALB_DNS may already include http:// prefix
    if [[ "$ALB_DNS" =~ ^https?:// ]]; then
      API_URL="$ALB_DNS"
    else
      API_URL="http://${ALB_DNS}"
    fi
  else
    API_URL="http://localhost:3001"
  fi
fi

register_admin=$(cat <<JSON
{"email":"${ADMIN_EMAIL}","password":"${ADMIN_PASSWORD}","fullName":"${ADMIN_NAME}","role":"Admin"}
JSON
)

register_mobile=$(cat <<JSON
{"email":"${MOBILE_EMAIL}","password":"${MOBILE_PASSWORD}","fullName":"${MOBILE_NAME}","role":"Public"}
JSON
)

echo "Registering users in API database at $API_URL ..."
curl -sf -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Registration-Secret: ${REGISTRATION_ROLE_SECRET:-era-dev-admin-secret}" \
  -d "$register_admin" >/dev/null 2>&1 || echo "(admin may already exist in DB)"

curl -sf -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Registration-Secret: ${REGISTRATION_ROLE_SECRET:-era-dev-admin-secret}" \
  -d "$register_mobile" >/dev/null 2>&1 || echo "(mobile may already exist in DB)"

echo ""
echo "=== Users ready ==="
echo "Admin:    $ADMIN_EMAIL / $ADMIN_PASSWORD (role: Admin)"
echo "Mobile:   $MOBILE_EMAIL / $MOBILE_PASSWORD (role: Public)"
echo "API:      $API_URL"