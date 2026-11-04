/**
 * Kartenstil: Protomaps-Grundkarte aus der lokalen PMTiles-Datei, deutsche
 * Beschriftung, lokale Schriften, keine Online-Ressourcen.
 */
import type { Map as MlMap, StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';

export const BASEMAP_SOURCE = 'protomaps';

export function buildStyle(pmtilesUrl: string, glyphBase: string): StyleSpecification {
  const flavor = namedFlavor('light');
  // Ohne Sprite: POI-Symbole und Straßenschilder entfallen; Ortspunkte und
  // Einbahnpfeile liefert addFallbackImages() nach.
  const base = layers(BASEMAP_SOURCE, flavor, { lang: 'de' }).filter(
    (l) => l.id !== 'pois' && l.id !== 'roads_shields',
  ) as LayerSpecification[];
  return {
    version: 8,
    // Platzhalter {fontstack}/{range} dürfen nicht URL-kodiert werden
    glyphs: `${glyphBase}map-assets/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Protomaps',
      },
    },
    layers: base,
  };
}

/** Kreis als Polygon (für die Spielgebietsgrenze). */
export function circlePolygon(center: [number, number], radiusM: number, steps = 128): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lon0, lat0] = center;
  const k = (6371008.8 * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lon0 + (Math.cos(a) * radiusM) / (k * Math.cos((lat0 * Math.PI) / 180)), lat0 + (Math.sin(a) * radiusM) / k]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

/** Ersatzbilder für Sprite-Symbole der Grundkarte (Ortspunkt, Hauptstadt, Einbahnpfeil). */
export function addFallbackImages(map: MlMap): void {
  map.on('styleimagemissing', (e: { id: string }) => {
    if (map.hasImage(e.id)) return;
    const ratio = 2;
    const size = 12;
    const c = document.createElement('canvas');
    c.width = c.height = size * ratio;
    const g = c.getContext('2d')!;
    g.scale(ratio, ratio);
    if (e.id === 'townspot' || e.id === 'capital') {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#6b6b6b';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(6, 6, e.id === 'capital' ? 4.5 : 3.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else if (e.id === 'arrow') {
      g.strokeStyle = '#9a9a9a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(2, 6); g.lineTo(10, 6); g.moveTo(7, 3); g.lineTo(10, 6); g.lineTo(7, 9);
      g.stroke();
    }
    map.addImage(e.id, g.getImageData(0, 0, size * ratio, size * ratio), { pixelRatio: ratio });
  });
}
