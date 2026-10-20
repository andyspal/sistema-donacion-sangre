import { ejecutar, todos } from '../db.ts';
import { cifrarJson, descifrarJson } from '../seguridad.ts';
import { ErrorHttp, ahoraIso, edadEn, fechaLocal, maxFecha, sumarMeses } from '../util.ts';
import { configReglas, type Resultado } from './configuracion.ts';
import { consentimientos, obtenerDonante } from './donantes.ts';
import { ultimoCuestionario, validarRespuestas } from './cuestionario.ts';
import { listarEstudios, procesarPendientes, type ParametrosClinicos } from './procesadorEstudios.ts';
import { verificarIntervalosDonante, type VerificacionIntervalo } from './intervalos.ts';
import { evaluar, type Motivo } from './motorReglas.ts';

export const AVISO_LEGAL =
  'Este resultado es orientativo y no constituye una decisión médica. La aptitud para donar la determina el ' +
  'profesional del centro en la entrevista y el control presencial.';

interface Detalle {
  motivos: Motivo[];
  intervalo: VerificacionIntervalo;
  estudios: { id: number; nombreArchivo: string; estado: string; considerado: boolean }[];
}

export interface OrientacionVista extends Detalle {
  id: number;
  resultado: Resultado;
  fechaHabilitacionEstimada: string | null;
  motorVersion: string;
  generadaEn: string;
  aviso: string;
}

const GRAVEDAD: Record<Resultado, number> = { FAVORABLE: 0, DIFERIMIENTO_TEMPORAL: 1, REVISION_MEDICA: 2 };
const formatoFecha = (f: string) => f.split('-').reverse().join('/');

/** CU01 — Obtener orientación previa (RF04–RF09). */
export async function generarOrientacion(idDonante: number): Promise<OrientacionVista> {
  const donante = obtenerDonante(idDonante);
  if (!donante) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'Donante inexistente.');
  if (!consentimientos(idDonante).DATOS_SALUD.otorgado) {
    throw new ErrorHttp(422, 'DATOS_INCOMPLETOS', 'Para orientarte necesitamos tu consentimiento para tratar datos de salud.', {
      camposFaltantes: ['consentimiento_datos_salud'],
    });
  }

  const cuestionario = ultimoCuestionario(idDonante);
  if (!cuestionario || Object.keys(validarRespuestas(cuestionario.respuestas, donante.sexo_biologico).errores).length) {
    throw new ErrorHttp(422, 'DATOS_INCOMPLETOS',
      cuestionario ? 'El cuestionario cambió: actualizá tus respuestas.' : 'Completá el cuestionario de salud.',
      { camposFaltantes: ['cuestionario'] });
  }

  // RF06: interpretar estudios adjuntos que todavía no se procesaron.
  await procesarPendientes(idDonante);

  const config = configReglas();
  const hoy = fechaLocal();
  const limiteVigencia = sumarMeses(hoy, -config.parametros.vigencia_estudios_meses);
  const motivos: Motivo[] = [];
  const estudios: Detalle['estudios'] = [];

  // Hechos de laboratorio: para cada parámetro, el estudio vigente más reciente.
  const lab: Record<string, unknown> = {};
  const vistas = listarEstudios(idDonante).sort((a, b) => (b.fechaEstudio ?? '').localeCompare(a.fechaEstudio ?? ''));
  for (const e of vistas) {
    const vigente = !!e.fechaEstudio && e.fechaEstudio >= limiteVigencia;
    const considerado = e.estado === 'PROCESADO' && vigente;
    estudios.push({ id: e.id, nombreArchivo: e.nombreArchivo, estado: e.estado, considerado });
    if (e.estado === 'REQUIERE_REVISION') {
      motivos.push({ regla: 'ESTUDIO_REQUIERE_REVISION', tipo: 'AVISO',
        mensaje: `El estudio «${e.nombreArchivo}» no pudo interpretarse o validarse: lo revisará el personal del centro.` });
    } else if (e.estado === 'PROCESADO' && !vigente) {
      motivos.push({ regla: 'ESTUDIO_NO_VIGENTE', tipo: 'AVISO',
        mensaje: `El estudio «${e.nombreArchivo}» tiene más de ${config.parametros.vigencia_estudios_meses} meses y no se tuvo en cuenta.` });
    }
    if (!considerado || !e.parametros) continue;
    const p: ParametrosClinicos = e.parametros;
    for (const clave of ['hemoglobina', 'hematocrito', 'plaquetas'] as const) {
      if (p[clave] !== undefined && lab[clave] === undefined) lab[clave] = p[clave];
    }
    if (p.serologias && Object.values(p.serologias).includes('REACTIVO')) lab.serologia_reactiva = true;
  }

  // RF07: verificación determinística de intervalos.
  const intervalo = verificarIntervalosDonante(idDonante, donante.sexo_biologico, hoy);

  // RF08: motor de reglas sobre cuestionario + parámetros validados.
  const hechos = {
    ...cuestionario.respuestas,
    edad: edadEn(donante.fecha_nacimiento, hoy),
    sexo: donante.sexo_biologico,
    lab,
  };
  const evaluacion = evaluar(config, hechos, hoy);
  let resultado = evaluacion.resultado;
  motivos.unshift(...evaluacion.motivos);

  if (!intervalo.cumplido) {
    const porMaximo = intervalo.donacionesUltimoAnio >= intervalo.maximoAnual;
    motivos.unshift({
      regla: 'INTERVALO_DONACIONES',
      tipo: 'DIFERIMIENTO_TEMPORAL',
      mensaje: porMaximo
        ? `Alcanzaste el máximo de ${intervalo.maximoAnual} donaciones en 12 meses.`
        : `Desde tu última donación (${formatoFecha(intervalo.ultimaDonacion!)}) deben pasar al menos ${intervalo.diasMinimos / 7} semanas.`,
      fechaHabilitacion: intervalo.fechaHabilitacion,
    });
    if (GRAVEDAD.DIFERIMIENTO_TEMPORAL > GRAVEDAD[resultado]) resultado = 'DIFERIMIENTO_TEMPORAL';
  }

  // La fecha estimada solo se informa si todos los diferimientos tienen fecha calculable.
  let fechaHabilitacionEstimada: string | null = null;
  if (resultado === 'DIFERIMIENTO_TEMPORAL') {
    const temporales = motivos.filter((m) => m.tipo === 'DIFERIMIENTO_TEMPORAL');
    if (temporales.every((m) => m.fechaHabilitacion)) {
      fechaHabilitacionEstimada = maxFecha(temporales.map((m) => m.fechaHabilitacion!));
    }
  }

  const detalle: Detalle = { motivos, intervalo, estudios };
  const generadaEn = ahoraIso();
  const { id } = ejecutar(
    `INSERT INTO orientacion (id_donante, id_cuestionario, resultado, fecha_habilitacion_estimada, motor_version, detalle_cifrado, generada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [idDonante, cuestionario.id, resultado, fechaHabilitacionEstimada, config.version, cifrarJson(detalle), generadaEn],
  );

  return { id, resultado, fechaHabilitacionEstimada, motorVersion: config.version, generadaEn, aviso: AVISO_LEGAL, ...detalle };
}

interface FilaOrientacion {
  id_orientacion: number;
  resultado: Resultado;
  fecha_habilitacion_estimada: string | null;
  motor_version: string;
  detalle_cifrado: string;
  generada_en: string;
}

const aVista = (f: FilaOrientacion): OrientacionVista => ({
  id: f.id_orientacion,
  resultado: f.resultado,
  fechaHabilitacionEstimada: f.fecha_habilitacion_estimada,
  motorVersion: f.motor_version,
  generadaEn: f.generada_en,
  aviso: AVISO_LEGAL,
  ...descifrarJson<Detalle>(f.detalle_cifrado),
});

export function listarOrientaciones(idDonante: number, limite = 10): OrientacionVista[] {
  return todos<FilaOrientacion>(
    'SELECT * FROM orientacion WHERE id_donante = ? ORDER BY id_orientacion DESC LIMIT ?', [idDonante, limite],
  ).map(aVista);
}

export const ultimaOrientacion = (idDonante: number) => listarOrientaciones(idDonante, 1)[0];
