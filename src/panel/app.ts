/**
 * Panel de propiedades de Guillen & Vera.
 * Lee y guarda los archivos de src/content/propiedades directo en GitHub (un solo commit por
 * guardado, con todas las fotos). Las fotos se achican en el navegador antes de subir.
 */
import YAML from 'yaml';
import { PRIORITARIOS, OTROS } from '../data/distritos';

const REPO = 'sergioguillenalvarez/Guillen-Vera';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}/main/public`;
const CARPETA = 'src/content/propiedades';
const SIN_DORM = ['Local comercial', 'Oficina', 'Almacén', 'Terreno'];
const TIPOS = ['Departamento', 'Flat', 'Dúplex', 'Penthouse', 'Loft', 'Casa', 'Local comercial', 'Oficina', 'Almacén', 'Terreno'];

type Foto = { path: string; url: string; blob?: Blob };
type Datos = Record<string, any>;
interface Ficha { archivo?: string; slug?: string; data: Datos; body: string; fotos: Foto[]; tips: { data: Datos; fotos: Foto[] }[] }

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const app = $('#app');
const acciones = $('#acciones');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hoy = () => new Date().toISOString().slice(0, 10);
const dinero = (n: number | null | undefined, m = 'USD') => (n ? (m === 'PEN' ? 'S/ ' : 'US$ ') + Math.round(n).toLocaleString('en-US') : '—');
const urlFoto = (p: string) => (p.startsWith('blob:') || p.startsWith('http') ? p : RAW + encodeURI(p));

function aviso(texto: string, error = false) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.toggle('err', error);
  t.hidden = false;
  clearTimeout((t as any)._h);
  (t as any)._h = setTimeout(() => (t.hidden = true), error ? 9000 : 4000);
}

/* ---------------- GitHub ---------------- */

let token = '';
function leerToken() {
  try {
    const propio = localStorage.getItem('gv-panel-token');
    if (propio) return propio;
    // el mismo token que ya usa el panel clásico (/admin)
    const sv = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null');
    return sv?.token || '';
  } catch { return ''; }
}

async function gh(ruta: string, opts: RequestInit = {}) {
  const r = await fetch(ruta.startsWith('http') ? ruta : API + ruta, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!r.ok) {
    const txt = await r.text();
    const e = new Error(r.status === 401 ? 'El token no es válido o venció.' : `GitHub respondió ${r.status}: ${txt.slice(0, 160)}`);
    (e as any).status = r.status;
    throw e;
  }
  return r.status === 204 ? null : r.json();
}

const deBase64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const aBase64 = (blob: Blob) => new Promise<string>((ok, mal) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(',')[1]);
  fr.onerror = () => mal(fr.error);
  fr.readAsDataURL(blob);
});

function leerMd(texto: string) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return { data: (m ? YAML.parse(m[1]) : {}) as Datos, body: (m ? m[2] : texto).trim() };
}

/** Un commit con varios archivos (fotos + ficha). Reintenta si alguien guardó al mismo tiempo. */
async function commit(mensaje: string, archivos: { path: string; sha?: string | null; content?: string }[]) {
  for (let intento = 0; intento < 3; intento++) {
    const ref = await gh('/git/ref/heads/main');
    const base = await gh(`/git/commits/${ref.object.sha}`);
    const arbol = await gh('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: base.tree.sha, tree: archivos.map((a) => ({ path: a.path, mode: '100644', type: 'blob', ...(a.content !== undefined ? { content: a.content } : { sha: a.sha ?? null }) })) }),
    });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [ref.object.sha] }) });
    try {
      await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      return;
    } catch (e: any) {
      if (e.status !== 422 || intento === 2) throw e;
    }
  }
}

/* ---------------- Fotos ---------------- */

async function achicar(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any); }
  catch { throw new Error(`No pude abrir "${file.name}". Si es una foto HEIC del iPhone, envíala como JPG.`); }
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', 0.82));
  if (blob && blob.type === 'image/webp') return blob;
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No pude convertir la foto'))), 'image/jpeg', 0.85));
}

async function agregarFotos(lista: Foto[], files: FileList | File[], alTerminar: () => void) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!imgs.length) return aviso('Esos archivos no son fotos.', true);
  aviso(`Preparando ${imgs.length} foto${imgs.length === 1 ? '' : 's'}…`);
  for (const f of imgs) {
    try {
      const blob = await achicar(f);
      lista.push({ path: '', url: URL.createObjectURL(blob), blob });
      alTerminar();
    } catch (e: any) { aviso(e.message, true); }
  }
}

/** Grilla de fotos: soltar varias de golpe, arrastrar para ordenar, estrella = portada. */
function grillaFotos(cont: HTMLElement, lista: Foto[], cambio: () => void, opciones: { portada?: boolean } = {}) {
  const pintar = () => {
    cont.innerHTML = `
      <div class="pn-fotos">
        ${lista.map((f, i) => `
          <figure class="pn-foto" draggable="true" data-i="${i}">
            <img src="${esc(urlFoto(f.url))}" alt="" loading="lazy" />
            ${opciones.portada !== false && i === 0 ? '<span class="pn-portada">Portada</span>' : ''}
            <div class="pn-fbtns">
              ${opciones.portada !== false && i > 0 ? `<button type="button" data-portada="${i}" title="Usar como portada">★</button>` : ''}
              <button type="button" data-quitar="${i}" title="Quitar">✕</button>
            </div>
          </figure>`).join('')}
        <label class="pn-soltar">
          <input type="file" accept="image/*,.heic,.heif" multiple hidden />
          <b>＋</b><span>${lista.length ? 'Agregar más' : 'Sube todas las fotos de golpe'}</span><small>o arrástralas aquí</small>
        </label>
      </div>`;
  };
  const listo = () => { pintar(); cambio(); };
  cont.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.type === 'file' && inp.files) agregarFotos(lista, inp.files, listo);
  });
  cont.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.quitar) lista.splice(Number(b.dataset.quitar), 1);
    if (b.dataset.portada) lista.unshift(...lista.splice(Number(b.dataset.portada), 1));
    listo();
  });
  let desde = -1;
  cont.addEventListener('dragstart', (e) => { const f = (e.target as HTMLElement).closest<HTMLElement>('.pn-foto'); desde = f ? Number(f.dataset.i) : -1; });
  cont.addEventListener('dragover', (e) => { e.preventDefault(); cont.classList.add('sobre'); });
  cont.addEventListener('dragleave', () => cont.classList.remove('sobre'));
  cont.addEventListener('drop', (e) => {
    e.preventDefault();
    cont.classList.remove('sobre');
    if (e.dataTransfer?.files.length) return agregarFotos(lista, e.dataTransfer.files, listo);
    const destino = (e.target as HTMLElement).closest<HTMLElement>('.pn-foto');
    if (desde >= 0 && destino) {
      const a = Number(destino.dataset.i);
      lista.splice(a, 0, ...lista.splice(desde, 1));
      listo();
    }
    desde = -1;
  });
  pintar();
}

/* ---------------- Ubicación ---------------- */

/** Acepta "lat, lng", un link largo de Google Maps o el GeoJSON que guardaba el panel clásico. */
function coordenadas(texto: string | null | undefined): [number, number] | null {
  if (!texto) return null;
  try {
    const g = JSON.parse(texto);
    const c = g?.coordinates ?? g?.geometry?.coordinates;
    if (Array.isArray(c)) return [c[1], c[0]];
  } catch { /* no es JSON */ }
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/, /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/];
  for (const p of pats) {
    const m = texto.match(p);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

/* ---------------- Lista ---------------- */

let fichas: { archivo: string; slug: string; data: Datos; body: string }[] = [];

async function cargarLista() {
  const archivos = (await gh(`/contents/${CARPETA}?ref=main`)) as any[];
  fichas = await Promise.all(archivos.filter((a) => a.name.endsWith('.md')).map(async (a) => {
    const f = await gh(`/contents/${a.path}?ref=main`);
    return { archivo: a.path, slug: a.name.replace(/\.md$/, ''), ...leerMd(deBase64(f.content)) };
  }));
  fichas.sort((a, b) => String(b.data.fecha_publicacion).localeCompare(String(a.data.fecha_publicacion)));
}

function tarjeta(d: Datos, fotos: string[], href = '') {
  const proyecto = (d.tipologias?.length ?? 0) > 0;
  const tag = d.estado === 'Vendida' ? 'Vendida' : d.estado === 'Alquilada' ? 'Alquilada' : d.estado === 'Oportunidad' ? 'Oportunidad' : proyecto ? 'Proyecto' : d.operacion === 'Alquiler' ? 'En alquiler' : 'Disponible';
  const precio = proyecto ? Math.min(...d.tipologias.map((t: Datos) => t.precio || Infinity)) : d.precio;
  const facts = proyecto
    ? `<b>${d.tipologias.length}</b> modelo${d.tipologias.length === 1 ? '' : 's'}`
    : [d.dormitorios != null && !SIN_DORM.includes(d.tipo) ? `<b>${d.dormitorios}</b> dorm` : '', d.banos != null ? `<b>${d.banos}</b> baños` : '', d.area_techada ? `<b>${d.area_techada}</b> m²` : '', d.cocheras > 0 ? `<b>${d.cocheras}</b> coch` : ''].filter(Boolean).join('<span class="sep">|</span>');
  return `
    <${href ? `a href="${href}"` : 'div'} class="card pn-card">
      <div class="photos">
        ${fotos[0] ? `<img class="pn-cimg" src="${esc(urlFoto(fotos[0]))}" alt="" />` : '<div class="ph s-living"></div>'}
        <span class="tag ${/Vendida|Alquilada/.test(tag) ? 'sold' : tag === 'Oportunidad' ? 'opp' : ''}">${tag === 'Oportunidad' ? '' : '<span class="dot"></span>'}${tag}</span>
        <span class="ref">${esc(d.codigo || 'GV-?')}</span>
        ${fotos.length > 1 ? `<span class="pn-nfotos">${fotos.length} fotos</span>` : ''}
      </div>
      <div class="cinfo">
        <div class="cprice">${proyecto && !isFinite(precio) ? '<span class="desde">Precios desde la hoja</span>' : `${proyecto ? '<span class="desde">Desde</span>' : ''}${dinero(precio, d.moneda)}`}${d.operacion === 'Alquiler' && !proyecto ? '<span class="desde"> /mes</span>' : ''}</div>
        <div class="cfacts">${facts || '&nbsp;'}</div>
        <div class="caddr">${esc(proyecto ? 'Proyecto' : d.tipo || 'Tipo')} · ${esc(d.distrito || 'Distrito')}</div>
      </div>
    </${href ? 'a' : 'div'}>`;
}

async function verLista() {
  acciones.innerHTML = `<a class="pillbtn" href="/" target="_blank" rel="noopener">Ver la web</a><a class="pillbtn solid" href="#nueva">＋ Nueva propiedad</a>`;
  app.innerHTML = '<p class="pn-cargando">Cargando tus propiedades…</p>';
  try { await cargarLista(); } catch (e: any) { return manejarError(e); }
  app.innerHTML = `
    <section class="pn-lista">
      <div class="pn-h"><div><div class="eyebrow">Tu cartera</div><h1>Propiedades</h1></div><p class="note">${fichas.length} en total. Toca una para editarla.</p></div>
      <div class="grid">
        <a class="pn-nueva" href="#nueva"><b>＋</b><span>Nueva propiedad</span><small>Fotos, datos y listo</small></a>
        ${fichas.map((f) => tarjeta(f.data, f.data.fotos ?? [], `#editar/${f.slug}`)).join('')}
      </div>
      <p class="note pn-pie">¿Preguntas frecuentes, textos de portada o asesores? Están en el <a href="/admin/">panel clásico</a>.</p>
    </section>`;
}

/* ---------------- Editor ---------------- */

const opciones = (xs: (string | [string, string])[], v: unknown) =>
  xs.map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(v ?? '') === val ? 'selected' : ''}>${esc(lab)}</option>`; }).join('');
const seg = (k: string, xs: (string | [string, string])[], v: unknown) =>
  `<div class="pn-seg" data-k="${k}">${xs.map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<button type="button" data-v="${esc(val)}" aria-pressed="${String(v) === val}">${esc(lab)}</button>`; }).join('')}</div>`;
const campo = (k: string, label: string, v: unknown, extra = '', tipo = 'text', si = '') =>
  `<label class="pn-f" ${si ? `data-si="${si}"` : ''}><span>${label}</span><input name="${k}" type="${tipo}" ${tipo === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(v ?? '')}" ${extra} /></label>`;
const interruptor = (k: string, label: string, v: unknown, si = '') =>
  `<label class="pn-sw" ${si ? `data-si="${si}"` : ''}><input type="checkbox" name="${k}" ${v ? 'checked' : ''} /><i></i><span>${label}</span></label>`;

function nuevaFicha(): Ficha {
  const usados = fichas.map((f) => Number(String(f.data.codigo).replace(/\D/g, '')) || 0);
  const n = Math.max(0, ...usados) + 1;
  return {
    data: {
      codigo: `GV-${String(n).padStart(2, '0')}`, titulo: '', operacion: 'Venta', estado: 'Disponible', distrito: '', tipo: 'Departamento', moneda: 'USD',
      precio: null, cocheras: 0, sunarp: true, acepta_credito: true, fecha_publicacion: hoy(), exclusividad_firma: hoy(), exclusividad_meses: 6, renovaciones: [], tipologias: [], ejemplo: false,
    },
    body: '', fotos: [], tips: [],
  };
}

function abrirFicha(slug: string): Ficha | null {
  const f = fichas.find((x) => x.slug === slug);
  if (!f) return null;
  const d = structuredClone(f.data);
  return {
    archivo: f.archivo, slug: f.slug, data: d, body: f.body,
    fotos: [...new Set<string>(d.fotos ?? [])].map((p) => ({ path: p, url: p })),
    tips: (d.tipologias ?? []).map((t: Datos) => ({ data: t, fotos: (t.fotos ?? []).map((p: string) => ({ path: p, url: p })) })),
  };
}

let F: Ficha;
let sinGuardar = false;

function formTipologia(t: { data: Datos }, i: number) {
  const d = t.data;
  return `
    <div class="pn-tip" data-tip="${i}">
      <div class="pn-tiph"><b>Modelo ${esc(d.modelo || d.nombre || i + 1)}</b><button type="button" class="pn-x" data-quitar-tip="${i}">Quitar</button></div>
      <div class="pn-row3">
        ${campo('t.modelo', 'Letra en la hoja', d.modelo, 'placeholder="A"')}
        ${campo('t.nombre', 'Nombre en la web', d.nombre, 'placeholder="Flat 1 dormitorio"')}
        ${campo('t.dormitorios', 'Dormitorios', d.dormitorios, '', 'number')}
        ${campo('t.banos', 'Baños', d.banos, '', 'number')}
        ${campo('t.area', 'Área m² (sin hoja)', d.area || '', '', 'number')}
        ${campo('t.precio', 'Precio desde (sin hoja)', d.precio || '', '', 'number')}
      </div>
      <div class="pn-row2">
        ${campo('t.cochera_texto', 'Cochera', d.cochera_texto, 'placeholder="No tiene / Opcional (precio aparte)"')}
        ${campo('t.incluye', 'Incluye', d.incluye, 'placeholder="Estudio · walk-in closet"')}
      </div>
      <div class="pn-tfotos"></div>
    </div>`;
}

function verEditor(f: Ficha) {
  F = f;
  sinGuardar = false;
  const d = F.data;
  const proyecto = d.tipologias?.length > 0 || Boolean(d.hoja_precios);
  const [lat, lng] = coordenadas(d.ubicacion) ?? [];
  const antig = d.anio ? new Date().getFullYear() - d.anio : '';
  acciones.innerHTML = `<a class="pillbtn" href="#">← Volver</a><button type="button" class="pillbtn solid" id="guardar"><span class="hide-s">Guardar y </span>publicar</button>`;
  app.innerHTML = `
  <form class="pn-ed" id="ed" autocomplete="off" data-proyecto="${proyecto}">
    <div class="pn-col">
      <div class="pn-h"><div><div class="eyebrow">${F.slug ? 'Editando' : 'Nueva propiedad'}</div><h1>${esc(d.codigo)}</h1></div></div>

      <section class="pn-card-s">
        <h2>Lo básico</h2>
        <div class="pn-row2">
          <div class="pn-f"><span>¿Qué es?</span>${seg('_clase', [['propiedad', 'Una propiedad'], ['proyecto', 'Un proyecto']], proyecto ? 'proyecto' : 'propiedad')}</div>
          <div class="pn-f"><span>Operación</span>${seg('operacion', ['Venta', 'Alquiler'], d.operacion)}</div>
        </div>
        <div class="pn-f" data-si="!proyecto"><span>Tipo</span>${seg('tipo', TIPOS, d.tipo)}</div>
        <div class="pn-f"><span>Estado</span>${seg('estado', ['Disponible', 'Oportunidad', 'Vendida', 'Alquilada'], d.estado)}</div>
        <div class="pn-row2">
          ${campo('codigo', 'Código (el del video)', d.codigo, 'required pattern="GV-\\d+"')}
          <label class="pn-f"><span>Distrito</span><select name="distrito" required><option value="">Elige…</option><optgroup label="Lima Top">${opciones([...PRIORITARIOS], d.distrito)}</optgroup><optgroup label="Lima y Callao">${opciones([...OTROS], d.distrito)}</optgroup></select></label>
        </div>
        ${campo('titulo', 'Título', d.titulo, 'required placeholder="Departamento con vista al mar en Barranco"')}
        <div class="pn-row3">
          <div class="pn-f"><span>Moneda</span>${seg('moneda', [['USD', 'US$'], ['PEN', 'S/']], d.moneda)}</div>
          ${campo('precio', 'Precio <small data-si="alquiler">al mes</small>', d.precio, 'placeholder="240000"', 'number', '!proyecto')}
          ${campo('precio_anterior', 'Precio anterior', d.precio_anterior, 'placeholder="Solo oportunidades"', 'number', 'oportunidad')}
          ${campo('dias_en_vender', 'Días que tomó', d.dias_en_vender, '', 'number', 'cerrada')}
        </div>
      </section>

      <section class="pn-card-s">
        <h2>Fotos <small>La primera es la portada. Arrastra para ordenar.</small></h2>
        <div id="fotos"></div>
      </section>

      <section class="pn-card-s" data-si="!proyecto">
        <h2>Características</h2>
        <div class="pn-row3">
          ${campo('area_techada', 'Área techada m²', d.area_techada, '', 'number')}
          ${campo('area_ocupada', 'Área de terreno / ocupada m²', d.area_ocupada, '', 'number')}
          ${campo('dormitorios', 'Dormitorios', d.dormitorios, '', 'number', 'dorm')}
          ${campo('banos', 'Baños', d.banos, 'placeholder="2.5 = 2 y medio"', 'number')}
          ${campo('cocheras', 'Cocheras', d.cocheras, '', 'number')}
          ${campo('piso', 'Piso', d.piso, 'placeholder="9 de 14"')}
          ${campo('_antig', 'Antigüedad (años)', antig, 'placeholder="0 si es de estreno"', 'number')}
          ${campo('vista', 'Vista', d.vista, 'placeholder="Externa, al parque…"')}
          ${campo('mantenimiento', 'Mantenimiento S/ al mes', d.mantenimiento || '', '', 'number')}
        </div>
        <div class="pn-f"><span>Ascensor</span>${seg('ascensor', [['', 'No indicar'], ['Sí', 'Sí'], ['Directo', 'Directo'], ['No', 'No']], d.ascensor ?? '')}</div>
      </section>

      <section class="pn-card-s" data-si="venta">
        <h2>Situación legal</h2>
        <div class="pn-sws">
          ${interruptor('sunarp', 'Inscrita en SUNARP', d.sunarp ?? true)}
          ${interruptor('acepta_credito', 'Acepta crédito hipotecario', d.acepta_credito ?? true)}
        </div>
        ${campo('hipoteca_banco', 'Banco de la hipoteca (vacío si no tiene)', d.hipoteca_banco, '', 'text', '!proyecto')}
      </section>

      <section class="pn-card-s" data-si="alquiler">
        <h2>Condiciones del alquiler</h2>
        <div class="pn-row2">
          ${campo('adelanto_meses', 'Meses de adelanto', d.adelanto_meses ?? 1, '', 'number')}
          ${campo('garantia_meses', 'Meses de garantía', d.garantia_meses ?? 2, '', 'number')}
        </div>
        <div class="pn-sws">${interruptor('amoblado', 'Amoblado', d.amoblado)}${interruptor('mascotas', 'Acepta mascotas', d.mascotas)}</div>
      </section>

      <section class="pn-card-s" data-si="proyecto">
        <h2>El proyecto</h2>
        <div class="pn-f"><span>Etapa</span>${seg('etapa', ['Entrega inmediata', 'En construcción', 'En planos'], d.etapa ?? 'Entrega inmediata')}</div>
        <div class="pn-row2">
          ${campo('entrega', 'Fecha de entrega', d.entrega, 'placeholder="Junio 2027"')}
          ${campo('hoja_precios', 'Clave de la hoja de precios', d.hoja_precios, 'placeholder="BLUE"')}
          ${campo('_bancos', 'Bancos que financian', (d.bancos ?? []).join(', '), 'placeholder="Interbank (vacío = cualquiera)"')}
          ${campo('mantenimiento_nota', 'Mantenimiento', d.mantenimiento_nota, 'placeholder="US$ 1 por m² al mes"')}
          ${campo('tipo_cambio', 'Tipo de cambio (si está en soles)', d.tipo_cambio, 'placeholder="3.75"', 'number')}
        </div>
        <div class="pn-sws">
          ${interruptor('estreno', 'De estreno', d.estreno)}
          ${interruptor('sin_alcabala', 'No paga alcabala', d.sin_alcabala)}
          ${interruptor('carta_fianza', 'Otros bancos piden carta fianza', d.carta_fianza)}
        </div>
        <h3>Modelos</h3>
        <div id="tips">${F.tips.map((t, i) => formTipologia(t, i)).join('')}</div>
        <button type="button" class="pillbtn" id="mas-tip">＋ Agregar modelo</button>
      </section>

      <section class="pn-card-s">
        <h2>Video y ubicación</h2>
        ${campo('tiktok', 'Link del TikTok', d.tiktok, 'placeholder="https://vt.tiktok.com/…"', 'url')}
        ${campo('recorrido_youtube', 'Recorrido completo en YouTube (opcional)', d.recorrido_youtube, 'placeholder="https://youtu.be/…"', 'url')}
        <label class="pn-f"><span>Ubicación: pega el link de Google Maps o las coordenadas</span><input name="_ubic" value="${lat != null ? `${lat.toFixed(6)}, ${lng!.toFixed(6)}` : ''}" placeholder="-12.1542, -76.9642" /><small class="note" id="ubic-ok"></small></label>
        ${campo('referencia', 'Referencia de la zona', d.referencia, 'placeholder="A 3 cuadras de la estación San Juan"')}
        <p class="note">En la web solo se ve la zona aproximada, nunca la dirección exacta.</p>
      </section>

      <section class="pn-card-s">
        <h2>Descripción</h2>
        <textarea name="_body" rows="9" placeholder="Cuenta lo mejor de la propiedad…">${esc(F.body)}</textarea>
      </section>

      <section class="pn-card-s">
        <h2>Exclusividad <small>No se muestra en la web. Al vencer, la propiedad se oculta sola.</small></h2>
        <div class="pn-row2">
          ${campo('exclusividad_firma', 'Fecha de firma', d.exclusividad_firma ? String(d.exclusividad_firma).slice(0, 10) : '', '', 'date')}
          <div class="pn-f"><span>Vigencia</span>${seg('exclusividad_meses', [['3', '3 meses'], ['6', '6 meses'], ['12', '12 meses']], d.exclusividad_meses ?? 6)}</div>
        </div>
        <div class="pn-renov" id="renov"></div>
      </section>

      ${F.slug ? '<button type="button" class="pn-borrar" id="borrar">Eliminar esta propiedad de la web</button>' : ''}
    </div>

    <aside class="pn-lado">
      <div class="pn-prev">
        <div class="pn-lt"><span class="eyebrow">Así se ve en la web</span>${F.slug ? `<a class="note" href="/propiedad/${F.slug}/" target="_blank" rel="noopener">Abrir la publicada ↗</a>` : ''}</div>
        <div id="prev"></div>
      </div>
      <div class="pn-res"><div class="eyebrow">Resumen</div><div id="res"></div></div>
    </aside>
  </form>`;

  const form = $<HTMLFormElement>('#ed');
  grillaFotos($('#fotos'), F.fotos, actualizar);
  const montarTips = () => $$('.pn-tip').forEach((el) => grillaFotos($('.pn-tfotos', el), F.tips[Number(el.dataset.tip)].fotos, actualizar, { portada: false }));
  montarTips();

  form.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const s = b.closest<HTMLElement>('.pn-seg');
    if (s) {
      $$('button', s).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (s.dataset.k === '_clase') {
        form.dataset.proyecto = String(b.dataset.v === 'proyecto');
        if (b.dataset.v === 'proyecto' && !F.tips.length) { leerForm(); F.tips.push({ data: { dormitorios: 1 }, fotos: [] }); repintarTips(); }
      }
      actualizar();
    }
    if (b.id === 'mas-tip') { leerForm(); F.tips.push({ data: { dormitorios: 1 }, fotos: [] }); repintarTips(); actualizar(); }
    if (b.dataset.quitarTip) { leerForm(); F.tips.splice(Number(b.dataset.quitarTip), 1); repintarTips(); actualizar(); }
    if (b.dataset.renovar) { leerForm(); F.data.renovaciones = [...(F.data.renovaciones ?? []), { fecha: hoy(), meses: Number(b.dataset.renovar) }]; actualizar(); aviso(`Renovada por ${b.dataset.renovar} meses. Guarda para aplicar.`); }
    if (b.dataset.quitarRenov) { F.data.renovaciones.splice(Number(b.dataset.quitarRenov), 1); actualizar(); }
    if (b.id === 'borrar') borrar();
  });
  const repintarTips = () => { $('#tips').innerHTML = F.tips.map((t, i) => formTipologia(t, i)).join(''); montarTips(); };
  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#guardar').addEventListener('click', guardar);
  actualizar();
  sinGuardar = false;
}

/** Pasa lo escrito en el formulario a F.data. */
function leerForm() {
  const form = $<HTMLFormElement>('#ed');
  const d = F.data;
  const proyecto = form.dataset.proyecto === 'true';
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  $$<HTMLInputElement>('input[name]:not([name^="t."]), select[name], textarea[name]', form).forEach((el) => {
    const k = el.name;
    if (k.startsWith('_')) return;
    if (el.type === 'checkbox') d[k] = el.checked;
    else if (el.type === 'number') d[k] = num(el.value);
    else d[k] = el.value.trim();
  });
  $$('.pn-seg', form).forEach((s) => {
    const v = $('[aria-pressed="true"]', s)?.dataset.v ?? '';
    if (s.dataset.k!.startsWith('_') || s.closest('.pn-tip')) return;
    d[s.dataset.k!] = s.dataset.k === 'exclusividad_meses' ? Number(v) : v;
  });
  d.codigo = String(d.codigo).toUpperCase().replace(/\s+/g, '').replace(/^GV(\d)/, 'GV-$1');
  d.cocheras = d.cocheras ?? 0;
  const antig = num($<HTMLInputElement>('[name="_antig"]', form).value);
  d.anio = antig == null ? null : new Date().getFullYear() - antig;
  d.bancos = $<HTMLInputElement>('[name="_bancos"]', form).value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const c = coordenadas($<HTMLInputElement>('[name="_ubic"]', form).value);
  d.ubicacion = c ? JSON.stringify({ type: 'Point', coordinates: [c[1], c[0]] }) : null;
  F.body = $<HTMLTextAreaElement>('[name="_body"]', form).value.trim();
  if (proyecto) {
    $$('.pn-tip', form).forEach((el) => {
      const t = F.tips[Number(el.dataset.tip)].data;
      $$<HTMLInputElement>('input[name^="t."]', el).forEach((inp) => {
        const k = inp.name.slice(2);
        t[k] = inp.type === 'number' ? num(inp.value) : inp.value.trim();
      });
    });
    d.tipo = d.tipo && !SIN_DORM.includes(d.tipo) ? d.tipo : 'Departamento';
  }
  if (SIN_DORM.includes(d.tipo) && !proyecto) d.dormitorios = null;
  return proyecto;
}

function actualizar() {
  sinGuardar = true;
  const form = $<HTMLFormElement>('#ed');
  const proyecto = leerForm();
  const d = F.data;
  const cerrada = d.estado === 'Vendida' || d.estado === 'Alquilada';
  const cond: Record<string, boolean> = {
    proyecto, '!proyecto': !proyecto, alquiler: d.operacion === 'Alquiler', venta: d.operacion !== 'Alquiler',
    oportunidad: d.estado === 'Oportunidad', cerrada, dorm: !SIN_DORM.includes(d.tipo),
  };
  $$('[data-si]', form).forEach((el) => (el.hidden = !cond[el.dataset.si!]));
  $('h1', form).textContent = d.codigo || 'Sin código';

  const c = coordenadas($<HTMLInputElement>('[name="_ubic"]', form).value);
  const ubicTxt = $<HTMLInputElement>('[name="_ubic"]', form).value.trim();
  $('#ubic-ok').textContent = !ubicTxt ? '' : c ? `✓ Punto leído: ${c[0].toFixed(5)}, ${c[1].toFixed(5)}` : /goo\.gl|maps\.app/.test(ubicTxt) ? 'Ese es un link corto: ábrelo y copia el link largo de la barra, o mantén presionado el punto en Google Maps y copia las coordenadas.' : 'No reconozco ese formato. Prueba con las coordenadas, ej. -12.1542, -76.9642';

  // vigencia de la exclusividad
  const vence = (() => {
    if (!d.exclusividad_firma || !d.exclusividad_meses) return null;
    const meses = d.exclusividad_meses + (d.renovaciones ?? []).reduce((s: number, r: Datos) => s + Number(r.meses || 0), 0);
    const v = new Date(d.exclusividad_firma + 'T12:00:00');
    v.setMonth(v.getMonth() + meses);
    return v;
  })();
  const dias = vence ? Math.ceil((vence.getTime() - Date.now()) / 86400000) : null;
  $('#renov').innerHTML = `
    ${(d.renovaciones ?? []).map((r: Datos, i: number) => `<span class="pn-pill">Renovada el ${esc(String(r.fecha).slice(0, 10))} · ${r.meses} meses <button type="button" data-quitar-renov="${i}" aria-label="Quitar">✕</button></span>`).join('')}
    ${vence ? `<p class="note">${dias! < 0 ? `<b class="pn-mal">Venció el ${vence.toLocaleDateString('es-PE')}</b> y ya no se ve en la web.` : `Vence el ${vence.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })} · quedan ${dias} días.`}</p>` : ''}
    <div class="pn-renbtns"><span class="note">Renovar:</span><button type="button" class="chip" data-renovar="3">+3 meses</button><button type="button" class="chip" data-renovar="6">+6 meses</button><button type="button" class="chip" data-renovar="12">+12 meses</button></div>`;

  // vista previa
  const fotos = F.fotos.map((f) => f.url);
  const dPrev = { ...d, tipologias: proyecto ? F.tips.map((t) => t.data) : [] };
  const kf = proyecto ? [] : [
    d.dormitorios != null && cond.dorm ? [d.dormitorios, 'dormitorios'] : null,
    d.banos != null ? [d.banos, 'baños'] : null,
    d.area_techada ? [`${d.area_techada} m²`, 'techados'] : null,
    d.area_ocupada ? [`${d.area_ocupada} m²`, 'terreno'] : null,
    d.anio ? [new Date().getFullYear() - d.anio ? `${new Date().getFullYear() - d.anio} años` : 'Estreno', 'antigüedad'] : null,
  ].filter(Boolean) as [unknown, string][];
  $('#prev').innerHTML = `
    ${tarjeta(dPrev, fotos)}
    ${d.titulo ? `<p class="pn-ptit">${esc(d.titulo)}</p>` : ''}
    ${kf.length ? `<div class="pn-kf">${kf.map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div>` : ''}`;

  // resumen y lo que falta
  const falta = [
    !/^GV-\d+$/.test(d.codigo) && 'el código (formato GV-05)',
    !d.titulo && 'el título',
    !d.distrito && 'el distrito',
    !proyecto && !d.precio && 'el precio',
    proyecto && !F.tips.length && 'al menos un modelo',
    !F.fotos.length && 'las fotos',
  ].filter(Boolean) as string[];
  const codigoUsado = fichas.some((x) => x.slug === d.codigo.toLowerCase() && x.slug !== F.slug);
  if (codigoUsado) falta.unshift(`otro código (${d.codigo} ya existe)`);
  const sugerencias = [
    !c && 'la ubicación (para el mapa)',
    !d.tiktok && 'el link del TikTok',
    !F.body && 'una descripción',
  ].filter(Boolean) as string[];
  const nuevas = F.fotos.filter((f) => f.blob).length + F.tips.reduce((s, t) => s + t.fotos.filter((f) => f.blob).length, 0);
  $('#res').innerHTML = `
    <div class="pn-estado ${falta.length ? 'falta' : 'ok'}">${falta.length ? `Falta: ${falta.join(', ')}.` : 'Lista para publicar'}</div>
    ${sugerencias.length ? `<p class="note">Recomendado: ${sugerencias.join(', ')}.</p>` : ''}
    <dl class="pn-dl">
      <div><dt>Operación</dt><dd>${esc(d.operacion)} · ${esc(d.estado)}</dd></div>
      <div><dt>Precio</dt><dd>${proyecto ? 'Desde el modelo más barato' : dinero(d.precio, d.moneda)}${d.operacion === 'Alquiler' ? ' al mes' : ''}</dd></div>
      <div><dt>Fotos</dt><dd>${F.fotos.length}${nuevas ? ` (${nuevas} nuevas por subir)` : ''}</dd></div>
      <div><dt>Mapa</dt><dd>${c ? 'Zona aproximada' : 'Sin ubicación'}</dd></div>
      <div><dt>Video</dt><dd>${d.tiktok ? 'TikTok' : '—'}${d.recorrido_youtube ? ' + recorrido' : ''}</dd></div>
      <div><dt>Exclusividad</dt><dd>${vence ? (dias! < 0 ? 'Vencida' : `${dias} días`) : '—'}</dd></div>
      <div><dt>Dirección web</dt><dd>/propiedad/${esc(d.codigo.toLowerCase())}/</dd></div>
    </dl>`;
  const g = $<HTMLButtonElement>('#guardar');
  g.disabled = falta.length > 0;
  g.title = falta.length ? `Falta: ${falta.join(', ')}` : '';
}

async function subirFotos(lista: Foto[], slug: string, archivos: { path: string; sha?: string | null }[], progreso: () => void) {
  for (const [i, f] of lista.entries()) {
    if (!f.blob) continue;
    const ext = f.blob.type === 'image/webp' ? 'webp' : 'jpg';
    const nombre = `${slug}-${Date.now().toString(36)}${i}.${ext}`;
    const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await aBase64(f.blob), encoding: 'base64' }) });
    archivos.push({ path: `public/fotos/${slug}/${nombre}`, sha: b.sha });
    f.path = `/fotos/${slug}/${nombre}`;
    progreso();
  }
}

async function guardar() {
  const proyecto = leerForm();
  const d = F.data;
  const slug = d.codigo.toLowerCase();
  const g = $<HTMLButtonElement>('#guardar');
  g.disabled = true;
  const total = F.fotos.filter((f) => f.blob).length + F.tips.reduce((s, t) => s + t.fotos.filter((f) => f.blob).length, 0);
  let hechas = 0;
  const progreso = () => { hechas++; g.textContent = `Subiendo fotos ${hechas}/${total}…`; };
  g.textContent = total ? `Subiendo fotos 0/${total}…` : 'Guardando…';
  try {
    const archivos: { path: string; sha?: string | null; content?: string }[] = [];
    await subirFotos(F.fotos, slug, archivos, progreso);
    for (const t of F.tips) await subirFotos(t.fotos, slug, archivos, progreso);
    g.textContent = 'Publicando…';
    d.fotos = F.fotos.map((f) => f.path);
    d.tipologias = proyecto ? F.tips.map((t) => ({ ...t.data, fotos: t.fotos.map((f) => f.path) })) : [];
    const soloProyecto = ['etapa', 'entrega', 'estreno', 'sin_alcabala', 'bancos', 'carta_fianza', 'mantenimiento_nota', 'tipo_cambio', 'hoja_precios'];
    const soloAlquiler = ['adelanto_meses', 'garantia_meses', 'amoblado', 'mascotas'];
    if (!proyecto) soloProyecto.forEach((k) => delete d[k]);
    else ['precio', 'area_techada', 'area_ocupada', 'dormitorios', 'banos', 'piso', 'vista', 'anio', 'mantenimiento', 'hipoteca_banco'].forEach((k) => delete d[k]);
    if (d.operacion !== 'Alquiler') soloAlquiler.forEach((k) => delete d[k]);
    if (d.estado !== 'Oportunidad') delete d.precio_anterior;
    if (d.estado === 'Alquilada' && d.operacion !== 'Alquiler') d.estado = 'Vendida';
    if (d.estado === 'Vendida' && d.operacion === 'Alquiler') d.estado = 'Alquilada';
    // vacíos fuera, así el archivo queda limpio
    const limpio: Datos = {};
    for (const [k, v] of Object.entries(d)) {
      if (v === '' || v === undefined) continue;
      if (v === null && !['precio'].includes(k)) continue;
      limpio[k] = v;
    }
    limpio.tipologias = limpio.tipologias.map((t: Datos) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== '' && v != null)));
    const md = `---\n${YAML.stringify(limpio, { lineWidth: 0 })}---\n\n${F.body}\n`;
    archivos.push({ path: `${CARPETA}/${slug}.md`, content: md });
    if (F.archivo && F.archivo !== `${CARPETA}/${slug}.md`) archivos.push({ path: F.archivo, sha: null });
    await commit(`${F.slug ? 'Actualiza' : 'Nueva'} propiedad ${d.codigo} (panel)`, archivos);
    sinGuardar = false;
    F.fotos.forEach((f) => delete f.blob);
    F.tips.forEach((t) => t.fotos.forEach((f) => delete f.blob));
    app.innerHTML = `
      <section class="pn-listo">
        <div class="pn-check">✓</div>
        <h1>¡Publicado!</h1>
        <p>La web se actualiza sola en uno o dos minutos.</p>
        <div class="pn-btns">
          <a class="pillbtn solid" href="/propiedad/${slug}/" target="_blank" rel="noopener">Ver ${esc(d.codigo)} en la web ↗</a>
          <a class="pillbtn" href="#editar/${slug}">Seguir editando</a>
          <a class="pillbtn" href="#">Ir a la lista</a>
        </div>
      </section>`;
    acciones.innerHTML = '';
    fichas = [];
  } catch (e: any) {
    g.disabled = false;
    g.innerHTML = '<span class="hide-s">Guardar y </span>publicar';
    aviso(`No se pudo guardar: ${e.message === 'Failed to fetch' ? 'se cortó la conexión. Revisa tu internet e inténtalo otra vez.' : e.message}`, true);
  }
}

async function borrar() {
  if (!F.archivo || !confirm(`¿Eliminar ${F.data.codigo} de la web? Esto no se puede deshacer desde el panel.`)) return;
  try {
    await commit(`Elimina propiedad ${F.data.codigo} (panel)`, [{ path: F.archivo, sha: null }]);
    sinGuardar = false;
    aviso(`${F.data.codigo} eliminada. La web se actualiza en un par de minutos.`);
    location.hash = '';
  } catch (e: any) { aviso(e.message, true); }
}

/* ---------------- Entrada ---------------- */

function verLogin(error = '') {
  acciones.innerHTML = '';
  app.innerHTML = `
    <section class="pn-login">
      <div class="eyebrow">Acceso</div>
      <h1>Hola, Sergio.</h1>
      <p>Pega tu token de GitHub (el mismo que usas en el panel clásico). Se guarda solo en esta computadora.</p>
      <form id="lg"><input name="t" type="password" placeholder="github_pat_…" required autocomplete="off" /><button class="pillbtn solid">Entrar</button></form>
      ${error ? `<p class="pn-mal">${esc(error)}</p>` : ''}
    </section>`;
  $('#lg').addEventListener('submit', (e) => {
    e.preventDefault();
    token = (new FormData(e.target as HTMLFormElement).get('t') as string).trim();
    try { localStorage.setItem('gv-panel-token', token); } catch { /* sin almacenamiento */ }
    ruta();
  });
}

function manejarError(e: any) {
  if (e.status === 401) {
    try { localStorage.removeItem('gv-panel-token'); } catch { /* */ }
    return verLogin('Ese token no funciona o venció. Crea uno nuevo y pégalo aquí.');
  }
  app.innerHTML = `<section class="pn-login"><h1>Algo falló</h1><p>${esc(e.message)}</p><button class="pillbtn solid" onclick="location.reload()">Reintentar</button></section>`;
}

async function ruta() {
  if (!token) return verLogin();
  const h = location.hash.slice(1);
  try {
    if (!fichas.length && (h === 'nueva' || h.startsWith('editar/'))) await cargarLista();
  } catch (e) { return manejarError(e); }
  if (h === 'nueva') return verEditor(nuevaFicha());
  if (h.startsWith('editar/')) {
    const f = abrirFicha(h.slice(7));
    if (f) return verEditor(f);
  }
  return verLista();
}

let hashAnterior = location.hash;
addEventListener('hashchange', () => {
  if (sinGuardar && !confirm('Tienes cambios sin guardar. ¿Salir igual?')) {
    history.replaceState(null, '', hashAnterior || '#');
    return;
  }
  sinGuardar = false;
  hashAnterior = location.hash;
  window.scrollTo({ top: 0 });
  ruta();
});
addEventListener('beforeunload', (e) => { if (sinGuardar) e.preventDefault(); });

token = leerToken();
ruta();
