import fs from 'node:fs';
import path from 'node:path';
import { DIR_CONFIG } from '../config.ts';

/**
 * Lee archivos de configuración JSON y los vuelve a cargar cuando cambian en
 * disco. Así los criterios de orientación se actualizan sin reiniciar ni
 * modificar otros módulos (RNF11).
 */
const cache = new Map<string, { mtime: number; valor: unknown }>();

export function leerConfig<T>(archivo: string): T {
  const ruta = path.join(DIR_CONFIG, archivo);
  const mtime = fs.statSync(ruta).mtimeMs;
  const previo = cache.get(ruta);
  if (previo && previo.mtime === mtime) return previo.valor as T;
  const valor = JSON.parse(fs.readFileSync(ruta, 'utf8')) as T;
  cache.set(ruta, { mtime, valor });
  return valor;
}

// ---- Cuestionario ----

export interface Opcion { valor: string; texto: string }
export interface Pregunta {
  id: string;
  tipo: 'si_no' | 'numero' | 'fecha' | 'opcion' | 'multiple';
  texto: string;
  ayuda?: string;
  unidad?: string;
  min?: number;
  max?: number;
  opciones?: Opcion[];
  exclusiva?: string;
  noFutura?: boolean;
  soloSexo?: 'M' | 'F';
  mostrarSi?: { pregunta: string; igual: unknown };
}
export interface DefinicionCuestionario {
  version: string;
  titulo: string;
  descripcion: string;
  secciones: { id: string; titulo: string; preguntas: Pregunta[] }[];
}

export const definicionCuestionario = () => leerConfig<DefinicionCuestionario>('cuestionario.json');

// ---- Reglas ----

export type Resultado = 'FAVORABLE' | 'DIFERIMIENTO_TEMPORAL' | 'REVISION_MEDICA';
export type Duracion = { dias?: number; meses?: number };
export type Condicion =
  | { hecho: string; op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'incluye' | 'incluye_alguno' | 'hace_menos_de' | 'existe'; valor?: unknown }
  | { todas: Condicion[] }
  | { alguna: Condicion[] }
  | { no: Condicion };

export interface Regla {
  id: string;
  condicion: Condicion;
  resultado: 'DIFERIMIENTO_TEMPORAL' | 'REVISION_MEDICA' | 'AVISO';
  habilitacion?: { desde: string; sumar: Duracion };
  mensaje: string;
}
export interface ConfigReglas {
  version: string;
  descripcion: string;
  parametros: {
    intervalos: Record<'M' | 'F', { dias_minimos: number; maximo_anual: number }>;
    ventana_anual_dias: number;
    vigencia_estudios_meses: number;
  };
  reglas: Regla[];
}

export const configReglas = () => leerConfig<ConfigReglas>('reglas-orientacion.json');
