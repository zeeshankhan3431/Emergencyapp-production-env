#!/usr/bin/env bash
# Build dashboard and deploy static assets to S3 + invalidate CloudFront.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DASH="$ROOT/asfand-dashboard"
DEPLOY_ENV="${DEPLOY_ENV:-dev}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

BUCKET="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "EraHosting-${DEPLOY_ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardBucketName'].OutputValue | [0]" \
  --output text)"

DIST_ID="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "EraHosting-${DEPLOY_ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardDistributionId'].OutputValue | [0]" \
  --output text)"

DASHBOARD_URL="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "EraHosting-${DEPLOY_ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardCloudFrontUrl'].OutputValue | [0]" \
  --output text)"

API_URL="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "EraHosting-${DEPLOY_ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiLoadBalancerUrl'].OutputValue | [0]" \
  --output text)"

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  echo "ERROR: EraHosting stack not deployed. Run ./scripts/deploy-aws.sh first."
  exit 1
fi

echo "Building dashboard (API via CloudFront ${DASHBOARD_URL}/api)..."
cd "$DASH"
npm install
VITE_API_URL="/api" npm run build

echo "Syncing to s3://${BUCKET}..."
aws s3 sync dist/ "s3://${BUCKET}/" --delete --region "$REGION"

if [[ -n "$DIST_ID" && "$DIST_ID" != "None" ]]; then
  echo "Invalidating CloudFront ${DIST_ID}..."
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*" >/dev/null
fi

DASHBOARD_URL="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "EraHosting-${DEPLOY_ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardCloudFrontUrl'].OutputValue | [0]" \
  --output text)"

echo ""
echo "Dashboard deployed: $DASHBOARD_URL"
echo "API (via CloudFront): ${DASHBOARD_URL}/api/health"
echo "API (direct ALB):     ${API_URL}/api/health"
