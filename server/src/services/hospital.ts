import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import type { Rol, UsuarioSesion } from '../auth.ts';
import { cifrarJson, descifrarJson } from '../seguridad.ts';
import { ErrorHttp, ahoraIso, edadEn, esFecha, fechaHoraLocal, fechaLocal } from '../util.ts';
import { consentimientos, obtenerDonante, perfilPublico } from './donantes.ts';
import { ultimoCuestionario } from './cuestionario.ts';
import { listarEstudios } from './procesadorEstudios.ts';
import { listarOrientaciones } from './orientacion.ts';
import { verificarIntervalosDonante } from './intervalos.ts';
import { donacionesDelDonante } from './autoexclusion.ts';

// ---------------------------------------------------------------------------
// Búsqueda de postulantes y legajo (RF15, CU03)
// ---------------------------------------------------------------------------

export function buscarPostulantes(criterio: string) {
  const q = criterio.trim();
  if (q.length < 2) throw new ErrorHttp(422, 'CRITERIO_CORTO', 'Ingresá al menos 2 caracteres o el DNI.');
  const filas = todos<{ id_donante: number; dni: string; nombres: string; apellidos: string; grupo_abo: string | null; factor_rh: string | null; localidad: string; resultado: string | null }>(
    `SELECT d.id_donante, d.dni, d.nombres, d.apellidos, d.grupo_abo, d.factor_rh, d.localidad,
            (SELECT o.resultado FROM orientacion o WHERE o.id_donante = d.id_donante ORDER BY o.id_orientacion DESC LIMIT 1) AS resultado
     FROM donante d
     WHERE d.dni = ? OR (d.nombres || ' ' || d.apellidos) LIKE ? OR (d.apellidos || ' ' || d.nombres) LIKE ?
     ORDER BY d.apellidos LIMIT 25`,
    [q.replace(/\D/g, '') || q, `%${q}%`, `%${q}%`],
  );
  return filas.map((f) => ({
    id: f.id_donante, dni: f.dni, nombre: `${f.apellidos}, ${f.nombres}`,
    grupo: f.grupo_abo && f.factor_rh ? `${f.grupo_abo}${f.factor_rh}` : null,
    localidad: f.localidad, ultimaOrientacion: f.resultado,
  }));
}

const ROLES_CLINICOS: Rol[] = ['MEDICO', 'ADMINISTRADOR'];

/** Legajo del postulante filtrado según el rol (RNF02): solo el personal clínico ve datos de salud. */
export function legajo(idDonante: number, usuario: UsuarioSesion) {
  const d = obtenerDonante(idDonante);
  if (!d) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El postulante no existe.');
  const email = uno<{ email: string }>('SELECT email FROM usuario WHERE id_usuario = ?', [d.id_usuario])!.email;
  const clinico = ROLES_CLINICOS.includes(usuario.rol);
  const orientaciones = listarOrientaciones(idDonante, 5);

  const evaluaciones = todos<{ id_evaluacion_presencial: number; resultado: string; fecha_habilitacion: string | null; observacion_cifrada: string | null; evaluada_en: string; centro: string; profesional: string; id_donacion: number | null }>(
    `SELECT e.*, c.nombre AS centro, p.apellidos || ', ' || p.nombres AS profesional,
            (SELECT id_donacion FROM donacion WHERE id_evaluacion_presencial = e.id_evaluacion_presencial) AS id_donacion
     FROM evaluacion_presencial e JOIN centro_hemoterapia c ON c.id_centro = e.id_centro
     JOIN personal p ON p.id_personal = e.id_personal
     WHERE e.id_donante = ? ORDER BY e.evaluada_en DESC`, [idDonante],
  ).map((e) => ({
    id: e.id_evaluacion_presencial, resultado: e.resultado, fechaHabilitacion: e.fecha_habilitacion,
    evaluadaEn: e.evaluada_en, centro: e.centro, profesional: e.profesional, idDonacion: e.id_donacion,
    observacion: clinico && e.observacion_cifrada ? descifrarJson<string>(e.observacion_cifrada) : undefined,
  }));

  const turnos = todos<{ id_turno: number; estado: string; inicio: string; centro: string; id_centro: number }>(
    `SELECT t.id_turno, t.estado, a.inicio, c.nombre AS centro, c.id_centro FROM turno t
     JOIN agenda_turno a ON a.id_agenda_turno = t.id_agenda_turno JOIN centro_hemoterapia c ON c.id_centro = a.id_centro
     WHERE t.id_donante = ? ORDER BY a.inicio DESC LIMIT 10`, [idDonante],
  ).map((t) => ({ id: t.id_turno, estado: t.estado, inicio: t.inicio, centro: t.centro, idCentro: t.id_centro }));

  const cuestionario = clinico ? ultimoCuestionario(idDonante) : undefined;
  auditar(usuario.idUsuario, 'CONSULTAR_LEGAJO', 'donante', idDonante);

  return {
    alcance: clinico ? 'COMPLETO' : 'ADMINISTRATIVO',
    perfil: { ...perfilPublico(d, email), edad: edadEn(d.fecha_nacimiento) },
    consentimientos: consentimientos(idDonante),
    intervalo: verificarIntervalosDonante(idDonante, d.sexo_biologico),
    orientaciones: orientaciones.map((o) => clinico ? o : {
      id: o.id, resultado: o.resultado, fechaHabilitacionEstimada: o.fechaHabilitacionEstimada, generadaEn: o.generadaEn,
    }),
    cuestionario,
    estudios: clinico ? listarEstudios(idDonante) : undefined,
    evaluaciones,
    donaciones: donacionesDelDonante(idDonante).map(({ autoexclusionSolicitada: _a, autoexclusionEn: _b, ...resto }) => resto),
    turnos,
  };
}

export function descargarEstudioPermitido(usuario: UsuarioSesion) {
  if (!ROLES_CLINICOS.includes(usuario.rol)) throw new ErrorHttp(403, 'SIN_PERMISO', 'Solo el personal clínico puede ver estudios.');
}

// ---------------------------------------------------------------------------
// CU03 — Registrar evaluación médica (RF16)
// ---------------------------------------------------------------------------

export function registrarEvaluacion(
  usuario: UsuarioSesion & { idPersonal: number; idCentro: number },
  idDonante: number,
  datos: { resultado?: string; motivo?: string; fechaHabilitacion?: string; idTurno?: number },
) {
  const errores: Record<string, string> = {};
  if (datos.resultado !== 'APTO' && datos.resultado !== 'DIFERIDO') errores.resultado = 'Indicá APTO o DIFERIDO';
  if (datos.resultado === 'DIFERIDO' && !datos.motivo?.trim()) errores.motivo = 'El motivo del diferimiento es obligatorio';
  if (datos.fechaHabilitacion && (!esFecha(datos.fechaHabilitacion) || datos.fechaHabilitacion <= fechaLocal())) {
    errores.fechaHabilitacion = 'La fecha de habilitación debe ser futura';
  }
  if (Object.keys(errores).length) throw new ErrorHttp(422, 'VALIDACION', 'Revisá los datos de la evaluación.', { errores });
  if (!obtenerDonante(idDonante)) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El postulante no existe.');

  return transaccion(() => {
    let idTurno: number | null = null;
    if (datos.idTurno) {
      const t = uno<{ id_donante: number; estado: string }>('SELECT id_donante, estado FROM turno WHERE id_turno = ?', [datos.idTurno]);
      if (!t || t.id_donante !== idDonante) throw new ErrorHttp(422, 'VALIDACION', 'El turno no corresponde al postulante.');
      if (uno('SELECT 1 FROM evaluacion_presencial WHERE id_turno = ?', [datos.idTurno])) {
        throw new ErrorHttp(409, 'DUPLICADO', 'Ese turno ya tiene una evaluación registrada.');
      }
      idTurno = datos.idTurno;
      ejecutar(`UPDATE turno SET estado = 'ASISTIO' WHERE id_turno = ?`, [idTurno]);
    }
    const { id } = ejecutar(
      `INSERT INTO evaluacion_presencial (id_donante, id_centro, id_personal, id_turno, resultado, fecha_habilitacion, observacion_cifrada, evaluada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idDonante, usuario.idCentro, usuario.idPersonal, idTurno, datos.resultado!,
        datos.resultado === 'DIFERIDO' ? datos.fechaHabilitacion || null : null,
        datos.motivo?.trim() ? cifrarJson(datos.motivo.trim()) : null, ahoraIso()],
    );
    auditar(usuario.idUsuario, 'REGISTRAR_EVALUACION', 'evaluacion_presencial', id, { resultado: datos.resultado });
    return { id };
  });
}

// ---------------------------------------------------------------------------
// RF17 — Registrar donación realizada
// ---------------------------------------------------------------------------

export function registrarDonacion(
  usuario: UsuarioSesion & { idCentro: number },
  idDonante: number,
  datos: { idEvaluacion?: number; volumenMl?: number; grupoAbo?: string; factorRh?: string },
) {
  const volumen = Number(datos.volumenMl);
  if (!Number.isInteger(volumen) || volumen < 200 || volumen > 600) {
    throw new ErrorHttp(422, 'VALIDACION', 'El volumen debe estar entre 200 y 600 ml.', { errores: { volumenMl: 'Entre 200 y 600 ml' } });
  }
  if ((datos.grupoAbo || datos.factorRh) && (!['A', 'B', 'AB', 'O'].includes(datos.grupoAbo ?? '') || !['+', '-'].includes(datos.factorRh ?? ''))) {
    throw new ErrorHttp(422, 'VALIDACION', 'Grupo o factor inválido.');
  }
  return transaccion(() => {
    const ev = uno<{ id_donante: number; resultado: string; id_turno: number | null }>(
      'SELECT id_donante, resultado, id_turno FROM evaluacion_presencial WHERE id_evaluacion_presencial = ?', [datos.idEvaluacion ?? 0],
    );
    if (!ev || ev.id_donante !== idDonante) throw new ErrorHttp(422, 'VALIDACION', 'Seleccioná la evaluación presencial del postulante.');
    if (ev.resultado !== 'APTO') throw new ErrorHttp(409, 'NO_APTO', 'Solo se registran donaciones con evaluación APTO.');
    if (uno('SELECT 1 FROM donacion WHERE id_evaluacion_presencial = ?', [datos.idEvaluacion!])) {
      throw new ErrorHttp(409, 'DUPLICADO', 'Esa evaluación ya tiene una donación registrada.');
    }
    const { id } = ejecutar(
      `INSERT INTO donacion (id_donante, id_centro, id_evaluacion_presencial, fecha_hora, volumen_ml, registrada_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [idDonante, usuario.idCentro, datos.idEvaluacion!, fechaHoraLocal(), volumen, ahoraIso()],
    );
    if (datos.grupoAbo && datos.factorRh) {
      ejecutar('UPDATE donante SET grupo_abo = ?, factor_rh = ? WHERE id_donante = ?', [datos.grupoAbo, datos.factorRh, idDonante]);
    }
    auditar(usuario.idUsuario, 'REGISTRAR_DONACION', 'donacion', id, { volumen });
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Agenda del centro (turnos del día) y administración de franjas (RF13)
// ---------------------------------------------------------------------------

export function agendaDelDia(idCentro: number, fecha: string) {
  if (!esFecha(fecha)) throw new ErrorHttp(422, 'VALIDACION', 'Fecha inválida.');
  return todos<{ id_agenda_turno: number; inicio: string; fin: string; cupo_maximo: number }>(
    'SELECT * FROM agenda_turno WHERE id_centro = ? AND activa = 1 AND substr(inicio, 1, 10) = ? ORDER BY inicio', [idCentro, fecha],
  ).map((a) => ({
    id: a.id_agenda_turno, inicio: a.inicio, fin: a.fin, cupoMaximo: a.cupo_maximo,
    turnos: todos<{ id_turno: number; estado: string; id_donante: number; dni: string; nombres: string; apellidos: string; resultado: string | null }>(
      `SELECT t.id_turno, t.estado, d.id_donante, d.dni, d.nombres, d.apellidos,
              (SELECT o.resultado FROM orientacion o WHERE o.id_donante = d.id_donante ORDER BY o.id_orientacion DESC LIMIT 1) AS resultado
       FROM turno t JOIN donante d ON d.id_donante = t.id_donante
       WHERE t.id_agenda_turno = ? AND t.estado <> 'CANCELADO' ORDER BY t.id_turno`, [a.id_agenda_turno],
    ).map((t) => ({ id: t.id_turno, estado: t.estado, idDonante: t.id_donante, dni: t.dni, nombre: `${t.apellidos}, ${t.nombres}`, ultimaOrientacion: t.resultado })),
  }));
}

export function generarFranjas(
  usuario: UsuarioSesion & { idCentro: number },
  datos: { desde?: string; hasta?: string; horaInicio?: string; horaFin?: string; duracionMin?: number; cupo?: number; diasSemana?: number[] },
) {
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  const duracion = Number(datos.duracionMin);
  const cupo = Number(datos.cupo);
  if (!esFecha(datos.desde) || !esFecha(datos.hasta) || datos.hasta < datos.desde || datos.desde < fechaLocal()
    || !hora.test(datos.horaInicio ?? '') || !hora.test(datos.horaFin ?? '') || datos.horaFin! <= datos.horaInicio!
    || !Number.isInteger(duracion) || duracion < 10 || duracion > 240 || !Number.isInteger(cupo) || cupo < 1 || cupo > 50
    || !Array.isArray(datos.diasSemana) || !datos.diasSemana.length) {
    throw new ErrorHttp(422, 'VALIDACION', 'Revisá el rango de fechas, horarios, duración (10–240 min) y cupo (1–50).');
  }
  return transaccion(() => {
    let creadas = 0;
    for (let f = new Date(`${datos.desde}T00:00`); ; f.setDate(f.getDate() + 1)) {
      const fecha = fechaLocal(f);
      if (fecha > datos.hasta!) break;
      if (!datos.diasSemana!.includes(f.getDay())) continue;
      const [hi, mi] = datos.horaInicio!.split(':').map(Number);
      const [hf, mf] = datos.horaFin!.split(':').map(Number);
      for (let m = hi * 60 + mi; m + duracion <= hf * 60 + mf; m += duracion) {
        const ini = `${fecha}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const fin = `${fecha}T${String(Math.floor((m + duracion) / 60)).padStart(2, '0')}:${String((m + duracion) % 60).padStart(2, '0')}`;
        creadas += ejecutar('INSERT OR IGNORE INTO agenda_turno (id_centro, inicio, fin, cupo_maximo) VALUES (?, ?, ?, ?)',
          [usuario.idCentro, ini, fin, cupo]).cambios;
      }
    }
    auditar(usuario.idUsuario, 'GENERAR_AGENDA', 'agenda_turno', null, datos);
    return { creadas };
  });
}

// ---------------------------------------------------------------------------
// Autoexclusiones (RF14): acceso restringido al personal clínico (RNF02)
// ---------------------------------------------------------------------------

export function listarAutoexclusiones(usuario: UsuarioSesion & { idCentro: number }) {
  auditar(usuario.idUsuario, 'CONSULTAR_AUTOEXCLUSIONES', 'autoexclusion', null);
  return todos<{ id_autoexclusion: number; codigo_acuse: string; confirmada_en: string; id_donacion: number; fecha_hora: string; dni: string; nombres: string; apellidos: string; grupo_abo: string | null; factor_rh: string | null }>(
    `SELECT ax.id_autoexclusion, ax.codigo_acuse, ax.confirmada_en, d.id_donacion, d.fecha_hora,
            dn.dni, dn.nombres, dn.apellidos, dn.grupo_abo, dn.factor_rh
     FROM autoexclusion ax JOIN donacion d ON d.id_donacion = ax.id_donacion JOIN donante dn ON dn.id_donante = d.id_donante
     WHERE d.id_centro = ? ORDER BY ax.confirmada_en DESC`, [usuario.idCentro],
  ).map((a) => ({
    id: a.id_autoexclusion, codigoAcuse: a.codigo_acuse, confirmadaEn: a.confirmada_en,
    donacion: { id: a.id_donacion, fechaHora: a.fecha_hora },
    donante: { dni: a.dni, nombre: `${a.apellidos}, ${a.nombres}`, grupo: a.grupo_abo && a.factor_rh ? `${a.grupo_abo}${a.factor_rh}` : null },
  }));
}
