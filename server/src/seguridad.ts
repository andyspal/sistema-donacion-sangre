import crypto from 'node:crypto';
import { CLAVE_DATOS } from './config.ts';

/** Cifra texto con AES-256-GCM. Formato: v1.<iv>.<tag>.<datos> en base64url. */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', CLAVE_DATOS, iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return ['v1', iv, tag, datos].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function descifrar(sobre: string): string {
  const [version, iv, tag, datos] = sobre.split('.');
  if (version !== 'v1') throw new Error('Formato de cifrado desconocido');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', CLAVE_DATOS, Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([descifrador.update(Buffer.from(datos, 'base64url')), descifrador.final()]).toString('utf8');
}

export const cifrarJson = (valor: unknown) => cifrar(JSON.stringify(valor));
export const descifrarJson = <T>(sobre: string): T => JSON.parse(descifrar(sobre)) as T;

/** Cifra un archivo completo (estudios médicos adjuntos). */
export function cifrarBuffer(buffer: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', CLAVE_DATOS, iv);
  const datos = Buffer.concat([cifrador.update(buffer), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), datos]);
}

export function descifrarBuffer(buffer: Buffer): Buffer {
  const descifrador = crypto.createDecipheriv('aes-256-gcm', CLAVE_DATOS, buffer.subarray(0, 12));
  descifrador.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([descifrador.update(buffer.subarray(28)), descifrador.final()]);
}

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashContrasena(contrasena: string): string {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(contrasena, sal, 64, SCRYPT);
  return `scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verificarContrasena(contrasena: string, almacenado: string): boolean {
  const [algoritmo, sal, hash] = almacenado.split('$');
  if (algoritmo !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64url');
  const calculado = crypto.scryptSync(contrasena, Buffer.from(sal, 'base64url'), esperado.length, SCRYPT);
  return crypto.timingSafeEqual(esperado, calculado);
}

export const tokenAleatorio = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (texto: string) => crypto.createHash('sha256').update(texto).digest('hex');
