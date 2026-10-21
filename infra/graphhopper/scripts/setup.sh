#!/usr/bin/env bash
# One-time: APIs, Artifact Registry repo, service accounts, IAM. Idempotent-ish
# (re-running only prints "already exists" errors for things that exist).
set -euo pipefail
cd "$(dirname "$0")"; source ./env.sh
set -x
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com cloudscheduler.googleapis.com iam.googleapis.com

gcloud artifacts repositories create "$REPO" --repository-format=docker \
  --location="$REGION" --description="OUT GraphHopper routing images" || true
# keep the 4 newest images (each ~0.4 GB), delete older ones
gcloud artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" \
  --policy=../cleanup-policy.json --no-dry-run || true

# runtime identity of the Cloud Run service — needs no roles at all
gcloud iam service-accounts create graphhopper-runtime --display-name="GraphHopper runtime (no roles)" || true
# builds + weekly redeploys
gcloud iam service-accounts create graphhopper-builder --display-name="GraphHopper image builder" || true
for role in roles/artifactregistry.writer roles/run.developer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$BUILDER_SA" \
    --role="$role" --condition=None >/dev/null
done
# gcloud builds submit uploads the source to gs://<project>_cloudbuild; a custom build
# service account must be able to read it back (found on the first real build, 19.10.2026)
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" \
  --member="serviceAccount:$BUILDER_SA" --role=roles/storage.objectViewer --project="$PROJECT_ID" >/dev/null || true
# the builder deploys revisions that run as graphhopper-runtime
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$BUILDER_SA" --role=roles/iam.serviceAccountUser
