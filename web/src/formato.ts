import type { ResultadoOrientacion } from './api';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** 'YYYY-MM-DD' → '15/03/2027' */
export const fecha = (f: string | null | undefined) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '—');

/** 'YYYY-MM-DD' → 'lun 21 oct' (agrega el año si no es el actual) */
export function fechaCorta(f: string) {
  const d = new Date(`${f.slice(0, 10)}T00:00`);
  const anio = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}${anio}`;
}

/** 'YYYY-MM-DD' → '21 de octubre de 2026' */
export function fechaLarga(f: string) {
  return new Date(`${f.slice(0, 10)}T00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Fecha+hora local 'YYYY-MM-DDTHH:MM' → 'lun 21 oct · 07:30 h' */
export const fechaHora = (f: string) => `${fechaCorta(f)} · ${f.slice(11, 16)} h`;

/** Timestamp ISO (UTC) → fecha y hora locales legibles. */
export const instante = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ETIQUETA_RESULTADO: Record<ResultadoOrientacion, string> = {
  FAVORABLE: 'Orientación favorable',
  DIFERIMIENTO_TEMPORAL: 'Posible diferimiento temporal',
  REVISION_MEDICA: 'Requiere revisión médica',
};

export const TONO_RESULTADO: Record<ResultadoOrientacion, 'lima' | 'ambar' | 'cielo'> = {
  FAVORABLE: 'lima',
  DIFERIMIENTO_TEMPORAL: 'ambar',
  REVISION_MEDICA: 'cielo',
};

export const LOCALIDADES = [
  'Córdoba', 'Villa María', 'Río Cuarto', 'Villa Carlos Paz', 'Alta Gracia', 'Jesús María', 'San Francisco', 'Otra localidad',
];

export const NOMBRE_COMPONENTE: Record<string, string> = {
  GLOBULOS_ROJOS: 'Glóbulos rojos', PLAQUETAS: 'Plaquetas', PLASMA: 'Plasma',
};

export const NOMBRE_ROL: Record<string, string> = {
  DONANTE: 'Donante', MEDICO: 'Profesional médico', ADMINISTRATIVO: 'Administración',
  RESPONSABLE_INVENTARIO: 'Responsable de inventario', ADMINISTRADOR: 'Dirección',
};

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
