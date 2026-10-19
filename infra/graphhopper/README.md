# GraphHopper routing server (OUT)

Self-hosted [GraphHopper 11.1](https://github.com/graphhopper/graphhopper) for loop and A→B route
generation, on **Cloud Run in `me-west1` (Tel Aviv)**, project **`appout-1`** (the Firebase project).
The Next.js server calls it from `POST /api/routes/generate`; the app uses that only when the panel
flag `enable_graphhopper_routes` is on, and falls back to Mapbox on any error or after 2 s.

| file | what |
|---|---|
| `Dockerfile` | 2 stages: download the jar (sha256-pinned) + Geofabrik `israel-and-palestine` (md5-checked), import the graph **at build time** (SRTM elevation fetched during the import), then a slim runtime image with the baked graph |
| `config.yml` | profiles `foot`, `out_run`, `bike`, `out_bike`, `mtb`; flexible mode (per-request custom models); SRTM + smoothing; request logging off (it logged the whole custom model + caller IP per request) |
| `models/` | OUT layers on top of GraphHopper's built-in `foot.json` / `bike.json` / `mtb.json` |
| `healthcheck.sh` | `/health` + a real short route (for `docker run`; Cloud Run uses the probes in `service.yaml`) |
| `cloudbuild.yaml` | build → push → (optional) roll the service onto the new image |
| `service.yaml` | Cloud Run service: 2 vCPU / 4 GiB, min 1 / max 3 instances, **no public access** |
| `scripts/*.sh` | the owner's commands below |

Measured locally (19.10.2026, Israel extract): import ~15 s, RSS ~0.9 GB, round trip 5 km p50 8 ms /
p95 22 ms per call, ~300 req/s at concurrency 4. Loop recipe "mix best-of-6 + trimSpurs" passed the
route-quality v1 bars on 77.8% of generations vs 58.3% for the Mapbox v1 generator.

## How Vercel authenticates (no public endpoint)

The service has **no `allUsers` binding**: every request must carry a Google-signed ID token whose
audience is the service URL, from an identity holding `roles/run.invoker` on this one service.

Vercel is not on Google Cloud (no metadata server), so the Next.js server signs in as a service
account from a key it already has: **`FIREBASE_SERVICE_ACCOUNT_KEY`** (the Firebase Admin SA).
`src/lib/routing/graphhopper/id-token.ts` uses that key with `google-auth-library` to mint the ID
token (cached ~55 min). We grant that SA `roles/run.invoker` **on the graphhopper service only** —
no new key is created and nothing new is stored in Vercel except the URL.

Optional hardening later: a dedicated `graphhopper-invoker` SA whose key goes in
`GRAPHHOPPER_INVOKER_SA_KEY` (it then wins over the Firebase key), or keyless Workload Identity
Federation with Vercel's OIDC tokens. Both work with the same code path / IAM binding pattern.

Ingress is `all` because Vercel's egress is outside Google's network (`internal` would block it);
IAM is the gate. A request without a valid token gets `403` from Google's front end and never
reaches GraphHopper.

## Owner commands, in order

Run from the repo root of the merged `main` (or this branch for a dry build). You need `gcloud`
logged in as a project owner: `gcloud auth login && gcloud config set project appout-1`.

**1. Find the invoker identity** (the Firebase Admin SA used by Vercel):

```bash
# Vercel → Project → Settings → Environment Variables → FIREBASE_SERVICE_ACCOUNT_KEY → "client_email"
# or list it:
gcloud iam service-accounts list --project=appout-1 --filter="email~firebase-adminsdk"
export INVOKER_SA=firebase-adminsdk-XXXXX@appout-1.iam.gserviceaccount.com
```

**2. One-time setup** — APIs, Artifact Registry repo (`me-west1`), runtime + builder service
accounts, IAM:

```bash
infra/graphhopper/scripts/setup.sh
```

**3. Build the image on Cloud Build** (~10–15 min; downloads ~140 MB OSM + SRTM tiles, imports the
graph on an `e2-highcpu-8` build VM):

```bash
infra/graphhopper/scripts/build.sh
```

**4. Deploy + grant the invoker** (prints the service URL and checks that an anonymous call gets 403):

```bash
INVOKER_SA=$INVOKER_SA infra/graphhopper/scripts/deploy.sh
```

**5. Smoke test with your own identity** (owner has invoker rights through `roles/owner`):

```bash
infra/graphhopper/scripts/smoke.sh
# → {"status":"OK"} / round_trip km ~5 / A->B km ~3
```

**6. Vercel env vars** (Production + Preview), then redeploy:

| var | value |
|---|---|
| `GRAPHHOPPER_URL` | the URL printed by `deploy.sh`, e.g. `https://graphhopper-abc123-zf.a.run.app` |
| `GRAPHHOPPER_AUDIENCE` | *(optional)* defaults to `GRAPHHOPPER_URL` |
| `GRAPHHOPPER_INVOKER_SA_KEY` | *(optional)* dedicated invoker key; defaults to `FIREBASE_SERVICE_ACCOUNT_KEY` |
| `GRAPHHOPPER_TIMEOUT_MS` | *(optional)* per-call timeout, default `1200` |
| `RL_ROUTES_GENERATE_UID_MAX` / `_WINDOW_MS` | *(optional)* rate limit, default 40 per 10 min per user |

Then compare on **/admin/routes/quality** (mode `v1↔GH`), and only then switch on
`enable_graphhopper_routes` in system settings.

**7. Weekly rebuild** (fresh OSM every Sunday 03:00 Israel time):

1. Once, in the console: *Cloud Build → Repositories (2nd gen) → Create host connection → GitHub*,
   region `me-west1`, install the Cloud Build GitHub app on `officeappout/out-run-app`, then
   *Link repository*. Note the connection name (e.g. `github`) and repository name.
2. Create the trigger + scheduler job:

```bash
CONNECTION=github REPO_NAME=officeappout-out-run-app infra/graphhopper/scripts/weekly.sh
```

The trigger runs `cloudbuild.yaml` from `main` (build → push → `gcloud run deploy --image`),
so the service rolls onto the fresh graph with zero downtime (Cloud Run starts the new revision,
waits for the startup probe, then shifts traffic). Equivalent console route: *Triggers → ⋮ → Run on
schedule*. If 2nd-gen repositories are not offered in `me-west1`, create the connection and
trigger in `europe-west1` (`REGION=europe-west1` for `weekly.sh` only); the image stays in
`me-west1`.

### Local run (optional)

```bash
cd infra/graphhopper && docker build -t out-graphhopper . && docker run --rm -p 8989:8989 out-graphhopper
# .env.local: GRAPHHOPPER_URL=http://localhost:8989   (localhost is called without an ID token)
```

## Cost estimate (me-west1, list prices, verify in the pricing calculator)

| item | assumption | ~USD / month |
|---|---|---|
| Cloud Run, 1 min instance idle | 2 vCPU + 4 GiB, request-based billing (CPU throttled when idle), idle min-instance rate | 45–60 |
| Cloud Run, active time | ~10k loop generations / month × ~0.2 s × 6–10 GraphHopper calls | < 5 |
| Cloud Build | weekly `e2-highcpu-8`, ~15 min | ~1 |
| Artifact Registry | 4 images × ~0.4 GB kept | < 1 |
| Scheduler / egress | 1 job (free tier); ~20 KB per response | < 1 |
| **total** | | **~50–70** |

If CPU is set to "always allocated" (instance-based billing), the always-on instance costs
~115–160 / month instead. Scaling to `max-instances 3` only costs while traffic needs it.
Mapbox Directions calls avoided: a 3-loop generation is ~6–12 Directions requests today.

## Operating notes

- `prepare.min_network_size: 200` drops tiny islands; round trips near the coast occasionally answer
  400 "Could not find a valid point" — the client treats that as "no route" and retries another seed.
- The graph is RAM-resident (~150 MB) with 70% of 4 GiB as heap; `ExitOnOutOfMemoryError` lets Cloud
  Run restart a broken instance.
- To change models: edit `config.yml` / `models/*.json` → merge → the next weekly build (or
  `build.sh` + `gcloud run deploy graphhopper --region=me-west1 --image=…`) picks it up. Per-request
  tags (`src/lib/routing/graphhopper/custom-model.ts`) need no rebuild.
- Lighting (`lit`) is not modelled: GraphHopper 11 has no `lit` encoded value without a custom import.
