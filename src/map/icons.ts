/**
 * Erzeugt Fahrzeugsymbole (Draufsicht, Spitze nach Norden) in Markenfarben.
 * Schlepper: große Hinterräder, Motorhaube; Firmenwagen: Pkw-Form.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { BRANDS, CAR_COLORS, COMPANY_CAR, brandKey, type BrandColors } from '../data/brands';

const SIZE = 40;

function draw(colors: BrandColors, kind: 'tractor' | 'car' | 'truck', ratio: number): ImageData {
  const px = SIZE * ratio;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.scale(ratio, ratio);
  g.lineJoin = 'round';
  // weicher Schatten für Lesbarkeit auf hellem Grund
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 3;
  if (kind === 'tractor') {
    g.fillStyle = '#1d1d1d';
    // Hinterräder (unten) und Vorderräder (oben)
    g.fillRect(9, 22, 6, 12);
    g.fillRect(25, 22, 6, 12);
    g.fillRect(11, 7, 4, 8);
    g.fillRect(25, 7, 4, 8);
    g.shadowBlur = 0;
    // Felgen-Akzent
    g.fillStyle = colors.accent;
    g.fillRect(10.5, 26, 3, 4);
    g.fillRect(26.5, 26, 3, 4);
    // Motorhaube und Kabine
    g.fillStyle = colors.main;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(16, 4); g.lineTo(24, 4); g.lineTo(24, 20); g.lineTo(28, 20); g.lineTo(28, 34);
    g.lineTo(12, 34); g.lineTo(12, 20); g.lineTo(16, 20); g.closePath();
    g.fill(); g.stroke();
    // Kabinendach
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(14.5, 23, 11, 8);
  } else if (kind === 'truck') {
    // Sattelzug: Fahrerhaus vorn in Markenfarbe, grauer Kipper-Auflieger dahinter
    g.fillStyle = '#8a8f94';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1.2;
    g.fillRect(13, 13, 14, 25);
    g.strokeRect(13, 13, 14, 25);
    g.shadowBlur = 0;
    g.fillStyle = colors.main;
    g.beginPath();
    g.roundRect(12.5, 2, 15, 10, 2);
    g.fill(); g.stroke();
    g.fillStyle = colors.accent;
    g.fillRect(14.5, 3.5, 11, 3); // Frontscheibe
  } else {
    g.fillStyle = colors.main;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(13, 5, 14, 30, 5);
    g.fill(); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = colors.accent;
    g.fillRect(15, 11, 10, 5); // Frontscheibe
    g.fillRect(15, 27, 10, 3); // Heckscheibe
  }
  return g.getImageData(0, 0, px, px);
}

export function vehicleIconId(brand: string, profile: string): string {
  return `veh-${profile}-${brandKey(brand)}`;
}

export function addVehicleIcons(map: MlMap): void {
  const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  for (const b of BRANDS) {
    map.addImage(vehicleIconId(b.name, 'tractor'), draw(b, 'tractor', ratio), { pixelRatio: ratio });
    map.addImage(vehicleIconId(b.name, 'truck'), draw(b, 'truck', ratio), { pixelRatio: ratio });
  }
  map.addImage(vehicleIconId(COMPANY_CAR.name, 'car'), draw(COMPANY_CAR, 'car', ratio), { pixelRatio: ratio });
  for (const c of Object.values(CAR_COLORS)) {
    if (c !== COMPANY_CAR) map.addImage(vehicleIconId(c.name, 'car'), draw(c, 'car', ratio), { pixelRatio: ratio });
  }
}
