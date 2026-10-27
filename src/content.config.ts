import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TODOS } from './data/distritos';


const propiedades = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/propiedades' }),
  schema: z.object({
    codigo: z.string(),
    titulo: z.string(),
    estado: z.enum(['Disponible', 'Oportunidad', 'Vendida']),
    distrito: z.enum(TODOS),
    tipo: z.string(),
    precio: z.number(),
    precio_anterior: z.number().optional().nullable(),
    area_techada: z.number(),
    area_ocupada: z.number().optional().nullable(),
    dormitorios: z.number(),
    banos: z.number(),
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
