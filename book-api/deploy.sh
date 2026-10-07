#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-}"
if [[ "$STAGE" != "test" && "$STAGE" != "live" ]]; then
  echo "usage: ./deploy.sh test|live" >&2
  exit 1
fi

cd "$(dirname "$0")"
REGION="us-east-1"
ACCOUNT="673544138085"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/ltm-book-api"
FUNCTION="ltm-book-api"
[[ "$STAGE" == "test" ]] && FUNCTION="ltm-book-api-test"
ENV_FILE=".env.${STAGE}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE (copy .env.example and fill it in)" >&2
  exit 1
fi

npm run typecheck
npm run build
python -c "import zipfile; z = zipfile.ZipFile('build/function.zip', 'w', zipfile.ZIP_DEFLATED); z.write('build/index.mjs', 'index.mjs'); z.close()"
python -c "import json, sys; pairs = [l.split('=', 1) for l in open(sys.argv[1], encoding='utf-8').read().splitlines() if '=' in l and not l.lstrip().startswith('#')]; json.dump({'Variables': {k.strip(): v.strip() for k, v in pairs}}, open('build/env.json', 'w'))" "$ENV_FILE"

if aws lambda get-function --region "$REGION" --function-name "$FUNCTION" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION" --zip-file fileb://build/function.zip --query LastUpdateStatus --output text
  aws lambda wait function-updated --region "$REGION" --function-name "$FUNCTION"
  aws lambda update-function-configuration --region "$REGION" --function-name "$FUNCTION" --environment file://build/env.json --query LastUpdateStatus --output text
  aws lambda wait function-updated --region "$REGION" --function-name "$FUNCTION"
else
  aws lambda create-function --region "$REGION" --function-name "$FUNCTION" \
    --runtime nodejs22.x --architectures arm64 --handler index.handler \
    --role "$ROLE_ARN" --zip-file fileb://build/function.zip \
    --timeout 20 --memory-size 512 --environment file://build/env.json \
    --query State --output text
  aws lambda wait function-active-v2 --region "$REGION" --function-name "$FUNCTION"
  aws lambda create-function-url-config --region "$REGION" --function-name "$FUNCTION" --auth-type NONE \
    --cors 'AllowOrigins=https://leavingthematrix.io,https://www.leavingthematrix.io,http://localhost:4321,AllowMethods=GET,POST,AllowHeaders=content-type,MaxAge=3600' \
    --query FunctionUrl --output text
  aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" --statement-id public-url-invoke \
    --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null
fi

rm -f build/env.json
aws lambda get-function-url-config --region "$REGION" --function-name "$FUNCTION" --query FunctionUrl --output text
