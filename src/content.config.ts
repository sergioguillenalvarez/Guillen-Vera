import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TODOS } from './data/distritos';


// Los campos que el panel puede dejar vacíos (null) se convierten a su valor por defecto
const num0 = z.number().nullish().transform((v) => v ?? 0);
const lista = z.array(z.string()).nullish().transform((v) => v ?? []);
const no = z.boolean().nullish().transform((v) => v ?? false);

const propiedades = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/propiedades' }),
  schema: z.object({
    codigo: z.string(),
    titulo: z.string(),
    operacion: z.enum(['Venta', 'Alquiler']).default('Venta'),
    estado: z.enum(['Disponible', 'Oportunidad', 'Vendida', 'Alquilada']),
    distrito: z.enum(TODOS),
    tipo: z.string(),
    moneda: z.enum(['USD', 'PEN']).default('USD'),
    // En proyectos el precio se calcula solo: el más bajo de las tipologías disponibles
    precio: z.number().optional().nullable(),
    precio_anterior: z.number().optional().nullable(),
    area_techada: z.number().optional().nullable(),
    area_ocupada: z.number().optional().nullable(),
    dormitorios: z.number().optional().nullable(),
    banos: z.number().optional().nullable(),
    cocheras: z.number().default(0),
    piso: z.string().optional().nullable(),
    ascensor: z.string().optional().nullable(),
    vista: z.string().optional().nullable(),
    anio: z.number().optional().nullable(),
    mantenimiento: z.number().optional().nullable(),
    hipoteca_banco: z.string().optional().nullable(),
    sunarp: z.boolean().default(true),
    acepta_credito: z.boolean().default(true),
    fotos: z.array(z.string()).default([]),
    // Proyectos: una fila por tipología (modelo)
    entrega: z.string().optional().nullable(),
    etapa: z.string().optional().nullable(),
    estreno: z.boolean().optional().nullable(),
    sin_alcabala: z.boolean().optional().nullable(),
    bancos: lista,
    carta_fianza: no,
    mantenimiento_nota: z.string().optional().nullable(),
    tipo_cambio: z.number().optional().nullable(),
    // Clave de la hoja de precios (ej. BLUE → variable HOJA_BLUE en Netlify)
    hoja_precios: z.string().optional().nullable(),
    tipologias: z.array(z.object({
      nombre: z.string().optional().nullable(),
      modelo: z.string().optional().nullable(),
      dormitorios: num0,
      banos: z.number().optional().nullable(),
      area: num0,
      precio: num0,
      pisos: z.string().optional().nullable(),
      unidades: z.number().optional().nullable(),
      agotada: no,
      cochera: z.number().optional().nullable(),
      cochera_texto: z.string().optional().nullable(),
      incluye: z.string().optional().nullable(),
      vista: z.string().optional().nullable(),
      plano: z.string().optional().nullable(),
      fotos: lista,
      // Lo completa la hoja de precios al publicar
      area_max: z.number().optional().nullable(),
      vistas: lista,
    })).default([]),
    // Ubicación aproximada: "lat, lng" o el punto que guarda el mapa del panel
    ubicacion: z.string().optional().nullable(),
    referencia: z.string().optional().nullable(),
    // Alquiler
    garantia_meses: z.number().optional().nullable(),
    adelanto_meses: z.number().optional().nullable(),
    mascotas: z.boolean().optional().nullable(),
    amoblado: z.boolean().optional().nullable(),
    tiktok: z.string().optional().nullable(),
    recorrido_youtube: z.string().optional().nullable(),
    recorrido_video: z.string().optional().nullable(),
    fecha_publicacion: z.coerce.date(),
    exclusividad_firma: z.coerce.date().optional().nullable(),
    exclusividad_meses: z.number().optional().nullable(),
    renovaciones: z.array(z.object({ fecha: z.coerce.date(), meses: z.number() })).default([]),
    dias_en_vender: z.number().optional().nullable(),
    ejemplo: z.boolean().default(false),
  }),
});

const preguntas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/preguntas' }),
  schema: z.object({
    pregunta: z.string(),
    orden: z.number().default(10),
  }),
});

export const collections = { propiedades, preguntas };
