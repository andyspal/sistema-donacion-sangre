import type { NextFunction, Request, Response } from 'express';
import { ejecutar, uno } from './db.ts';
import { DURACION_SESION_HORAS } from './config.ts';
import { sha256, tokenAleatorio } from './seguridad.ts';
import { ErrorHttp, ahoraIso } from './util.ts';

export type Rol = 'DONANTE' | 'MEDICO' | 'ADMINISTRATIVO' | 'RESPONSABLE_INVENTARIO' | 'ADMINISTRADOR';

export interface UsuarioSesion {
  idUsuario: number;
  email: string;
  rol: Rol;
  nombre: string;
  idDonante?: number;
  idPersonal?: number;
  idCentro?: number;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioSesion;
    }
  }
}

const COOKIE = 'hemored_sesion';

export function crearSesion(res: Response, idUsuario: number) {
  const token = tokenAleatorio();
  const expira = new Date(Date.now() + DURACION_SESION_HORAS * 3_600_000);
  ejecutar('INSERT INTO sesion (token_hash, id_usuario, creada_en, expira_en) VALUES (?, ?, ?, ?)', [
    sha256(token), idUsuario, ahoraIso(), expira.toISOString(),
  ]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expira,
    path: '/',
  });
}

export function cerrarSesion(req: Request, res: Response) {
  const token = leerCookie(req);
  if (token) ejecutar('DELETE FROM sesion WHERE token_hash = ?', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

function leerCookie(req: Request): string | undefined {
  const cabecera = req.headers.cookie;
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE) return decodeURIComponent(valor.join('='));
  }
  return undefined;
}

export function cargarUsuario(idUsuario: number): UsuarioSesion | undefined {
  const u = uno<{ id_usuario: number; email: string; activo: number }>(
    'SELECT id_usuario, email, activo FROM usuario WHERE id_usuario = ?', [idUsuario],
  );
  if (!u || !u.activo) return undefined;
  const d = uno<{ id_donante: number; nombres: string; apellidos: string }>(
    'SELECT id_donante, nombres, apellidos FROM donante WHERE id_usuario = ?', [idUsuario],
  );
  if (d) {
    return { idUsuario, email: u.email, rol: 'DONANTE', nombre: `${d.nombres} ${d.apellidos}`, idDonante: d.id_donante };
  }
  const p = uno<{ id_personal: number; id_centro: number; nombres: string; apellidos: string; rol: Rol; activo: number }>(
    'SELECT id_personal, id_centro, nombres, apellidos, rol, activo FROM personal WHERE id_usuario = ?', [idUsuario],
  );
  if (p && p.activo) {
    return {
      idUsuario, email: u.email, rol: p.rol, nombre: `${p.nombres} ${p.apellidos}`,
      idPersonal: p.id_personal, idCentro: p.id_centro,
    };
  }
  return undefined;
}

/** Resuelve la sesión a partir de la cookie (no exige estar autenticado). */
export function sesion(req: Request, _res: Response, next: NextFunction) {
  const token = leerCookie(req);
  if (token) {
    const s = uno<{ id_usuario: number; expira_en: string }>(
      'SELECT id_usuario, expira_en FROM sesion WHERE token_hash = ?', [sha256(token)],
    );
    if (s && s.expira_en > ahoraIso()) req.usuario = cargarUsuario(s.id_usuario);
  }
  next();
}

/** Control de acceso por rol (RNF02). */
export function requiere(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw new ErrorHttp(401, 'NO_AUTENTICADO', 'Iniciá sesión para continuar.');
    if (roles.length && !roles.includes(req.usuario.rol)) {
      throw new ErrorHttp(403, 'SIN_PERMISO', 'No tenés permisos para realizar esta operación.');
    }
    next();
  };
}

export const ROLES_PERSONAL: Rol[] = ['MEDICO', 'ADMINISTRATIVO', 'RESPONSABLE_INVENTARIO', 'ADMINISTRADOR'];

/** Helpers para obtener los ids de la sesión ya validada por `requiere`. */
export const idDonante = (req: Request) => req.usuario!.idDonante!;
export const personal = (req: Request) => req.usuario! as Required<Pick<UsuarioSesion, 'idPersonal' | 'idCentro'>> & UsuarioSesion;
