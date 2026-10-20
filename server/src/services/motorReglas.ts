import type { Condicion, ConfigReglas, Duracion, Regla, Resultado } from './configuracion.ts';
import { esFecha, fechaLocal, sumarDias, sumarMeses } from '../util.ts';

export type Hechos = Record<string, unknown>;

export interface Motivo {
  regla: string;
  tipo: Regla['resultado'];
  mensaje: string;
  fechaHabilitacion?: string;
}

const GRAVEDAD: Record<Resultado, number> = { FAVORABLE: 0, DIFERIMIENTO_TEMPORAL: 1, REVISION_MEDICA: 2 };

function sumar(fecha: string, d: Duracion): string {
  let r = fecha;
  if (d.meses) r = sumarMeses(r, d.meses);
  if (d.dias) r = sumarDias(r, d.dias);
  return r;
}

/** Hechos con notación de punto: 'lab.hemoglobina' → hechos.lab.hemoglobina */
function valorDe(hechos: Hechos, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>(
    (acc, clave) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[clave] : undefined),
    hechos,
  );
}

export function cumple(c: Condicion, hechos: Hechos, hoy: string): boolean {
  if ('todas' in c) return c.todas.every((x) => cumple(x, hechos, hoy));
  if ('alguna' in c) return c.alguna.some((x) => cumple(x, hechos, hoy));
  if ('no' in c) return !cumple(c.no, hechos, hoy);

  const v = valorDe(hechos, c.hecho);
  if (c.op === 'existe') return v !== undefined && v !== null;
  // Un hecho ausente nunca dispara una regla: la información faltante se
  // controla antes (422) y los estudios no vigentes simplemente no aportan.
  if (v === undefined || v === null) return false;

  switch (c.op) {
    case '=': return v === c.valor;
    case '!=': return v !== c.valor;
    case '<': return typeof v === 'number' && v < (c.valor as number);
    case '<=': return typeof v === 'number' && v <= (c.valor as number);
    case '>': return typeof v === 'number' && v > (c.valor as number);
    case '>=': return typeof v === 'number' && v >= (c.valor as number);
    case 'incluye': return Array.isArray(v) && v.includes(c.valor);
    case 'incluye_alguno': return Array.isArray(v) && (c.valor as unknown[]).some((x) => v.includes(x));
    case 'hace_menos_de': return esFecha(v) && sumar(v, c.valor as Duracion) > hoy;
    default: return false;
  }
}

export interface Evaluacion {
  resultado: Resultado;
  motivos: Motivo[];
}

/**
 * Evalúa las reglas declarativas sobre los hechos del postulante (RF08).
 * El resultado es el de mayor gravedad entre las reglas disparadas; los
 * avisos informan sin cambiar el resultado.
 */
export function evaluar(config: ConfigReglas, hechos: Hechos, hoy = fechaLocal()): Evaluacion {
  const motivos: Motivo[] = [];
  let resultado: Resultado = 'FAVORABLE';

  for (const regla of config.reglas) {
    if (!cumple(regla.condicion, hechos, hoy)) continue;
    const motivo: Motivo = { regla: regla.id, tipo: regla.resultado, mensaje: regla.mensaje };
    if (regla.habilitacion) {
      const desde = valorDe(hechos, regla.habilitacion.desde);
      if (esFecha(desde)) motivo.fechaHabilitacion = sumar(desde, regla.habilitacion.sumar);
    }
    motivos.push(motivo);
    if (regla.resultado !== 'AVISO' && GRAVEDAD[regla.resultado] > GRAVEDAD[resultado]) resultado = regla.resultado;
  }
  return { resultado, motivos };
}
