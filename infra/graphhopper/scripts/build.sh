#!/usr/bin/env bash
# Build + push the image on Cloud Build (~10-15 min). No deploy.
set -euo pipefail
cd "$(dirname "$0")/.."; source ./scripts/env.sh
set -x
gcloud builds submit . --project="$PROJECT_ID" --region="$REGION" \
  --config=cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILDER_SA" \
  --substitutions=_CONTEXT=.,_DEPLOY=false
