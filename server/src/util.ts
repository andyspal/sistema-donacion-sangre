/** Error de negocio con código HTTP, traducido a JSON por el manejador global. */
export class ErrorHttp extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalle?: unknown;

  constructor(estado: number, codigo: string, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export const ahoraIso = () => new Date().toISOString();

const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha local 'YYYY-MM-DD' (las agendas y fechas clínicas son de calendario local). */
export function fechaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Fecha y hora local 'YYYY-MM-DDTHH:MM'. */
export function fechaHoraLocal(d = new Date()): string {
  return `${fechaLocal(d)}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Interpreta 'YYYY-MM-DD' como medianoche local (evita corrimientos por UTC). */
export function parsearFecha(fecha: string): Date {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = parsearFecha(fecha);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

export function sumarMeses(fecha: string, meses: number): string {
  const d = parsearFecha(fecha);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return fechaLocal(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((parsearFecha(hasta).getTime() - parsearFecha(desde).getTime()) / 86_400_000);
}

export function edadEn(fechaNacimiento: string, fecha = fechaLocal()): number {
  const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
  const [a, m, d] = fecha.split('-').map(Number);
  return a - an - (m < mn || (m === mn && d < dn) ? 1 : 0);
}

export const esFecha = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parsearFecha(v).getTime());

export const maxFecha = (fechas: string[]) => fechas.reduce((a, b) => (b > a ? b : a));

/** Normaliza texto para comparar localidades (sin tildes ni mayúsculas). */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
