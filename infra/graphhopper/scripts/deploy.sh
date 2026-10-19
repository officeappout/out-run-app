#!/usr/bin/env bash
# First deploy (and any later change to service.yaml): render service.yaml with
# the newest image, apply it, and give ONLY the invoker SA access.
#   INVOKER_SA=firebase-adminsdk-xxxxx@appout-1.iam.gserviceaccount.com ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."; source ./scripts/env.sh
: "${INVOKER_SA:?set INVOKER_SA to the client_email of Vercel's FIREBASE_SERVICE_ACCOUNT_KEY}"
DIGEST=$(gcloud artifacts docker images describe "$IMAGE_BASE:latest" --format='value(image_summary.digest)')
IMAGE="$IMAGE_BASE@$DIGEST"
RENDERED=$(mktemp)
sed -e "s|__IMAGE__|$IMAGE|" -e "s|__RUNTIME_SA__|$RUNTIME_SA|" -e "s|me-west1|$REGION|" service.yaml > "$RENDERED"
set -x
gcloud run services replace "$RENDERED" --region="$REGION" --project="$PROJECT_ID"
gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
  --member="serviceAccount:$INVOKER_SA" --role=roles/run.invoker
set +x
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
echo
echo "Service URL (set as GRAPHHOPPER_URL in Vercel): $URL"
echo "Public access check (must print 403):"
curl -s -o /dev/null -w '%{http_code}\n' "$URL/health"
