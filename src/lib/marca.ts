import ajustes from '../data/ajustes.json';

export type Asesor = { nombre: string; whatsapp: string; instagram?: string; tiktok?: string };

export const asesores: Asesor[] = ajustes.asesores.filter((a) => a.nombre && a.whatsapp);
export const principal = asesores[0];

/** "Sergio Guillen y Tatiana Vera" */
export const nombresAsesores = asesores.length > 1
  ? `${asesores.slice(0, -1).map((a) => a.nombre).join(', ')} y ${asesores.at(-1)!.nombre}`
  : principal?.nombre ?? '';

/** Iniciales para el ícono: "Guillen & Vera" → "G&V", "Sergio Guillen" → "SG" */
export const iniciales = ajustes.marca.includes('&')
  ? ajustes.marca.split('&').map((s) => s.trim()[0]).join('&')
  : ajustes.marca.split(/\s+/).map((s) => s[0]).join('').slice(0, 2);

export const waLink = (numero: string, texto?: string) =>
  `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

export { ajustes };
