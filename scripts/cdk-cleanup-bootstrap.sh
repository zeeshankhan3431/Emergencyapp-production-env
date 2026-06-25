#!/usr/bin/env bash
# Fix stuck CDK bootstrap (CDKToolkit DELETE_FAILED) for account 946849521533 / us-east-1.
# Requires IAM permissions: delete roles, CloudFormation delete stack, S3 empty bucket.
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT="${CDK_DEFAULT_ACCOUNT:-946849521533}"
QUALIFIER="${CDK_QUALIFIER:-hnb659fds}"

echo "Account=$ACCOUNT Region=$REGION Qualifier=$QUALIFIER"
aws sts get-caller-identity

ROLE_PREFIX="cdk-${QUALIFIER}"
echo ""
echo "=== IAM roles matching ${ROLE_PREFIX}* ==="
aws iam list-roles --query "Roles[?starts_with(RoleName, '${ROLE_PREFIX}')].RoleName" --output text | tr '\t' '\n' || true

delete_role() {
  local role="$1"
  echo "--- Cleaning role: $role"
  # Inline policies
  for pol in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text 2>/dev/null || true); do
    [ -n "$pol" ] || continue
    aws iam delete-role-policy --role-name "$role" --policy-name "$pol" || true
  done
  # Managed policies
  for arn in $(aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null || true); do
    [ -n "$arn" ] || continue
    aws iam detach-role-policy --role-name "$role" --policy-arn "$arn" || true
  done
  aws iam delete-role --role-name "$role" && echo "Deleted $role" || echo "Could not delete $role (check console)"
}

for role in $(aws iam list-roles --query "Roles[?starts_with(RoleName, '${ROLE_PREFIX}')].RoleName" --output text 2>/dev/null | tr '\t' ' '); do
  [ -n "$role" ] || continue
  delete_role "$role"
done

BUCKET="cdk-${QUALIFIER}-assets-${ACCOUNT}-${REGION}"
echo ""
echo "=== Empty bootstrap S3 bucket (if exists): $BUCKET ==="
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3 rm "s3://${BUCKET}" --recursive || true
  aws s3 rb "s3://${BUCKET}" --force || true
else
  echo "Bucket not found or no access — skip"
fi

echo ""
echo "=== Delete CloudFormation stack CDKToolkit ==="
if aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" 2>/dev/null; then
  aws cloudformation delete-stack --stack-name CDKToolkit --region "$REGION"
  echo "Waiting for stack delete..."
  aws cloudformation wait stack-delete-complete --stack-name CDKToolkit --region "$REGION" && echo "CDKToolkit deleted." || {
    echo "Stack delete still failing — open AWS Console → CloudFormation → CDKToolkit → Delete"
    echo "If DELETE_FAILED persists, delete roles manually in IAM then retry delete-stack."
    exit 1
  }
else
  echo "CDKToolkit stack not present — OK"
fi

echo ""
echo "=== Re-bootstrap ==="
cd /home/zeeshan/emergency-response-app/asfand-dashboard/infra
export CDK_DEFAULT_ACCOUNT="$ACCOUNT"
export CDK_DEFAULT_REGION="$REGION"
npm run bootstrap -- "aws://${ACCOUNT}/${REGION}"

echo ""
echo "Verify SSM parameter:"
aws ssm get-parameter --name "/cdk-bootstrap/${QUALIFIER}/version" --region "$REGION" --query 'Parameter.Value' --output text
