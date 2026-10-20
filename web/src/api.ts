import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalle?: { errores?: Record<string, string>; camposFaltantes?: string[]; [k: string]: unknown };

  constructor(estado: number, codigo: string, mensaje: string, detalle?: ApiError['detalle']) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function api<T>(ruta: string, metodo: Metodo = 'GET', cuerpo?: unknown): Promise<T> {
  const esForm = cuerpo instanceof FormData;
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo && !esForm ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo === undefined ? undefined : esForm ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No pudimos conectarnos con el servidor. Revisá tu conexión.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const e = datos?.error;
    throw new ApiError(respuesta.status, e?.codigo ?? 'ERROR', e?.mensaje ?? 'Ocurrió un error inesperado.', e?.detalle);
  }
  return datos as T;
}

/** Carga datos de la API con estado de carga/error y función para recargar. */
export function useCarga<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [cargando, setCargando] = useState(!!ruta);

  const recargar = useCallback(async () => {
    if (!ruta) return;
    setCargando(true);
    try {
      setDatos(await api<T>(ruta));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setCargando(false);
    }
  }, [ruta]);

  // Al cambiar la ruta se descartan los datos anteriores para no mostrar información de otro recurso.
  useEffect(() => { setDatos(null); void recargar(); }, [recargar]);
  return { datos, error, cargando, recargar, setDatos };
}

// ---------------------------------------------------------------------------
// Tipos compartidos con la API
// ---------------------------------------------------------------------------

export type Rol = 'DONANTE' | 'MEDICO' | 'ADMINISTRATIVO' | 'RESPONSABLE_INVENTARIO' | 'ADMINISTRADOR';
export interface Usuario { idUsuario: number; email: string; rol: Rol; nombre: string; idDonante?: number; idCentro?: number }

export type ResultadoOrientacion = 'FAVORABLE' | 'DIFERIMIENTO_TEMPORAL' | 'REVISION_MEDICA';
export interface Motivo { regla: string; tipo: ResultadoOrientacion | 'AVISO'; mensaje: string; fechaHabilitacion?: string }
export interface Intervalo {
  cumplido: boolean; fechaHabilitacion: string; ultimaDonacion: string | null;
  donacionesUltimoAnio: number; maximoAnual: number; diasMinimos: number;
}
export interface Orientacion {
  id: number; resultado: ResultadoOrientacion; fechaHabilitacionEstimada: string | null; motorVersion: string;
  generadaEn: string; aviso: string; motivos: Motivo[]; intervalo: Intervalo;
  estudios: { id: number; nombreArchivo: string; estado: string; considerado: boolean }[];
}

export type Consentimientos = Record<'DATOS_SALUD' | 'CONVOCATORIAS', { otorgado: boolean; fecha: string | null }>;

export interface Turno {
  id: number; estado: string; inicio: string; fin: string; reservadoEn: string;
  centro: { id: number; nombre: string; domicilio: string; localidad: string };
}

export interface Resumen {
  nombre: string; grupo: string | null; consentimientos: Consentimientos;
  cuestionario: { declaradoEn: string; vigente: boolean } | null;
  estudios: { total: number; requierenRevision: number };
  orientacion: Orientacion | null; intervalo: Intervalo; turno: Turno | null;
  donaciones: number; avisosSinLeer: number;
}

export interface ParametrosClinicos {
  hemoglobina?: number; hematocrito?: number; plaquetas?: number; serologias?: Record<string, 'REACTIVO' | 'NO_REACTIVO'>;
}
export interface Estudio {
  id: number; nombreArchivo: string; tipoMime: string; fechaEstudio: string | null;
  estado: 'PENDIENTE' | 'PROCESADO' | 'REQUIERE_REVISION'; observacion: string | null;
  parametros: ParametrosClinicos | null; vigente: boolean; cargadoEn: string;
}

export interface Pregunta {
  id: string; tipo: 'si_no' | 'numero' | 'fecha' | 'opcion' | 'multiple'; texto: string; ayuda?: string; unidad?: string;
  min?: number; max?: number; opciones?: { valor: string; texto: string }[]; exclusiva?: string; noFutura?: boolean;
  mostrarSi?: { pregunta: string; igual: unknown };
}
export interface DefinicionCuestionario {
  version: string; titulo: string; descripcion: string;
  secciones: { id: string; titulo: string; preguntas: Pregunta[] }[];
}

export interface Centro { id: number; nombre: string; domicilio: string; localidad: string; telefono: string | null }
export interface Donacion { id: number; fechaHora: string; volumenMl: number; centro: string; autoexclusionSolicitada?: boolean; autoexclusionEn?: string | null }
