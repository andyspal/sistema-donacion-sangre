import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const raiz = path.resolve(import.meta.dirname, '..');

export const PUERTO = Number(process.env.API_PORT ?? 3001);
export const DIR_DATOS = process.env.DATA_DIR ?? path.join(raiz, 'data');
export const DIR_ESTUDIOS = path.join(DIR_DATOS, 'estudios');
export const DIR_CONFIG = path.join(raiz, 'config');
export const ARCHIVO_DB = path.join(DIR_DATOS, 'hemored.db');
export const DIR_WEB = path.resolve(raiz, '..', 'web', 'dist');
/** URL pública de la PWA, usada en los enlaces de las notificaciones. */
export const URL_PUBLICA = process.env.PUBLIC_URL ?? 'http://localhost:5173';
export const DURACION_SESION_HORAS = 12;
export const VERSION_CONSENTIMIENTO = '2026-10';

fs.mkdirSync(DIR_ESTUDIOS, { recursive: true });

/**
 * Clave AES-256 para datos sensibles (RNF01). En producción debe venir de un
 * gestor de secretos vía DATA_KEY; en desarrollo se genera una vez en data/.
 */
function cargarClave(): Buffer {
  if (process.env.DATA_KEY) {
    const clave = Buffer.from(process.env.DATA_KEY, 'base64');
    if (clave.length !== 32) throw new Error('DATA_KEY debe ser 32 bytes en base64');
    return clave;
  }
  const archivo = path.join(DIR_DATOS, 'clave-datos.key');
  if (!fs.existsSync(archivo)) {
    fs.writeFileSync(archivo, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(archivo, 'utf8').trim(), 'base64');
}

export const CLAVE_DATOS = cargarClave();
