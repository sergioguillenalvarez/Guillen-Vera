import { getCollection, type CollectionEntry } from 'astro:content';

export type Propiedad = CollectionEntry<'propiedades'>;

const DIA = 86_400_000;

function sumarMeses(fecha: Date, meses: number) {
  const d = new Date(fecha);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

/** Fecha en que vence la exclusividad: firma + vigencia + todas las renovaciones. */
export function venceExclusividad(p: Propiedad['data']): Date | null {
  if (!p.exclusividad_firma || !p.exclusividad_meses) return null;
  const meses = p.exclusividad_meses + p.renovaciones.reduce((s, r) => s + r.meses, 0);
  return sumarMeses(p.exclusividad_firma, meses);
}

/** Las vendidas se quedan siempre (sirven de portafolio). Las demás solo mientras la exclusividad esté vigente. */
export function estaActiva(p: Propiedad['data'], hoy = new Date()) {
  if (p.estado === 'Vendida') return true;
  const vence = venceExclusividad(p);
  return !vence || vence.getTime() + DIA > hoy.getTime();
}

export async function propiedadesPublicas() {
  const todas = await getCollection('propiedades');
  return todas
    .filter((p) => estaActiva(p.data))
    .sort((a, b) => b.data.fecha_publicacion.getTime() - a.data.fecha_publicacion.getTime());
}

export const usd = (n: number) => 'US$ ' + n.toLocaleString('en-US');

export function cuotaMensual(precio: number, inicial = 0.2, anios = 20, tea = 0.085) {
  const capital = precio * (1 - inicial);
  const r = Math.pow(1 + tea, 1 / 12) - 1;
  const n = anios * 12;
  return Math.round((capital * r) / (1 - Math.pow(1 + r, -n)));
}

export function diasDesde(fecha: Date, hoy = new Date()) {
  return Math.max(0, Math.floor((hoy.getTime() - fecha.getTime()) / DIA));
}

/** Acepta el link completo de TikTok (…/video/7351234567890123456) o solo el número. */
export function tiktokId(url?: string | null) {
  if (!url) return null;
  const m = url.match(/video\/(\d+)/) ?? url.match(/^(\d{15,})$/);
  return m ? m[1] : null;
}

/**
 * Igual que tiktokId, pero también entiende los links cortos que da la app
 * (vt.tiktok.com / vm.tiktok.com): al publicar, sigue la redirección para encontrar el número del video.
 */
export async function resolverTiktok(url?: string | null) {
  const directo = tiktokId(url);
  if (directo || !url || !/^https?:\/\/(vt|vm)\.tiktok\.com\//.test(url.trim())) return directo;
  try {
    const res = await fetch(url.trim(), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
    return tiktokId(res.headers.get('location')) ?? tiktokId((await fetch(url.trim())).url);
  } catch {
    return null;
  }
}

export function youtubeId(url?: string | null) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export const ESCENAS = ['sea', 'living', 'kitchen', 'bed', 'sunset'];
