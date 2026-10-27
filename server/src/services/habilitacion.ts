import { uno } from '../db.ts';
import { fechaLocal } from '../util.ts';
import { ultimoCuestionario } from './cuestionario.ts';
import { verificarIntervalosDonante } from './intervalos.ts';
import { ultimaOrientacion } from './orientacion.ts';

export type CodigoBloqueo = 'SIN_ORIENTACION' | 'ORIENTACION_DESACTUALIZADA' | 'DIFERIDO_SIN_FECHA';

export interface Habilitacion {
  /** Primer día en que el donante puede tener un turno. */
  desde: string;
  /** Por qué no puede antes de esa fecha, sin la fecha (null si puede desde hoy). */
  motivo: string | null;
  /** Algo que tiene que resolver antes de poder reservar en cualquier fecha. */
  bloqueo: { codigo: CodigoBloqueo; mensaje: string } | null;
}

/**
 * Desde cuándo puede reservar un turno (CU02): combina el intervalo entre donaciones (RF07), los
 * diferimientos de la última orientación previa (RF08) y el de la última evaluación presencial.
 * Sin una orientación al día no se reserva: así no se esquiva un diferimiento sin completar el cuestionario.
 */
export function habilitacionParaTurnos(idDonante: number, sexo: 'M' | 'F', hoy = fechaLocal()): Habilitacion {
  const orientacion = ultimaOrientacion(idDonante);
  const desde = (fecha: string, motivo: string | null) => ({ desde: fecha, motivo, bloqueo: null });

  if (!orientacion) {
    return { ...desde(hoy, null), bloqueo: { codigo: 'SIN_ORIENTACION',
      mensaje: 'Antes de reservar completá el cuestionario de salud y pedí tu orientación previa: así evitás viajar en vano.' } };
  }
  const deCuestionario = uno<{ id_cuestionario: number }>('SELECT id_cuestionario FROM orientacion WHERE id_orientacion = ?', [orientacion.id])!;
  if (ultimoCuestionario(idDonante)?.id !== deCuestionario.id_cuestionario) {
    return { ...desde(hoy, null), bloqueo: { codigo: 'ORIENTACION_DESACTUALIZADA',
      mensaje: 'Actualizaste el cuestionario: pedí de nuevo tu orientación para poder reservar.' } };
  }

  const candidatas: { fecha: string; motivo: string }[] = [];
  const intervalo = verificarIntervalosDonante(idDonante, sexo, hoy);
  if (!intervalo.cumplido) {
    candidatas.push({ fecha: intervalo.fechaHabilitacion, motivo: 'Tiene que pasar el intervalo mínimo entre donaciones.' });
  }

  if (orientacion.resultado === 'DIFERIMIENTO_TEMPORAL') {
    // El intervalo se recalcula arriba con las donaciones de hoy; del resto se toman los plazos de la orientación.
    const temporales = orientacion.motivos.filter((m) => m.tipo === 'DIFERIMIENTO_TEMPORAL' && m.regla !== 'INTERVALO_DONACIONES');
    const sinFecha = temporales.filter((m) => !m.fechaHabilitacion);
    if (sinFecha.length) {
      return { ...desde(hoy, null), bloqueo: { codigo: 'DIFERIDO_SIN_FECHA',
        mensaje: `Tu última orientación indica esperar antes de donar: ${sinFecha.map((m) => m.mensaje).join(' ')} ` +
          'Cuando se resuelva, actualizá el cuestionario (o cargá un análisis nuevo) y pedí de nuevo tu orientación.' } };
    }
    for (const m of temporales) {
      candidatas.push({ fecha: m.fechaHabilitacion!, motivo: m.mensaje });
    }
  }

  // Si en el centro lo difirieron con fecha, se respeta hasta esa fecha.
  const evaluacion = uno<{ resultado: string; fecha_habilitacion: string | null }>(
    'SELECT resultado, fecha_habilitacion FROM evaluacion_presencial WHERE id_donante = ? ORDER BY evaluada_en DESC LIMIT 1', [idDonante],
  );
  if (evaluacion?.resultado === 'DIFERIDO' && evaluacion.fecha_habilitacion) {
    candidatas.push({ fecha: evaluacion.fecha_habilitacion, motivo: 'Así lo indicó el profesional del centro en tu última evaluación.' });
  }

  const limite = candidatas.filter((c) => c.fecha > hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return limite ? desde(limite.fecha, limite.motivo) : desde(hoy, null);
}
