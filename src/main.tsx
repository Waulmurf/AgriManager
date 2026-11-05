import { compatibilityProblem } from './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './App';

const problem = compatibilityProblem();
if (problem) {
  // verständliche Meldung statt leerer Karte (z. B. altes macOS ohne WebGL 2)
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:560px;margin:15vh auto;font:15px system-ui;line-height:1.5;padding:16px';
  const h = document.createElement('h1');
  h.textContent = 'Lohnbetrieb-Simulation kann nicht starten';
  const p = document.createElement('p');
  p.textContent = problem;
  box.append(h, p);
  el.append(box);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
