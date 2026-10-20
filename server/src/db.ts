import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { ARCHIVO_DB } from './config.ts';

export type Parametros = Record<string, SQLInputValue> | SQLInputValue[];

export const db = new DatabaseSync(ARCHIVO_DB, { enableForeignKeyConstraints: true });
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));

function args(p?: Parametros): SQLInputValue[] | [Record<string, SQLInputValue>] {
  if (p === undefined) return [];
  return Array.isArray(p) ? p : [p];
}

export function uno<T>(sql: string, p?: Parametros): T | undefined {
  return db.prepare(sql).get(...(args(p) as SQLInputValue[])) as T | undefined;
}

export function todos<T>(sql: string, p?: Parametros): T[] {
  return db.prepare(sql).all(...(args(p) as SQLInputValue[])) as T[];
}

export function ejecutar(sql: string, p?: Parametros): { id: number; cambios: number } {
  const r = db.prepare(sql).run(...(args(p) as SQLInputValue[]));
  return { id: Number(r.lastInsertRowid), cambios: Number(r.changes) };
}

/**
 * Transacción ACID (RNF08). BEGIN IMMEDIATE toma el bloqueo de escritura al
 * inicio, equivalente al SELECT ... FOR UPDATE de los diagramas de secuencia:
 * ninguna otra conexión puede modificar el cupo mientras se verifica.
 */
export function transaccion<T>(fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
