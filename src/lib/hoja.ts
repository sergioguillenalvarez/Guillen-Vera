/**
 * Lee la lista de precios de un proyecto desde Google Sheets (la que comparte la inmobiliaria)
 * en el momento de publicar la web. Solo se toman las columnas que se muestran al público:
 * tipo, piso, modelo, dormitorios, vista, área y PRECIO LISTA. El precio piso, los descuentos
 * y el número de unidad nunca salen de aquí.
 *
 * El link de la hoja NO se guarda en el repositorio (es público): en el panel se escribe una
 * clave (ej. BLUE) y el link va en Netlify como variable de entorno HOJA_BLUE.
 */

export interface Unidad {
  piso: number | null;
  modelo: string;
  dormitorios: number;
  vista: string;
  area: number;
  precio: number;
}

const cache = new Map<string, Promise<Unidad[]>>();

/** Clave del panel ("BLUE") → link guardado en Netlify (HOJA_BLUE). También acepta el link directo. */
export function linkDeHoja(valor?: string | null) {
  const v = valor?.trim();
  if (!v) return null;
  if (/^https?:\/\//.test(v)) return v;
  const clave = 'HOJA_' + v.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const link = process.env[clave]?.trim();
  if (!link) {
    console.warn(`[hoja] No existe la variable ${clave} en Netlify; se usan las tipologías escritas en el panel.`);
    return null;
  }
  return link;
}

/** Link de "compartir" o de edición de Google Sheets → link de descarga en CSV de esa pestaña. */
export function linkCsv(link: string) {
  const id = link.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return link; // ya es un CSV u otra URL directa
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

export function leerHoja(link: string): Promise<Unidad[]> {
  const url = linkCsv(link);
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const res = await fetch(url, { redirect: 'follow' });
      const texto = await res.text();
      if (!res.ok || /^\s*<(!doctype|html)/i.test(texto)) {
        // Si la hoja no se puede leer, el build falla a propósito: Netlify deja publicada
        // la versión anterior (con precios correctos) en vez de una web sin precios.
        throw new Error(`[hoja] No se pudo leer la hoja de precios (${res.status}). Revisa que esté compartida como "Cualquier persona con el enlace": ${link}`);
      }
      const unidades = interpretar(parseCsv(texto));
      if (!unidades.length) throw new Error(`[hoja] La hoja no tiene unidades disponibles o cambió de columnas: ${link}`);
      console.log(`[hoja] ${unidades.length} unidades disponibles leídas de la hoja.`);
      return unidades;
    })());
  }
  return cache.get(url)!;
}

/** CSV con comillas ("S/ 480,139.00") y saltos de línea dentro de celdas. */
export function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const numero = (s: string) => {
  const n = Number(String(s).replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};

/** "VISTA PASEO DE LA REP./ CHACARILLA" → "Paseo de la Rep. / Chacarilla" */
export function limpiarVista(v: string) {
  const menores = new Set(['de', 'la', 'del', 'el', 'y', 'al', 'a', 'las', 'los']);
  return v
    .replace(/^\s*vista\s+(a\s+)?/i, '')
    .replace(/\brep\.?(?=\s*(\/|$))/i, 'República')
    .split('/')
    .map((parte) => parte.trim().toLowerCase().split(/\s+/)
      .map((w, i) => (i && menores.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' '))
    .filter(Boolean)
    .join(' / ');
}

export function interpretar(filas: string[][]): Unidad[] {
  // La fila de encabezados es la primera que tenga "modelo" (o "tipología") y algún "precio"
  const h = filas.findIndex((f) => f.some((c) => /^(modelo|tipologia)$/.test(norm(c))) && f.some((c) => norm(c).includes('precio')));
  if (h < 0) return [];
  const cab = filas[h].map(norm);
  const col = (...pruebas: ((c: string) => boolean)[]) => {
    for (const p of pruebas) { const i = cab.findIndex(p); if (i >= 0) return i; }
    return -1;
  };
  const c = {
    tipo: col((x) => x.startsWith('tipo de unidad'), (x) => x === 'tipo'),
    piso: col((x) => x === 'piso', (x) => x.startsWith('piso') && !x.includes('precio')),
    modelo: col((x) => x === 'modelo', (x) => x === 'tipologia'),
    dorm: col((x) => x.startsWith('dorm')),
    vista: col((x) => x.includes('vista')),
    area: col((x) => x.includes('total'), (x) => x.includes('vendible'), (x) => x.includes('techada'), (x) => x.startsWith('area')),
    estado: col((x) => x === 'estado', (x) => x.includes('estado')),
    // Solo el precio de lista. Nunca "precio piso", descuentos ni comisiones.
    precio: col((x) => x.includes('precio') && x.includes('lista'), (x) => x.includes('precio') && !/piso|dscto|descuento|comision|corredor/.test(x)),
  };
  if (c.modelo < 0 || c.precio < 0) return [];
  const g = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '').trim() : '');
  return filas.slice(h + 1).flatMap((f) => {
    const tipo = norm(g(f, c.tipo));
    if (/estacion|cochera|deposito|local|oficina|tienda/.test(tipo)) return [];
    if (c.estado >= 0 && norm(g(f, c.estado)) !== 'disponible') return [];
    const modelo = g(f, c.modelo).toUpperCase();
    const precio = numero(g(f, c.precio));
    const area = numero(g(f, c.area));
    if (!modelo || !precio || !area) return [];
    return [{
      piso: numero(g(f, c.piso)),
      modelo,
      dormitorios: numero(g(f, c.dorm)) ?? 0,
      vista: limpiarVista(g(f, c.vista)),
      area,
      precio: Math.round(precio),
    }];
  });
}

/** [3,4,5,9,10] → "3 al 5, 9 y 10" */
export function listaPisos(pisos: number[]) {
  const u = [...new Set(pisos)].sort((a, b) => a - b);
  const tramos: string[] = [];
  for (let i = 0; i < u.length; ) {
    let j = i;
    while (j + 1 < u.length && u[j + 1] === u[j] + 1) j++;
    if (j - i >= 2) tramos.push(`${u[i]} al ${u[j]}`);
    else for (let k = i; k <= j; k++) tramos.push(String(u[k]));
    i = j + 1;
  }
  return tramos.length > 1 ? `${tramos.slice(0, -1).join(', ')} y ${tramos.at(-1)}` : (tramos[0] ?? '');
}
