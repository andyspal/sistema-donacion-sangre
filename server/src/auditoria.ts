import { ejecutar } from './db.ts';
import { cifrarJson } from './seguridad.ts';
import { ahoraIso } from './util.ts';

/** Registro de operaciones para trazabilidad (RNF09): usuario, acción, fecha y hora. */
export function auditar(idUsuario: number | null, accion: string, entidad: string, idRegistro: number | null, detalle?: unknown) {
  ejecutar(
    `INSERT INTO auditoria (id_usuario, accion, entidad, id_registro, ejecutada_en, detalle_cifrado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [idUsuario, accion, entidad, idRegistro, ahoraIso(), detalle === undefined ? null : cifrarJson(detalle)],
  );
}
