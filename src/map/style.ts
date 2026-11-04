/**
 * Kartenstil: Protomaps-Grundkarte aus der lokalen PMTiles-Datei, deutsche
 * Beschriftung, lokale Schriften, keine Online-Ressourcen.
 */
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';

export const BASEMAP_SOURCE = 'protomaps';

export function buildStyle(pmtilesUrl: string, glyphBase: string): StyleSpecification {
  const flavor = namedFlavor('light');
  // POI-Symbole bräuchten ein Sprite – im Prototyp ohne Sprite, daher ausgelassen
  const base = layers(BASEMAP_SOURCE, flavor, { lang: 'de' }).filter(
    (l) => !(l.type === 'symbol' && l.layout && 'icon-image' in l.layout),
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
