import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base de datos y clave en un directorio temporal: las pruebas no tocan data/.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hemored-test-'));
const { verificarIntervalos } = await import('../src/services/intervalos.ts');
const { evaluar } = await import('../src/services/motorReglas.ts');
const { configReglas } = await import('../src/services/configuracion.ts');
const { interpretarTexto } = await import('../src/services/procesadorEstudios.ts');
const { cifrar, descifrar } = await import('../src/seguridad.ts');

const HOY = '2026-10-20';

test('RF07: intervalo mínimo de 8 semanas (M) y 12 semanas (F)', () => {
  const m = verificarIntervalos(['2026-09-01'], 'M', HOY);
  assert.equal(m.cumplido, false);
  assert.equal(m.fechaHabilitacion, '2026-10-27'); // 56 días

  const f = verificarIntervalos(['2026-08-01'], 'F', HOY);
  assert.equal(f.cumplido, false);
  assert.equal(f.fechaHabilitacion, '2026-10-24'); // 84 días

  assert.equal(verificarIntervalos([], 'F', HOY).cumplido, true);
});

test('RF07: máximo anual de 3 donaciones (F) en ventana móvil de 365 días', () => {
  const r = verificarIntervalos(['2025-12-01', '2026-03-01', '2026-06-01'], 'F', HOY);
  assert.equal(r.donacionesUltimoAnio, 3);
  assert.equal(r.cumplido, false);
  // Recién cuando la del 01/12/2025 sale de la ventana.
  assert.equal(r.fechaHabilitacion, '2026-12-01');
});

test('RF08: tatuaje reciente → diferimiento temporal con fecha calculada', () => {
  const r = evaluar(configReglas(), { tatuaje: true, tatuaje_fecha: '2026-07-15', edad: 30, sexo: 'F' }, HOY);
  assert.equal(r.resultado, 'DIFERIMIENTO_TEMPORAL');
  assert.equal(r.motivos[0].fechaHabilitacion, '2027-07-15');
});

test('RF08: los avisos no cambian el resultado y la revisión médica prevalece', () => {
  const soloAviso = evaluar(configReglas(), { medicacion: ['aspirina'], edad: 30, sexo: 'M' }, HOY);
  assert.equal(soloAviso.resultado, 'FAVORABLE');
  assert.equal(soloAviso.motivos.length, 1);

  const mixto = evaluar(configReglas(), { tatuaje_fecha: '2026-07-15', antecedentes: ['chagas'], edad: 30, sexo: 'M' }, HOY);
  assert.equal(mixto.resultado, 'REVISION_MEDICA');
});

test('RF08: un hecho ausente no dispara reglas (estudios no vigentes)', () => {
  const r = evaluar(configReglas(), { edad: 30, sexo: 'F', lab: {} }, HOY);
  assert.equal(r.resultado, 'FAVORABLE');
  const anemia = evaluar(configReglas(), { edad: 30, sexo: 'F', lab: { hemoglobina: 11.9 } }, HOY);
  assert.equal(anemia.resultado, 'DIFERIMIENTO_TEMPORAL');
});

test('RF06: interpreta filas de un informe y descarta la hemoglobina de orina', () => {
  const texto = [
    'Pac.:  PEREZ JUAN  Fec.Nac:  1/05/1990',
    'DNI  30.111.222  Mutual:  OSDE',
    'Fecha de Análisis:  26/09/2026  HORA:  11:18',
    'Hemoglobina:  14.2  g/dL  Adultos: H:12.9-16.9',
    'Hematocrito:  43  %  Adultos: H:40-52',
    'H.C.M.:  29  pg  Adultos: 27-32',
    'Recuento de Plaquetas  231  miles/mm3  Adultos 171-381',
    'Volumen Plaquetario Medio VPM  6.7  fL',
    'HB. GLICOSILADA(HbA1c)  5.2  %',
    'VDRL (Sífilis):  No reactivo',
    'Chagas (ELISA):  Reactivo',
    'Hemoglobina  NO CONTIENE',
  ].join('\n');
  const r = interpretarTexto(texto);
  assert.equal(r.parametros.hemoglobina, 14.2);
  assert.equal(r.parametros.hematocrito, 43);
  assert.equal(r.parametros.plaquetas, 231_000);
  assert.deepEqual(r.parametros.serologias, { Chagas: 'REACTIVO', 'Sífilis': 'NO_REACTIVO' });
  assert.equal(r.fecha, '2026-09-26'); // nunca la fecha de nacimiento
  assert.equal(r.dni, '30111222');
});

test('RNF01: cifrado AES-256-GCM ida y vuelta, con nonce distinto cada vez', () => {
  const a = cifrar('dato sensible');
  assert.notEqual(a, cifrar('dato sensible'));
  assert.equal(descifrar(a), 'dato sensible');
});
