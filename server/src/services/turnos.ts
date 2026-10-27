import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import { URL_PUBLICA } from '../config.ts';
import { ErrorHttp, ahoraIso, fechaHoraLocal, fechaLocal, sumarDias } from '../util.ts';
import { obtenerDonante } from './donantes.ts';
import { verificarIntervalosDonante } from './intervalos.ts';
import { avisarEnSegundoPlano } from './mensajeria.ts';

/** Estados de turno que ocupan cupo. */
const OCUPAN_CUPO = `('RESERVADO','ASISTIO')`;

export interface Centro { id: number; nombre: string; domicilio: string; localidad: string; telefono: string | null }

export function listarCentros(): Centro[] {
  return todos<{ id_centro: number; nombre: string; domicilio: string; localidad: string; telefono: string | null }>(
    'SELECT * FROM centro_hemoterapia WHERE activo = 1 ORDER BY nombre',
  ).map((c) => ({ id: c.id_centro, nombre: c.nombre, domicilio: c.domicilio, localidad: c.localidad, telefono: c.telefono }));
}

/** RF11 — fechas y horarios con cupo disponible de un centro. */
export function consultarDisponibilidad(idCentro: number, dias = 21) {
  const centro = uno<{ id_centro: number }>('SELECT id_centro FROM centro_hemoterapia WHERE id_centro = ? AND activo = 1', [idCentro]);
  if (!centro) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El centro no existe.');
  const filas = todos<{ id_agenda_turno: number; inicio: string; fin: string; cupo_maximo: number; ocupados: number }>(
    `SELECT a.id_agenda_turno, a.inicio, a.fin, a.cupo_maximo,
            (SELECT COUNT(*) FROM turno t WHERE t.id_agenda_turno = a.id_agenda_turno AND t.estado IN ${OCUPAN_CUPO}) AS ocupados
     FROM agenda_turno a
     WHERE a.id_centro = ? AND a.activa = 1 AND a.inicio > ? AND a.inicio < ?
     ORDER BY a.inicio`,
    [idCentro, fechaHoraLocal(), sumarDias(fechaLocal(), dias + 1)],
  );
  const porFecha = new Map<string, { id: number; hora: string; fin: string; libres: number }[]>();
  for (const f of filas) {
    const fecha = f.inicio.slice(0, 10);
    if (!porFecha.has(fecha)) porFecha.set(fecha, []);
    porFecha.get(fecha)!.push({ id: f.id_agenda_turno, hora: f.inicio.slice(11), fin: f.fin.slice(11), libres: Math.max(0, f.cupo_maximo - f.ocupados) });
  }
  return [...porFecha].map(([fecha, horarios]) => ({
    fecha,
    libres: horarios.reduce((s, h) => s + h.libres, 0),
    horarios,
  }));
}

interface FilaTurno {
  id_turno: number;
  estado: string;
  reservado_en: string;
  inicio: string;
  fin: string;
  id_centro: number;
  centro: string;
  domicilio: string;
  localidad: string;
}

const SELECT_TURNO = `
  SELECT t.id_turno, t.estado, t.reservado_en, a.inicio, a.fin, c.id_centro, c.nombre AS centro, c.domicilio, c.localidad
  FROM turno t JOIN agenda_turno a ON a.id_agenda_turno = t.id_agenda_turno
  JOIN centro_hemoterapia c ON c.id_centro = a.id_centro`;

const vistaTurno = (t: FilaTurno) => ({
  id: t.id_turno,
  estado: t.estado,
  inicio: t.inicio,
  fin: t.fin,
  reservadoEn: t.reservado_en,
  centro: { id: t.id_centro, nombre: t.centro, domicilio: t.domicilio, localidad: t.localidad },
});

export function misTurnos(idDonante: number) {
  return todos<FilaTurno>(`${SELECT_TURNO} WHERE t.id_donante = ? ORDER BY a.inicio DESC`, [idDonante]).map(vistaTurno);
}

export function turnoActivo(idDonante: number) {
  const t = uno<FilaTurno>(
    `${SELECT_TURNO} WHERE t.id_donante = ? AND t.estado = 'RESERVADO' AND a.inicio > ? ORDER BY a.inicio LIMIT 1`,
    [idDonante, fechaHoraLocal()],
  );
  return t ? vistaTurno(t) : null;
}

export const formato = (inicio: string) => `${inicio.slice(8, 10)}/${inicio.slice(5, 7)} a las ${inicio.slice(11, 16)} h`;

/** CU02 — Reservar turno (RF12) con verificación del cupo dentro de una transacción (RNF08). */
export function reservarTurno(idUsuario: number, idDonante: number, idAgenda: number, idConvocatoria?: number) {
  const donante = obtenerDonante(idDonante)!;

  const turno = transaccion(() => {
    const franja = uno<{ id_agenda_turno: number; inicio: string; cupo_maximo: number; activa: number; id_centro: number }>(
      'SELECT * FROM agenda_turno WHERE id_agenda_turno = ?', [idAgenda],
    );
    if (!franja || !franja.activa) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El horario elegido no existe.');
    if (franja.inicio <= fechaHoraLocal()) throw new ErrorHttp(409, 'HORARIO_VENCIDO', 'El horario elegido ya pasó. Elegí otro.');

    const activo = turnoActivo(idDonante);
    if (activo) {
      throw new ErrorHttp(409, 'TURNO_ACTIVO',
        `Ya tenés un turno reservado para el ${formato(activo.inicio)}. Cancelalo si querés elegir otro.`);
    }

    // RF07: no se agenda antes de que se cumpla el intervalo entre donaciones.
    const intervalo = verificarIntervalosDonante(idDonante, donante.sexo_biologico, franja.inicio.slice(0, 10));
    if (!intervalo.cumplido) {
      throw new ErrorHttp(422, 'INTERVALO_NO_CUMPLIDO',
        `Por el intervalo entre donaciones podés reservar a partir del ${intervalo.fechaHabilitacion.split('-').reverse().join('/')}.`,
        { fechaHabilitacion: intervalo.fechaHabilitacion });
    }

    // Verificación del cupo dentro de la transacción (bloqueo de escritura tomado por BEGIN IMMEDIATE).
    const { ocupados } = uno<{ ocupados: number }>(
      `SELECT COUNT(*) AS ocupados FROM turno WHERE id_agenda_turno = ? AND estado IN ${OCUPAN_CUPO}`, [idAgenda],
    )!;
    if (ocupados >= franja.cupo_maximo) {
      throw new ErrorHttp(409, 'HORARIO_OCUPADO', 'Ese horario se ocupó recién. Elegí otro, por favor.');
    }

    const conv = idConvocatoria
      ? uno<{ id_convocatoria: number }>('SELECT id_convocatoria FROM convocatoria WHERE id_convocatoria = ?', [idConvocatoria])
      : undefined;
    const { id } = ejecutar(
      `INSERT INTO turno (id_donante, id_agenda_turno, estado, reservado_en, id_convocatoria) VALUES (?, ?, 'RESERVADO', ?, ?)`,
      [idDonante, idAgenda, ahoraIso(), conv?.id_convocatoria ?? null],
    );
    auditar(idUsuario, 'RESERVAR_TURNO', 'turno', id, { idAgenda, idConvocatoria: conv?.id_convocatoria });
    return uno<FilaTurno>(`${SELECT_TURNO} WHERE t.id_turno = ?`, [id])!;
  });

  // Confirmación asincrónica por el servicio de mensajería, sin datos clínicos (RNF03).
  // Si el donante desactivó los correos de turnos, el aviso queda solo en la PWA.
  const email = uno<{ email: string }>('SELECT email FROM usuario WHERE id_usuario = ?', [idUsuario])!.email;
  avisarEnSegundoPlano({
    idDonante,
    idTurno: turno.id_turno,
    tipo: 'CONFIRMACION_TURNO',
    canal: donante.correo_turnos ? 'EMAIL' : 'APP',
    destino: email,
    asunto: 'Tu turno para donar sangre está confirmado',
    cuerpo: `Te esperamos en ${turno.centro} (${turno.domicilio}, ${turno.localidad}) el ${formato(turno.inicio)}. ` +
      'Recordá llevar tu DNI, desayunar liviano e hidratarte bien.',
    enlace: `${URL_PUBLICA}/app/turnos`,
  });

  return vistaTurno(turno);
}

export function cancelarTurno(idUsuario: number, idDonante: number, idTurno: number) {
  const turno = transaccion(() => {
    const t = uno<FilaTurno & { id_donante: number }>(`${SELECT_TURNO.replace('SELECT', 'SELECT t.id_donante,')} WHERE t.id_turno = ?`, [idTurno]);
    if (!t || t.id_donante !== idDonante) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El turno no existe.');
    if (t.estado !== 'RESERVADO' || t.inicio <= fechaHoraLocal()) {
      throw new ErrorHttp(409, 'NO_CANCELABLE', 'Solo se pueden cancelar turnos reservados que todavía no ocurrieron.');
    }
    ejecutar(`UPDATE turno SET estado = 'CANCELADO' WHERE id_turno = ?`, [idTurno]);
    auditar(idUsuario, 'CANCELAR_TURNO', 'turno', idTurno);
    return t;
  });
  const email = uno<{ email: string }>('SELECT email FROM usuario WHERE id_usuario = ?', [idUsuario])!.email;
  avisarEnSegundoPlano({
    idDonante, idTurno, tipo: 'CANCELACION_TURNO', canal: obtenerDonante(idDonante)!.correo_turnos ? 'EMAIL' : 'APP', destino: email,
    asunto: 'Cancelaste tu turno',
    cuerpo: `Se canceló tu turno del ${formato(turno.inicio)} en ${turno.centro}. Podés reservar otro cuando quieras.`,
    enlace: `${URL_PUBLICA}/app/turnos`,
  });
}
