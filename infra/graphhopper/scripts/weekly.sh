#!/usr/bin/env bash
# Weekly rebuild (fresh OSM): a manual Cloud Build trigger on the GitHub repo
# + a Cloud Scheduler job that runs it every Sunday 03:00 Israel time.
# PREREQUISITE (once, in the browser): connect the GitHub repo to Cloud Build —
# README.md §5 step 1. Then:
#   CONNECTION=github REPO_NAME=officeappout-out-run-app infra/graphhopper/scripts/weekly.sh
set -euo pipefail
cd "$(dirname "$0")"; source ./env.sh
: "${CONNECTION:?name of the Cloud Build GitHub connection (README §5)}"
: "${REPO_NAME:?name of the linked repository in that connection}"
TRIGGER=graphhopper-weekly
set -x
gcloud builds triggers create manual --name="$TRIGGER" --region="$REGION" --project="$PROJECT_ID" \
  --repository="projects/$PROJECT_ID/locations/$REGION/connections/$CONNECTION/repositories/$REPO_NAME" \
  --branch=main --build-config=infra/graphhopper/cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILDER_SA"

gcloud iam service-accounts create graphhopper-scheduler --display-name="Runs the weekly GraphHopper rebuild" || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SCHEDULER_SA" \
  --role=roles/cloudbuild.builds.editor --condition=None >/dev/null
# the trigger runs as the builder SA, so the caller must be allowed to act as it
gcloud iam service-accounts add-iam-policy-binding "$BUILDER_SA" \
  --member="serviceAccount:$SCHEDULER_SA" --role=roles/iam.serviceAccountUser

gcloud scheduler jobs create http graphhopper-weekly-rebuild --location="$REGION" --project="$PROJECT_ID" \
  --schedule="0 3 * * 0" --time-zone="Asia/Jerusalem" \
  --uri="https://cloudbuild.googleapis.com/v1/projects/$PROJECT_ID/locations/$REGION/triggers/$TRIGGER:run" \
  --http-method=POST --message-body='{"branchName":"main"}' \
  --oauth-service-account-email="$SCHEDULER_SA" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
