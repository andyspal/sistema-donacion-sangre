import { ejecutar, uno } from '../db.ts';
import { cifrarJson, descifrarJson } from '../seguridad.ts';
import { ErrorHttp, ahoraIso, esFecha, fechaLocal } from '../util.ts';
import { definicionCuestionario, type Pregunta } from './configuracion.ts';

export type Respuestas = Record<string, unknown>;

function visible(p: Pregunta, respuestas: Respuestas, sexo: 'M' | 'F') {
  if (p.soloSexo && p.soloSexo !== sexo) return false;
  if (p.mostrarSi && respuestas[p.mostrarSi.pregunta] !== p.mostrarSi.igual) return false;
  return true;
}

/**
 * Valida las respuestas contra la definición vigente: toda pregunta visible es
 * obligatoria y se descartan las respuestas a preguntas ocultas.
 * Devuelve las respuestas limpias o los campos con error.
 */
export function validarRespuestas(entrada: Respuestas, sexo: 'M' | 'F') {
  const def = definicionCuestionario();
  const limpias: Respuestas = {};
  const errores: Record<string, string> = {};
  const hoy = fechaLocal();

  for (const p of def.secciones.flatMap((s) => s.preguntas)) {
    if (!visible(p, { ...entrada, ...limpias }, sexo)) continue;
    const v = entrada[p.id];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      errores[p.id] = 'Respuesta obligatoria';
      continue;
    }
    switch (p.tipo) {
      case 'si_no':
        if (typeof v !== 'boolean') { errores[p.id] = 'Respondé sí o no'; continue; }
        break;
      case 'numero': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) {
          errores[p.id] = `Ingresá un valor entre ${p.min} y ${p.max}`; continue;
        }
        limpias[p.id] = n;
        continue;
      }
      case 'fecha':
        if (!esFecha(v)) { errores[p.id] = 'Fecha inválida'; continue; }
        if (p.noFutura && v > hoy) { errores[p.id] = 'La fecha no puede ser futura'; continue; }
        break;
      case 'opcion':
        if (!p.opciones?.some((o) => o.valor === v)) { errores[p.id] = 'Opción inválida'; continue; }
        break;
      case 'multiple': {
        if (!Array.isArray(v) || !v.every((x) => p.opciones?.some((o) => o.valor === x))) {
          errores[p.id] = 'Opción inválida'; continue;
        }
        if (p.exclusiva && v.includes(p.exclusiva) && v.length > 1) {
          errores[p.id] = 'Esta opción no puede combinarse con otras'; continue;
        }
        break;
      }
    }
    limpias[p.id] = v;
  }
  return { version: def.version, limpias, errores };
}

export function guardarCuestionario(idDonante: number, entrada: Respuestas, sexo: 'M' | 'F') {
  const { version, limpias, errores } = validarRespuestas(entrada, sexo);
  if (Object.keys(errores).length) {
    throw new ErrorHttp(422, 'CUESTIONARIO_INCOMPLETO', 'Completá todas las preguntas del cuestionario.', { errores });
  }
  const { id } = ejecutar(
    'INSERT INTO cuestionario_salud (id_donante, version, respuestas_cifradas, declarado_en) VALUES (?, ?, ?, ?)',
    [idDonante, version, cifrarJson(limpias), ahoraIso()],
  );
  return id;
}

export function ultimoCuestionario(idDonante: number) {
  const fila = uno<{ id_cuestionario: number; version: string; respuestas_cifradas: string; declarado_en: string }>(
    'SELECT * FROM cuestionario_salud WHERE id_donante = ? ORDER BY id_cuestionario DESC LIMIT 1', [idDonante],
  );
  if (!fila) return undefined;
  return {
    id: fila.id_cuestionario,
    version: fila.version,
    declaradoEn: fila.declarado_en,
    respuestas: descifrarJson<Respuestas>(fila.respuestas_cifradas),
  };
}
