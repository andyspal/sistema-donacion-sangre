import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base de datos y clave en un directorio temporal; sin SMTP real.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hemored-test-'));
delete process.env.SMTP_HOST;
const { ejecutar } = await import('../src/db.ts');
const { registrarConsentimiento } = await import('../src/services/donantes.ts');
const estudios = await import('../src/services/procesadorEstudios.ts');
const { generarEstudioEjemplo } = await import('../src/estudioEjemplo.ts');
const { turnosPorRecordar } = await import('../src/services/recordatorios.ts');
const { plantilla } = await import('../src/services/correo.ts');
const { ErrorHttp, ahoraIso, fechaHoraLocal, fechaLocal, sumarDias } = await import('../src/util.ts');

const hoy = fechaLocal();
const DNI = '30111222';

let secuencia = 0;
function crearDonante() {
  secuencia++;
  const idUsuario = ejecutar('INSERT INTO usuario (email, hash_contrasena, activo, creado_en) VALUES (?, ?, 1, ?)',
    [`donante${secuencia}@prueba.test`, 'x', ahoraIso()]).id;
  const id = ejecutar(
    `INSERT INTO donante (id_usuario, dni, nombres, apellidos, fecha_nacimiento, sexo_biologico, telefono, localidad, creado_en)
     VALUES (?, ?, 'Prueba', 'Donante', '1990-01-01', 'F', '351 000 0000', 'Córdoba', ?)`,
    [idUsuario, secuencia === 1 ? DNI : `4000000${secuencia}`, ahoraIso()],
  ).id;
  registrarConsentimiento(id, 'DATOS_SALUD', true);
  return id;
}

function pdf(dni: string, fecha: string) {
  const ruta = path.join(process.env.DATA_DIR!, `informe-${dni}-${fecha}-${secuencia}.pdf`);
  generarEstudioEjemplo(ruta, { paciente: 'PRUEBA DONANTE', dni, fecha });
  return fs.readFileSync(ruta);
}

async function cargar(idDonante: number, buffer: Buffer, tipo = 'application/pdf', fechaDeclarada?: string) {
  const id = estudios.guardarEstudio(idDonante, { originalname: 'analisis', mimetype: tipo, buffer }, fechaDeclarada);
  await estudios.procesarEstudio(id);
  return estudios.listarEstudios(idDonante).find((e) => e.id === id)!;
}

const donante = crearDonante(); // DNI 30111222, el de los PDF de prueba

test('Estudio vencido: se detiene el análisis y no se usa para orientar', async () => {
  const e = await cargar(donante, pdf(DNI, sumarDias(hoy, -240)));
  assert.equal(e.estado, 'DETENIDO');
  assert.equal(e.motivoDetencion, 'VENCIDO');
  assert.equal(e.metodo, 'NINGUNO');
  assert.equal(e.parametros, null);
  assert.equal(e.vigente, false);
});

test('Foto con fecha declarada vencida: se detiene sin abrir el archivo', async () => {
  const e = await cargar(donante, Buffer.from('foto-vencida'), 'image/png', sumarDias(hoy, -300));
  assert.equal(e.estado, 'DETENIDO');
  assert.equal(e.motivoDetencion, 'VENCIDO');
});

test('Las fotos exigen la fecha del estudio para poder verificar la vigencia', () => {
  assert.throws(() => estudios.guardarEstudio(donante, { originalname: 'foto', mimetype: 'image/jpeg', buffer: Buffer.from('x') }),
    (e: unknown) => e instanceof ErrorHttp && e.estado === 422);
});

test('DNI de otra persona: se detiene el análisis', async () => {
  const e = await cargar(donante, pdf('27999888', sumarDias(hoy, -10)));
  assert.equal(e.estado, 'DETENIDO');
  assert.equal(e.motivoDetencion, 'DNI_NO_COINCIDE');
});

test('Estudio vigente: se interpreta con el lector de texto del PDF', async () => {
  const e = await cargar(donante, pdf(DNI, sumarDias(hoy, -20)));
  assert.equal(e.estado, 'PROCESADO');
  assert.equal(e.metodo, 'TEXTO');
  assert.equal(e.parametros?.hemoglobina, 13.6);
  assert.equal(e.vigente, true);
});

test('El mismo archivo no se puede cargar dos veces', () => {
  const buffer = pdf(DNI, sumarDias(hoy, -30));
  estudios.guardarEstudio(donante, { originalname: 'a.pdf', mimetype: 'application/pdf', buffer });
  assert.throws(() => estudios.guardarEstudio(donante, { originalname: 'b.pdf', mimetype: 'application/pdf', buffer }),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 'ESTUDIO_DUPLICADO');
});

test('Recordatorio de turno: solo dentro de la anticipación elegida y si se reservó antes', () => {
  const idCentro = ejecutar(`INSERT INTO centro_hemoterapia (nombre, domicilio, localidad) VALUES ('Centro', 'Calle 1', 'Córdoba')`).id;
  const ahora = new Date();
  const enHoras = (h: number) => fechaHoraLocal(new Date(ahora.getTime() + h * 3_600_000));
  const turno = (inicioEn: number, reservadoHaceHoras: number) => {
    const idAgenda = ejecutar('INSERT INTO agenda_turno (id_centro, inicio, fin, cupo_maximo) VALUES (?, ?, ?, 3)',
      [idCentro, enHoras(inicioEn), enHoras(inicioEn + 0.5)]).id;
    return ejecutar(`INSERT INTO turno (id_donante, id_agenda_turno, estado, reservado_en) VALUES (?, ?, 'RESERVADO', ?)`,
      [donante, idAgenda, new Date(ahora.getTime() - reservadoHaceHoras * 3_600_000).toISOString()]).id;
  };
  const correspondeYa = turno(20, 72);   // empieza en 20 h, reservado hace 3 días
  turno(30, 72);                          // todavía fuera de las 24 h
  turno(10, 1);                           // reservado dentro de la ventana: la confirmación alcanza
  assert.deepEqual(turnosPorRecordar(ahora).map((t) => t.id_turno), [correspondeYa]);

  ejecutar('UPDATE donante SET recordatorio_horas = 0 WHERE id_donante = ?', [donante]);
  assert.equal(turnosPorRecordar(ahora).length, 0);
});

test('Plantilla de correo: escapa el contenido y lleva el enlace', () => {
  const { html, text } = plantilla({ para: 'a@b.test', asunto: 'Turno <confirmado>', cuerpo: 'Hola & chau', enlace: 'http://x/app', accion: 'Ver' });
  assert.match(html, /Turno &lt;confirmado&gt;/);
  assert.match(html, /Hola &amp; chau/);
  assert.match(html, /href="http:\/\/x\/app"/);
  assert.match(text, /Ver: http:\/\/x\/app/);
});
