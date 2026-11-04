#!/usr/bin/env bash
# Baut die Kartendaten der Spielregion (läuft in GitHub Actions, braucht Internet):
#   region.json      Mittelpunkt, Radius, BBox
#   region.pmtiles   Grundkarte (Protomaps-Basemap, Ausschnitt)
#   roadgraph.bin    Straßengraph für das Routing
#   SHA256SUMS
# Voraussetzungen: curl, jq, osmium-tool, node, pmtiles (go-pmtiles)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CFG="$ROOT/data/map-data.json"
OUT="${OUT:-$ROOT/build/map-data}"
WORK="${WORK:-$ROOT/build/map-work}"
mkdir -p "$OUT" "$WORK"

UA="AgriManager-map-build (https://github.com/waulmurf/agrimanager)"
RADIUS_KM=$(jq -r .radiusKm "$CFG")
MARGIN_KM=$(jq -r .marginKm "$CFG")
MAXZOOM=$(jq -r .pmtilesMaxZoom "$CFG")
QUERY=$(jq -r .center.query "$CFG")

echo "== Mittelpunkt geokodieren: $QUERY"
GEO=$(curl -sS -G -A "$UA" "https://nominatim.openstreetmap.org/search" \
  --data-urlencode "q=$QUERY" --data-urlencode "format=jsonv2" --data-urlencode "limit=1" --data-urlencode "countrycodes=de")
LAT=$(echo "$GEO" | jq -r '.[0].lat')
LON=$(echo "$GEO" | jq -r '.[0].lon')
if [[ -z "$LAT" || "$LAT" == "null" ]]; then echo "Geokodierung fehlgeschlagen: $GEO"; exit 1; fi
echo "   lat=$LAT lon=$LON ($(echo "$GEO" | jq -r '.[0].display_name'))"

# BBox: Radius + Rand, in Grad (Breitenkreis-Korrektur für Länge)
read -r WEST SOUTH EAST NORTH < <(node -e '
  const [lat, lon, km] = process.argv.slice(1).map(Number);
  const dLat = km / 111.32, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  console.log([lon - dLon, lat - dLat, lon + dLon, lat + dLat].map(v => v.toFixed(5)).join(" "));
' "$LAT" "$LON" "$((RADIUS_KM + MARGIN_KM))")
BBOX="$WEST,$SOUTH,$EAST,$NORTH"
echo "   bbox=$BBOX"

echo "== Protomaps-Build ermitteln"
BUILD=$(curl -sS -A "$UA" https://build-metadata.protomaps.dev/builds.json | jq -r 'map(.key) | sort | last')
echo "   build=$BUILD"
pmtiles extract "https://build.protomaps.com/$BUILD" "$OUT/region.pmtiles" --bbox="$BBOX" --maxzoom="$MAXZOOM"
pmtiles show "$OUT/region.pmtiles" | head -30

echo "== OSM-Auszüge laden und zuschneiden"
PARTS=()
for REG in $(jq -r '.geofabrik[]' "$CFG"); do
  NAME=$(basename "$REG")
  PBF="$WORK/$NAME.osm.pbf"
  [[ -f "$PBF" ]] || curl -sS -L -A "$UA" -o "$PBF" "https://download.geofabrik.de/$REG-latest.osm.pbf"
  osmium extract --overwrite -b "$BBOX" -s complete_ways -o "$WORK/$NAME.cut.osm.pbf" "$PBF"
  PARTS+=("$WORK/$NAME.cut.osm.pbf")
done
osmium merge --overwrite -o "$WORK/region.osm.pbf" "${PARTS[@]}"
osmium tags-filter --overwrite -o "$WORK/roads.osm.pbf" "$WORK/region.osm.pbf" w/highway w/route=ferry
osmium add-locations-to-ways --overwrite -o "$WORK/roads-loc.osm.pbf" "$WORK/roads.osm.pbf"
osmium cat --overwrite -f opl -o "$WORK/roads.opl" "$WORK/roads-loc.osm.pbf"
OSM_TS=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$WORK/niedersachsen.osm.pbf" 2>/dev/null || echo "")

echo "== Straßengraph bauen"
node "$ROOT/scripts/data/build-roadgraph.mjs" \
  --opl "$WORK/roads.opl" --lat "$LAT" --lon "$LON" --radius-km "$RADIUS_KM" --margin-km "$MARGIN_KM" \
  --out "$OUT/roadgraph.bin"

jq -n --argjson lat "$LAT" --argjson lon "$LON" --argjson r "$RADIUS_KM" \
  --arg bbox "$BBOX" --arg build "$BUILD" --arg osm "$OSM_TS" --arg name "$(jq -r .center.name "$CFG")" \
  --arg tag "$(jq -r .tag "$CFG")" \
  '{tag:$tag, center:{name:$name, lat:$lat, lon:$lon}, radiusKm:$r, bbox:($bbox|split(",")|map(tonumber)),
    protomapsBuild:$build, osmTimestamp:$osm, builtAt:(now|todate),
    attribution:"© OpenStreetMap-Mitwirkende (ODbL), Protomaps"}' > "$OUT/region.json"

(cd "$OUT" && sha256sum region.json region.pmtiles roadgraph.bin > SHA256SUMS && ls -la && cat SHA256SUMS region.json)
