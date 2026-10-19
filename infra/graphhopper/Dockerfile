# syntax=docker/dockerfile:1.7
# OUT routing server: GraphHopper 11.1 + Israel/Palestine OSM + SRTM elevation,
# graph imported at BUILD time and baked into the image (cold start = load ~150 MB
# graph, ~1-2 s; no download or import at runtime).
#
# Build:  gcloud builds submit (see README.md) — needs ~6 GB RAM for the import.
# Local:  docker build -t out-graphhopper . && docker run -p 8989:8989 out-graphhopper

ARG JAVA_IMAGE=eclipse-temurin:21-jre

# ── 1. build: fetch jar + OSM extract, import the graph ─────────────────────────
FROM ${JAVA_IMAGE} AS build
ARG GH_VERSION=11.1
# sha256 of graphhopper-web-11.1.jar as published on Maven Central (.sha256).
ARG GH_JAR_SHA256=8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33
ARG OSM_URL=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
ARG IMPORT_XMX=5g

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN curl -fsSL -o graphhopper.jar \
      "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar" \
 && echo "${GH_JAR_SHA256}  graphhopper.jar" | sha256sum -c -

# Geofabrik publishes an .md5 next to every extract; verify the download against it.
WORKDIR /data
RUN curl -fsSL -o israel-and-palestine-latest.osm.pbf "${OSM_URL}" \
 && curl -fsSL -o osm.md5 "${OSM_URL}.md5" \
 && echo "$(cut -d' ' -f1 osm.md5)  israel-and-palestine-latest.osm.pbf" | md5sum -c - \
 && rm osm.md5

COPY config.yml /app/config.yml
COPY models/ /app/models/
# SRTM tiles are downloaded by GraphHopper during the import (cache_dir /data/srtm)
# and the smoothed elevation is stored in the graph itself.
RUN java -Xmx${IMPORT_XMX} -jar /app/graphhopper.jar import /app/config.yml \
 && test -f /data/graph-cache/properties \
 && date -u +%Y-%m-%dT%H:%M:%SZ > /data/graph-cache/out-build-date.txt

# ── 2. runtime: jar + config + baked graph only ─────────────────────────────────
FROM ${JAVA_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /app gh
WORKDIR /app
COPY --from=build /app/graphhopper.jar /app/graphhopper.jar
COPY --from=build /data/graph-cache /data/graph-cache
COPY config.yml /app/config.yml
COPY models/ /app/models/
COPY healthcheck.sh /app/healthcheck.sh
# /data/srtm: the elevation provider's cache dir (unused at runtime — elevation is in the graph).
RUN chmod 0555 /app/healthcheck.sh && mkdir -p /data/srtm && chown -R gh /data/graph-cache /data/srtm
USER gh

# 4 GiB container: heap 70% (~2.8 GiB) — RSS measured ~0.9 GB for Israel.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"
EXPOSE 8989
# Cloud Run ignores HEALTHCHECK (it uses the startup/liveness probes in service.yaml);
# this is for docker run / local smoke tests.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD ["/app/healthcheck.sh"]
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/graphhopper.jar server /app/config.yml"]
