// Lima Top: la prioridad. Salen primero en filtros, portada y orden de la cartera.
export const PRIORITARIOS = ['Miraflores', 'Barranco', 'San Isidro', 'Surquillo', 'Magdalena', 'Lince'] as const;

// Resto de Lima y Callao, para no dejar pasar oportunidades.
export const OTROS = ['Santiago de Surco', 'San Borja', 'La Molina', 'Jesús María', 'Pueblo Libre', 'San Miguel', 'Chorrillos', 'Lima Cercado', 'Breña', 'La Victoria', 'Rímac', 'San Juan de Miraflores', 'Villa María del Triunfo', 'Villa El Salvador', 'Ate', 'Santa Anita', 'El Agustino', 'San Juan de Lurigancho', 'Los Olivos', 'San Martín de Porres', 'Independencia', 'Comas', 'Carabayllo', 'Puente Piedra', 'Cieneguilla', 'Pachacámac', 'Lurín', 'Punta Hermosa', 'Punta Negra', 'San Bartolo', 'Asia', 'Callao', 'Bellavista', 'La Perla', 'La Punta'] as const;

export const TODOS = [...PRIORITARIOS, ...OTROS] as const;

export const esPrioritario = (d: string) => (PRIORITARIOS as readonly string[]).includes(d);
