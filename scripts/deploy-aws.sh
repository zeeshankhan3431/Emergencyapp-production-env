#!/usr/bin/env bash
# Deploy Emergency Response AWS stacks (CDK).
# Requires: Node 18+, AWS credentials (NOT console password).
#
# One-time IAM setup (AWS Console → IAM → Users → your user → Security credentials):
#   Create access key → export:
#     export AWS_ACCESS_KEY_ID="..."
#     export AWS_SECRET_ACCESS_KEY="..."
#     export AWS_DEFAULT_REGION="us-east-1"
#     export CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
#     export CDK_DEFAULT_REGION="${AWS_DEFAULT_REGION}"
#
# Install AWS CLI v2 if missing: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/asfand-dashboard/infra"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found. Install AWS CLI v2, then rerun."
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials not configured. Run: aws configure"
  echo "       (use IAM access key, not console password)"
  exit 1
fi

export CDK_DEFAULT_ACCOUNT="${CDK_DEFAULT_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text)}"
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

echo "Deploying to account=$CDK_DEFAULT_ACCOUNT region=$CDK_DEFAULT_REGION"

cd "$INFRA"
npm install
npm run build
npm run bootstrap -- "aws://${CDK_DEFAULT_ACCOUNT}/${CDK_DEFAULT_REGION}"
npm run deploy

echo ""
echo "Fetching stack outputs (save for server/.env):"
aws cloudformation describe-stacks \
  --stack-name "EraCompute-dev" \
  --query "Stacks[0].Outputs" \
  --output table 2>/dev/null || echo "(stack outputs available after deploy completes)"

echo ""
echo "Next steps:"
echo "  ./scripts/configure-aws-env.sh   # generate server/.env"
echo "  ./scripts/bootstrap-aws-admin.sh   # create admin@era.dev"
echo "  ./scripts/deploy-dashboard.sh      # deploy UI to CloudFront"
