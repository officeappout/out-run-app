#!/bin/sh
# Healthy = GraphHopper answers /health AND can route a short walk in Tel Aviv
# (a loaded-but-empty graph would still pass /health alone).
set -eu
PORT="${GH_PORT:-8989}"
curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null
curl -fsS --max-time 3 \
  "http://127.0.0.1:${PORT}/route?profile=foot&point=32.0779,34.774&point=32.0800,34.7760&instructions=false&calc_points=false" \
  | grep -q '"distance"'
