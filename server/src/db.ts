import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { ARCHIVO_DB } from './config.ts';

export type Parametros = Record<string, SQLInputValue> | SQLInputValue[];

export const ESQUEMA = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');

export const db = new DatabaseSync(ARCHIVO_DB, { enableForeignKeyConstraints: true });
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

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

/**
 * Actualiza bases creadas con una versión anterior del esquema conservando los datos.
 * SQLite no permite modificar un CHECK: esas tablas se reconstruyen (crear la nueva,
 * copiar, borrar la vieja y renombrar). Las columnas nuevas se agregan con ALTER TABLE.
 * Es idempotente: cada paso se detecta por la definición actual de la tabla.
 */
function migrar() {
  const sqlTabla = (t: string) => uno<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [t])?.sql;
  const columnas = (t: string) => todos<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name);

  const reconstruir = ([['estudio_medico', 'DETENIDO'], ['notificacion', 'RECORDATORIO_TURNO']] as const)
    .filter(([t, marca]) => sqlTabla(t)?.includes(marca) === false)
    .map(([t]) => t);
  const sinPreferencias = !!sqlTabla('donante') && !columnas('donante').includes('correo_turnos');
  if (!reconstruir.length && !sinPreferencias) return;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaccion(() => {
      for (const t of reconstruir) {
        const crear = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${t} \([\s\S]*?\n\);`).exec(ESQUEMA)![0];
        db.exec(crear.replace(`CREATE TABLE IF NOT EXISTS ${t} (`, `CREATE TABLE ${t}_nueva (`));
        const nuevas = columnas(`${t}_nueva`);
        const comunes = columnas(t).filter((c) => nuevas.includes(c)).join(', ');
        db.exec(`INSERT INTO ${t}_nueva (${comunes}) SELECT ${comunes} FROM ${t}`);
        db.exec(`DROP TABLE ${t}`);
        db.exec(`ALTER TABLE ${t}_nueva RENAME TO ${t}`);
      }
      if (sinPreferencias) {
        db.exec('ALTER TABLE donante ADD COLUMN correo_turnos INTEGER NOT NULL DEFAULT 1 CHECK (correo_turnos IN (0,1))');
        db.exec('ALTER TABLE donante ADD COLUMN recordatorio_horas INTEGER NOT NULL DEFAULT 24 CHECK (recordatorio_horas IN (0,24,48))');
      }
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  console.log('Base de datos actualizada al esquema vigente.');
}

migrar();
db.exec(ESQUEMA);
