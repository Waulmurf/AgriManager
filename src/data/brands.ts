/**
 * Markenfarben für die Kartendarstellung (HM-02, HM-03: nur Name und Farben,
 * keine Logos). Werte und Quellen: docs/maschinen.md, Abschnitt „Markenfarben“.
 * Deutz-Fahr und Valtra: Farbwerte angenommen (Lacknäherung), vor der Grafik prüfen.
 */
export interface BrandColors {
  name: string;
  main: string;
  accent: string;
}

export const BRANDS: BrandColors[] = [
  { name: 'John Deere', main: '#367C2B', accent: '#FFDE00' },
  { name: 'Fendt', main: '#006225', accent: '#AF2B1E' },
  { name: 'Claas', main: '#B4C618', accent: '#D7D7D7' },
  { name: 'Case IH', main: '#D0002D', accent: '#1A1A1A' },
  { name: 'New Holland', main: '#003F7D', accent: '#FECD1A' },
  { name: 'Massey Ferguson', main: '#C71121', accent: '#606163' },
  { name: 'Deutz-Fahr', main: '#7AB51D', accent: '#2B2B2B' },
  { name: 'Valtra', main: '#D52B1E', accent: '#F2F2F2' },
];

/** Firmenwagen ohne Marke */
export const COMPANY_CAR: BrandColors = { name: 'Firmenwagen', main: '#F4F4F2', accent: '#3A4A5A' };

export function brandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
