#!/usr/bin/env bash
# One-time AWS CLI setup with IAM Access Key (not console password).
# Run this YOURSELF in terminal — keys are not sent to anyone.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"

echo "Create an Access Key first:"
echo "  AWS Console → IAM → Users → SundasFatima → Security credentials → Create access key (CLI)"
echo ""

read -r -p "AWS Access Key ID (AKIA...): " AK
read -r -s -p "AWS Secret Access Key: " SK
echo ""
read -r -p "Region [us-east-1]: " RG
RG="${RG:-us-east-1}"

mkdir -p ~/.aws
chmod 700 ~/.aws

cat > ~/.aws/credentials <<EOF
[default]
aws_access_key_id = ${AK}
aws_secret_access_key = ${SK}
EOF
chmod 600 ~/.aws/credentials

cat > ~/.aws/config <<EOF
[default]
region = ${RG}
output = json
EOF
chmod 600 ~/.aws/config

# Remove expired aws login mode if any
rm -rf ~/.aws/login 2>/dev/null || true

echo ""
echo "Testing..."
aws sts get-caller-identity && echo "" && echo "OK — AWS configured. Now run deploy commands."
