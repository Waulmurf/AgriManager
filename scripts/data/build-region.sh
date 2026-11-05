#!/usr/bin/env bash
# Baut die Kartendaten der Spielregion (läuft in GitHub Actions, braucht Internet):
#   region.json      Mittelpunkt, Radius, BBox
#   region.pmtiles   Grundkarte (Protomaps-Basemap, Ausschnitt)
#   roadgraph.bin    Straßengraph für das Routing
#   fields.bin       Felder (Simulation), fields.pmtiles (Kartendarstellung)
#   SHA256SUMS
# Voraussetzungen: curl, jq, osmium-tool, gdal-bin, tippecanoe, node, pmtiles (go-pmtiles)
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
pmtiles show "$OUT/region.pmtiles" > "$WORK/region-info.txt"; head -30 "$WORK/region-info.txt"

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
# OPL mit Knotenzeilen (Koordinaten) und Wegzeilen (Knotenreferenzen)
osmium cat --overwrite -f opl -o "$WORK/roads.opl" "$WORK/roads.osm.pbf"
head -c 600 "$WORK/roads.opl" || true; echo
OSM_TS=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$WORK/niedersachsen.osm.pbf" 2>/dev/null || echo "")

echo "== Straßengraph bauen"
node "$ROOT/scripts/data/build-roadgraph.mjs" \
  --opl "$WORK/roads.opl" --lat "$LAT" --lon "$LON" --radius-km "$RADIUS_KM" --margin-km "$MARGIN_KM" \
  --out "$OUT/roadgraph.bin"

echo "== Felder: amtliche Feldblöcke (offen lizenziert) und OSM-Ackerflächen"
OFFICIAL_ARGS=()
ATTRIB_FIELDS=()
for i in $(seq 0 $(( $(jq '.fieldSources | length' "$CFG") - 1 ))); do
  CODE=$(jq -r ".fieldSources[$i].code" "$CFG")
  URL=$(jq -r ".fieldSources[$i].url" "$CFG")
  mkdir -p "$WORK/fb-$CODE"
  if curl -sS -L -A "$UA" --fail -o "$WORK/fb-$CODE.zip" "$URL"; then
    unzip -o -q "$WORK/fb-$CODE.zip" -d "$WORK/fb-$CODE"
    # Feldblöcke, nicht Landschaftselemente (z. B. Brandenburg: DFBK_FB.shp neben DFBK_LE.shp)
    SRC=$(find "$WORK/fb-$CODE" \( -iname '*.shp' -o -iname '*.gpkg' \) | grep -viE '_LE\.|landschaft' | sort | head -1)
    echo "   $CODE: $SRC"
    ogrinfo -so "$SRC" 2>/dev/null | head -20 || true
    # -skipfailures: z. B. Brandenburg-Shapefile mit defektem Index
    if ! ogr2ogr -f GeoJSONSeq -t_srs EPSG:4326 -spat $WEST $SOUTH $EAST $NORTH -spat_srs EPSG:4326 \
      -skipfailures -lco RS=NO "$WORK/fb-$CODE.geojsonl" "$SRC"; then
      echo "   WARNUNG: $CODE nicht lesbar – dort OSM-Ackerflächen"; continue
    fi
    head -c 400 "$WORK/fb-$CODE.geojsonl" || true; echo
    OFFICIAL_ARGS+=(--official "$CODE:$WORK/fb-$CODE.geojsonl")
    ATTRIB_FIELDS+=("$(jq -r ".fieldSources[$i].attribution" "$CFG")")
  else
    echo "   WARNUNG: $CODE nicht abrufbar ($URL) – dort OSM-Ackerflächen"
  fi
done
osmium tags-filter --overwrite -o "$WORK/landuse.osm.pbf" "$WORK/region.osm.pbf" wr/landuse=farmland,meadow
osmium export --overwrite -f geojsonseq --geometry-types=polygon -a type,id -o "$WORK/osm-fields.geojsonl" "$WORK/landuse.osm.pbf"
node "$ROOT/scripts/data/build-fields.mjs" "${OFFICIAL_ARGS[@]}" --osm "$WORK/osm-fields.geojsonl" \
  --roadgraph "$OUT/roadgraph.bin" --radius-km "$RADIUS_KM" \
  --out-bin "$OUT/fields.bin" --out-geojson "$WORK/fields.geojsonl"
tippecanoe -o "$OUT/fields.pmtiles" --force -l fields -Z10 -z14 --use-attribute-for-id=i \
  --drop-densest-as-needed --simplify-only-low-zooms --detect-shared-borders \
  --name "Felder Spielregion" "$WORK/fields.geojsonl"
pmtiles show "$OUT/fields.pmtiles" > "$WORK/fields-info.txt"; head -15 "$WORK/fields-info.txt"
FIELD_ATTRIB=$(printf '%s; ' "${ATTRIB_FIELDS[@]}")

jq -n --argjson lat "$LAT" --argjson lon "$LON" --argjson r "$RADIUS_KM" \
  --arg bbox "$BBOX" --arg build "$BUILD" --arg osm "$OSM_TS" --arg name "$(jq -r .center.name "$CFG")" \
  --arg tag "$(jq -r .tag "$CFG")" --arg fattr "$FIELD_ATTRIB" \
  '{tag:$tag, center:{name:$name, lat:$lat, lon:$lon}, radiusKm:$r, bbox:($bbox|split(",")|map(tonumber)),
    protomapsBuild:$build, osmTimestamp:$osm, builtAt:(now|todate),
    attribution:"© OpenStreetMap-Mitwirkende (ODbL), Protomaps", fieldAttribution:$fattr}' > "$OUT/region.json"

(cd "$OUT" && sha256sum region.json region.pmtiles roadgraph.bin fields.bin fields.pmtiles > SHA256SUMS && ls -la && cat SHA256SUMS region.json)
