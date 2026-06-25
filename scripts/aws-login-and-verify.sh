#!/usr/bin/env bash
# Fix invalid ~/.aws/credentials and sign in via browser (aws login).
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

echo "=== Current AWS config (should have NO access_key after cleanup) ==="
aws configure list || true

echo ""
echo "=== Browser login (use your AWS Console user + password in the BROWSER, not here) ==="
aws login

echo ""
echo "=== Region / output ==="
aws configure set region us-east-1
aws configure set output json

echo ""
echo "=== Verify ==="
aws sts get-caller-identity

echo ""
echo "OK. Next:"
echo "  cd /home/zeeshan/emergency-response-app/asfand-dashboard/infra"
echo "  export CDK_DEFAULT_ACCOUNT=\$(aws sts get-caller-identity --query Account --output text)"
echo "  export CDK_DEFAULT_REGION=us-east-1"
echo "  npm run build && npx cdk bootstrap aws://\${CDK_DEFAULT_ACCOUNT}/\${CDK_DEFAULT_REGION} && npm run deploy"
