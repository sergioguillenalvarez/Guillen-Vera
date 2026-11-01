import { getCollection, type CollectionEntry } from 'astro:content';
import { esPrioritario } from '../data/distritos';
import { leerHoja, linkDeHoja, listaPisos, type Unidad } from './hoja';

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
  if (cerrada(p)) return true;
  const vence = venceExclusividad(p);
  return !vence || vence.getTime() + DIA > hoy.getTime();
}

type Tipologia = Propiedad['data']['tipologias'][number];

/**
 * Junta las tipologías del panel (nombre, fotos, plano, cochera…) con la hoja de precios:
 * de la hoja salen los modelos disponibles, sus áreas, vistas, pisos y el precio de lista más bajo.
 */
export function unirConHoja(tipos: Tipologia[], unidades: Unidad[]): Tipologia[] {
  const porModelo = new Map<string, Unidad[]>();
  for (const u of unidades) porModelo.set(u.modelo, [...(porModelo.get(u.modelo) ?? []), u]);
  const clave = (t: Tipologia) => (t.modelo ?? t.nombre ?? '').trim().toUpperCase().replace(/^(MODELO|TIPO|TIPOLOGIA|TIPOLOGÍA)\s+/, '');
  const panel = new Map(tipos.map((t) => [clave(t), t]));
  const modelos = [...new Set([...porModelo.keys(), ...panel.keys()])].filter(Boolean);
  return modelos.map((m) => {
    const t = panel.get(m);
    const us = porModelo.get(m) ?? [];
    const areas = us.map((u) => u.area);
    return {
      ...(t ?? { banos: null, cochera: null, vista: null, plano: null, fotos: [] }),
      nombre: t?.nombre || `Modelo ${m}`,
      modelo: m,
      dormitorios: us[0]?.dormitorios || t?.dormitorios || 0,
      area: areas.length ? Math.min(...areas) : (t?.area ?? 0),
      area_max: areas.length ? Math.max(...areas) : (t?.area_max ?? null),
      precio: us.length ? Math.min(...us.map((u) => u.precio)) : (t?.precio ?? 0),
      pisos: us.length ? listaPisos(us.flatMap((u) => (u.piso ? [u.piso] : []))) : (t?.pisos ?? null),
      unidades: us.length,
      vistas: [...new Set(us.map((u) => u.vista).filter(Boolean))],
      agotada: us.length === 0,
    };
  });
}

let publicas: Promise<Propiedad[]> | undefined;

export function propiedadesPublicas() {
  return (publicas ??= cargarPublicas());
}

async function cargarPublicas() {
  const todas = await Promise.all((await getCollection('propiedades')).map(async (p) => {
    const link = linkDeHoja(p.data.hoja_precios);
    let tipologias = link ? unirConHoja(p.data.tipologias, await leerHoja(link)) : p.data.tipologias;
    // Tipologías sin precio (ni hoja) no se muestran; a las demás se les asegura un nombre
    tipologias = tipologias
      .filter((t) => t.precio > 0)
      .map((t) => ({ ...t, nombre: t.nombre || (t.modelo ? `Modelo ${t.modelo}` : `${t.dormitorios} dormitorios`) }));
    return { ...p, data: { ...p.data, tipologias } } as Propiedad;
  }));
  return todas
    .filter((p) => estaActiva(p.data))
    // Lima Top primero; dentro de cada grupo, lo más reciente primero
    .sort((a, b) =>
      Number(esPrioritario(b.data.distrito)) - Number(esPrioritario(a.data.distrito)) ||
      b.data.fecha_publicacion.getTime() - a.data.fecha_publicacion.getTime());
}

export const usd = (n: number) => 'US$ ' + n.toLocaleString('en-US');

export const cerrada = (p: Propiedad['data']) => p.estado === 'Vendida' || p.estado === 'Alquilada';
export const esProyecto = (p: Propiedad['data']) => p.tipologias.length > 0;
export const tipologiasDisponibles = (p: Propiedad['data']) => p.tipologias.filter((t) => !t.agotada);

/** Precio que se muestra: el de la propiedad, o el más bajo de las tipologías disponibles de un proyecto. */
export function precioBase(p: Propiedad['data']): number {
  if (esProyecto(p)) {
    const lista = tipologiasDisponibles(p).length ? tipologiasDisponibles(p) : p.tipologias;
    return Math.min(...lista.map((t) => t.precio));
  }
  return p.precio ?? 0;
}

export function dinero(n: number, moneda: 'USD' | 'PEN' = 'USD') {
  return (moneda === 'PEN' ? 'S/ ' : 'US$ ') + Math.round(n).toLocaleString('en-US');
}

/** Si la propiedad está en soles y tiene tipo de cambio: "≈ US$ 120,059" */
export function enDolares(n: number, p: Propiedad['data']) {
  return p.moneda === 'PEN' && p.tipo_cambio ? `≈ ${dinero(n / p.tipo_cambio, 'USD')}` : null;
}

/** "US$ 485,000", "Desde US$ 116,000" o "S/ 3,500 al mes" */
export function precioTexto(p: Propiedad['data']) {
  const base = dinero(precioBase(p), p.moneda);
  if (esProyecto(p)) return `Desde ${base}`;
  if (p.operacion === 'Alquiler') return `${base} al mes`;
  return base;
}

/** "1, 2 y 3" a partir de una lista de números */
export function enumerar(nums: number[]) {
  const u = [...new Set(nums)].sort((a, b) => a - b).map(String);
  return u.length > 1 ? `${u.slice(0, -1).join(', ')} y ${u.at(-1)}` : (u[0] ?? '');
}

export function rango(nums: number[]) {
  const min = Math.round(Math.min(...nums)), max = Math.round(Math.max(...nums));
  return min === max ? `${min}` : `${min}–${max}`;
}

/**
 * Convierte el campo ubicación ("lat, lng", un link de Google Maps o el GeoJSON del mapa del panel)
 * en un punto. Se corre unos 150 m en una dirección fija por propiedad, para que el centro del círculo
 * tampoco sea la dirección real.
 */
export function ubicacionAproximada(texto: string | null | undefined, semilla: string) {
  if (!texto) return null;
  let lat: number | undefined, lng: number | undefined;
  try {
    const g = JSON.parse(texto);
    const c = g?.coordinates ?? g?.geometry?.coordinates;
    if (Array.isArray(c)) [lng, lat] = c;
  } catch {
    const m = texto.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (m) [lat, lng] = [Number(m[1]), Number(m[2])];
  }
  if (lat === undefined || lng === undefined || !isFinite(lat) || !isFinite(lng)) return null;
  let h = 0;
  for (const ch of semilla) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ang = (h % 360) * (Math.PI / 180);
  const metros = 120 + (h % 80);
  return {
    lat: lat + (metros / 111_320) * Math.cos(ang),
    lng: lng + (metros / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(ang),
  };
}

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
