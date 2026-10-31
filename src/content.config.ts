import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TODOS } from './data/distritos';


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
    // Proyectos: una fila por tipología
    entrega: z.string().optional().nullable(),
    tipologias: z.array(z.object({
      nombre: z.string(),
      dormitorios: z.number(),
      banos: z.number().optional().nullable(),
      area: z.number(),
      precio: z.number(),
      pisos: z.string().optional().nullable(),
      unidades: z.number().optional().nullable(),
      agotada: z.boolean().default(false),
      plano: z.string().optional().nullable(),
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
