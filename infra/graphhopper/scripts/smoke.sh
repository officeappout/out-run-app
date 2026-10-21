#!/usr/bin/env bash
# Authenticated smoke test with YOUR gcloud identity (needs roles/run.invoker or
# project owner): /health, a 5 km round trip and an A->B walk in Tel Aviv.
set -euo pipefail
cd "$(dirname "$0")"; source ./env.sh
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token)
H="Authorization: Bearer $TOKEN"
curl -fsS -H "$H" "$URL/health"; echo
curl -fsS -H "$H" -H 'Content-Type: application/json' "$URL/route" -d '{
  "profile":"foot","points":[[34.774,32.0779]],"algorithm":"round_trip",
  "round_trip.distance":5000,"round_trip.seed":1,"points_encoded":false,
  "instructions":false,"elevation":true,"details":["road_class","crossing"]}' \
  | python3 -c 'import json,sys;p=json.load(sys.stdin)["paths"][0];print("round_trip km",round(p["distance"]/1000,2),"ascend",p["ascend"])'
curl -fsS -H "$H" -H 'Content-Type: application/json' "$URL/route" -d '{
  "profile":"out_run","points":[[34.774,32.0779],[34.7687,32.0571]],"points_encoded":false,"instructions":false}' \
  | python3 -c 'import json,sys;p=json.load(sys.stdin)["paths"][0];print("A->B km",round(p["distance"]/1000,2))'
# foot_turns (turn costs, 21.10.2026): same round trip on the edge-based profile.
curl -fsS -H "$H" -H 'Content-Type: application/json' "$URL/route" -d '{
  "profile":"foot_turns","points":[[34.774,32.0779]],"algorithm":"round_trip",
  "round_trip.distance":5000,"round_trip.seed":1,"points_encoded":false,
  "instructions":false,"elevation":true,"ch.disable":true}' \
  | python3 -c 'import json,sys;p=json.load(sys.stdin)["paths"][0];print("foot_turns round_trip km",round(p["distance"]/1000,2))'
