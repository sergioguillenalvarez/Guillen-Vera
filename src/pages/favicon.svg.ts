import { iniciales } from '../lib/marca';

// El ícono de la pestaña se arma con las iniciales de la marca, así cambia solo si cambia el nombre.
export function GET() {
  const [a, b] = iniciales.includes('&') ? iniciales.split('&') : [iniciales, ''];
  const texto = b
    ? `${a}<tspan fill="#FFB443">&amp;</tspan>${b}`
    : a;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0D0D0F"/><text x="32" y="43" font-family="Georgia,serif" font-size="30" text-anchor="middle" fill="#fff">${texto}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}
