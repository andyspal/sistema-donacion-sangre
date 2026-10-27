import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base de datos y clave en un directorio temporal; sin SMTP real (los correos quedan como .eml).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hemored-test-'));
delete process.env.SMTP_HOST;
const { ejecutar } = await import('../src/db.ts');
const { registrarConsentimiento } = await import('../src/services/donantes.ts');
const { guardarCuestionario } = await import('../src/services/cuestionario.ts');
const { generarOrientacion } = await import('../src/services/orientacion.ts');
const { habilitacionParaTurnos } = await import('../src/services/habilitacion.ts');
const { reservarTurno } = await import('../src/services/turnos.ts');
const { ErrorHttp, ahoraIso, fechaLocal, sumarDias, sumarMeses } = await import('../src/util.ts');

const hoy = fechaLocal();
const idCentro = ejecutar(`INSERT INTO centro_hemoterapia (nombre, domicilio, localidad, activo) VALUES ('Centro de prueba', 'Calle 1', 'Córdoba', 1)`).id;
const franja = (dias: number) => ejecutar('INSERT INTO agenda_turno (id_centro, inicio, fin, cupo_maximo, activa) VALUES (?, ?, ?, 5, 1)',
  [idCentro, `${sumarDias(hoy, dias)}T09:00`, `${sumarDias(hoy, dias)}T09:30`]).id;
const pronto = franja(3);
const enUnAnio = franja(400);

const sinCausales = {
  peso_kg: 68, se_siente_bien: true, infeccion_reciente: false, tatuaje: false, cirugia: false,
  transfusion: false, viaje_endemico: false, practicas_riesgo: false, odontologia: false,
  medicacion: ['ninguna'], antecedentes: ['ninguna'], embarazo: 'no',
};

let secuencia = 0;
async function donante(respuestas: Record<string, unknown> | null, { orientar = true } = {}) {
  secuencia++;
  const idUsuario = ejecutar('INSERT INTO usuario (email, hash_contrasena, activo, creado_en) VALUES (?, ?, 1, ?)',
    [`turnos${secuencia}@prueba.test`, 'x', ahoraIso()]).id;
  const id = ejecutar(
    `INSERT INTO donante (id_usuario, dni, nombres, apellidos, fecha_nacimiento, sexo_biologico, telefono, localidad, creado_en)
     VALUES (?, ?, 'Prueba', 'Turnos', '1990-01-01', 'F', '351 000 0000', 'Córdoba', ?)`, [idUsuario, `5000000${secuencia}`, ahoraIso()]).id;
  registrarConsentimiento(id, 'DATOS_SALUD', true);
  if (respuestas) guardarCuestionario(id, { ...sinCausales, ...respuestas }, 'F');
  if (respuestas && orientar) await generarOrientacion(id);
  return { id, idUsuario };
}

const rechazo = (fn: () => unknown, codigo: string) =>
  assert.throws(fn, (e: unknown) => e instanceof ErrorHttp && e.codigo === codigo);

test('Turnos: sin orientación previa no se puede reservar', async () => {
  const d = await donante(null);
  assert.equal(habilitacionParaTurnos(d.id, 'F').bloqueo?.codigo, 'SIN_ORIENTACION');
  rechazo(() => reservarTurno(d.idUsuario, d.id, pronto), 'SIN_ORIENTACION');
});

test('Turnos: un viaje a zona con paludismo bloquea hasta 12 meses después del regreso', async () => {
  const regreso = sumarDias(hoy, -30);
  const d = await donante({ viaje_endemico: true, viaje_fecha: regreso });
  const h = habilitacionParaTurnos(d.id, 'F');
  assert.equal(h.bloqueo, null);
  assert.equal(h.desde, sumarMeses(regreso, 12));
  assert.match(h.motivo!, /paludismo/);
  rechazo(() => reservarTurno(d.idUsuario, d.id, pronto), 'NO_HABILITADO');
  assert.equal(reservarTurno(d.idUsuario, d.id, enUnAnio).estado, 'RESERVADO');
});

test('Turnos: un diferimiento sin fecha (malestar) bloquea hasta actualizar y volver a orientarse', async () => {
  const d = await donante({ se_siente_bien: false });
  assert.equal(habilitacionParaTurnos(d.id, 'F').bloqueo?.codigo, 'DIFERIDO_SIN_FECHA');
  rechazo(() => reservarTurno(d.idUsuario, d.id, enUnAnio), 'DIFERIDO_SIN_FECHA');

  // Cambia las respuestas pero no pide la orientación: sigue sin poder reservar.
  guardarCuestionario(d.id, sinCausales, 'F');
  assert.equal(habilitacionParaTurnos(d.id, 'F').bloqueo?.codigo, 'ORIENTACION_DESACTUALIZADA');
  await generarOrientacion(d.id);
  assert.equal(reservarTurno(d.idUsuario, d.id, pronto).estado, 'RESERVADO');
});

test('Turnos: con revisión médica se puede reservar (lo evalúa el profesional)', async () => {
  const d = await donante({ antecedentes: ['chagas'] });
  assert.deepEqual(habilitacionParaTurnos(d.id, 'F'), { desde: hoy, motivo: null, bloqueo: null });
  assert.equal(reservarTurno(d.idUsuario, d.id, pronto).estado, 'RESERVADO');
});

test('Turnos: un diferimiento con fecha cargado por el profesional se respeta', async () => {
  const d = await donante({});
  const idPersonal = ejecutar(`INSERT INTO personal (id_usuario, id_centro, nombres, apellidos, rol, activo) VALUES (?, ?, 'Carla', 'Médica', 'MEDICO', 1)`,
    [d.idUsuario, idCentro]).id;
  ejecutar(`INSERT INTO evaluacion_presencial (id_donante, id_centro, id_personal, resultado, fecha_habilitacion, evaluada_en) VALUES (?, ?, ?, 'DIFERIDO', ?, ?)`,
    [d.id, idCentro, idPersonal, sumarDias(hoy, 20), ahoraIso()]);
  assert.equal(habilitacionParaTurnos(d.id, 'F').desde, sumarDias(hoy, 20));
  rechazo(() => reservarTurno(d.idUsuario, d.id, pronto), 'NO_HABILITADO');
});
