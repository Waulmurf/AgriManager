# Werkzeuge für den Bau der Kartendaten (lokal, ohne GitHub Actions).
# Nutzung: npm run map-data:build   (braucht Docker Desktop)
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -q && apt-get install -y -q --no-install-recommends \
      ca-certificates curl jq unzip osmium-tool gdal-bin tippecanoe nodejs \
    && rm -rf /var/lib/apt/lists/*
# go-pmtiles (Ausschnitt aus der Protomaps-Basemap)
RUN curl -sSL -o /tmp/pm.tgz https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_x86_64.tar.gz \
    && tar -xzf /tmp/pm.tgz -C /usr/local/bin pmtiles && rm /tmp/pm.tgz && pmtiles version
WORKDIR /work
