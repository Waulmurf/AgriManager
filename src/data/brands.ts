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
  // Häcksler und Radlader (Annahme, Lacknäherung)
  { name: 'Krone', main: '#2E7D32', accent: '#C62828' },
  { name: 'JCB', main: '#F2B705', accent: '#1A1A1A' },
  { name: 'Liebherr', main: '#F5C400', accent: '#3A3A3A' },
  { name: 'Volvo', main: '#F0B323', accent: '#2B2B2B' },
  // Rübenroder (Annahme, Lacknäherung)
  { name: 'Grimme', main: '#C4161C', accent: '#3A3A3A' },
  { name: 'Ropa', main: '#4C8C2B', accent: '#F2F2F2' },
];

/** Firmenwagen ohne Marke (Kombi) */
export const COMPANY_CAR: BrandColors = { name: 'Firmenwagen', main: '#F4F4F2', accent: '#3A4A5A' };
/** Farben je Firmenwagen-Art */
export const CAR_COLORS: Record<string, BrandColors> = {
  kombi: COMPANY_CAR,
  kleinbus: { name: 'Kleinbus', main: '#C9D3DD', accent: '#2F4A66' },
  werkstatt: { name: 'Werkstattwagen', main: '#F29F05', accent: '#3A3A3A' },
};

export function brandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
