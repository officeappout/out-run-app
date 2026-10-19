# Shared settings for the GraphHopper scripts — sourced, not run.
# INVOKER_SA must be set by the caller: the client_email inside Vercel's
# FIREBASE_SERVICE_ACCOUNT_KEY (README.md §1 shows how to read it).
export PROJECT_ID="${PROJECT_ID:-appout-1}"
export REGION="${REGION:-me-west1}"
export REPO="${REPO:-graphhopper}"
export SERVICE="${SERVICE:-graphhopper}"
export RUNTIME_SA="graphhopper-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export BUILDER_SA="graphhopper-builder@${PROJECT_ID}.iam.gserviceaccount.com"
export SCHEDULER_SA="graphhopper-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
export IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/graphhopper"
