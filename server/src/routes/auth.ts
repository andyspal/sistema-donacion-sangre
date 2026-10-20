import { Router } from 'express';
import { ejecutar, transaccion, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import { cerrarSesion, crearSesion, requiere } from '../auth.ts';
import { hashContrasena, verificarContrasena } from '../seguridad.ts';
import { ErrorHttp, ahoraIso, edadEn, esFecha } from '../util.ts';
import { registrarConsentimiento } from '../services/donantes.ts';

export const rutasAuth = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** RF01 + RF02 — Registro del donante con sus consentimientos. */
rutasAuth.post('/registro', (req, res) => {
  const b = req.body ?? {};
  const datos = {
    email: texto(b.email).toLowerCase(),
    contrasena: typeof b.contrasena === 'string' ? b.contrasena : '',
    dni: texto(b.dni).replace(/\D/g, ''),
    nombres: texto(b.nombres),
    apellidos: texto(b.apellidos),
    fechaNacimiento: texto(b.fechaNacimiento),
    sexoBiologico: texto(b.sexoBiologico),
    telefono: texto(b.telefono),
    domicilio: texto(b.domicilio),
    localidad: texto(b.localidad),
    grupoAbo: texto(b.grupoAbo),
    factorRh: texto(b.factorRh),
  };

  const errores: Record<string, string> = {};
  if (!EMAIL.test(datos.email)) errores.email = 'Ingresá un correo válido';
  if (datos.contrasena.length < 8 || !/[a-zA-Z]/.test(datos.contrasena) || !/\d/.test(datos.contrasena)) {
    errores.contrasena = 'Mínimo 8 caracteres, con letras y números';
  }
  if (!/^\d{7,8}$/.test(datos.dni)) errores.dni = 'El DNI debe tener 7 u 8 dígitos';
  if (!datos.nombres) errores.nombres = 'Obligatorio';
  if (!datos.apellidos) errores.apellidos = 'Obligatorio';
  if (!esFecha(datos.fechaNacimiento)) errores.fechaNacimiento = 'Fecha inválida';
  else {
    const edad = edadEn(datos.fechaNacimiento);
    if (edad < 16) errores.fechaNacimiento = 'Para registrarte necesitás tener al menos 16 años';
    else if (edad > 100) errores.fechaNacimiento = 'Revisá la fecha de nacimiento';
  }
  if (!['M', 'F'].includes(datos.sexoBiologico)) errores.sexoBiologico = 'Seleccioná una opción';
  if (!/^\+?[\d\s-]{8,20}$/.test(datos.telefono)) errores.telefono = 'Ingresá un teléfono válido';
  if (!datos.localidad) errores.localidad = 'Seleccioná tu localidad';
  const grupoDeclarado = datos.grupoAbo || datos.factorRh;
  if (grupoDeclarado && (!['A', 'B', 'AB', 'O'].includes(datos.grupoAbo) || !['+', '-'].includes(datos.factorRh))) {
    errores.grupoAbo = 'Indicá grupo y factor, o dejalo en «No sé»';
  }
  if (Object.keys(errores).length) throw new ErrorHttp(422, 'VALIDACION', 'Revisá los datos ingresados.', { errores });

  if (uno('SELECT 1 FROM usuario WHERE email = ?', [datos.email])) {
    throw new ErrorHttp(409, 'EMAIL_EXISTENTE', 'Ya existe una cuenta con ese correo.', { errores: { email: 'Ya registrado' } });
  }
  if (uno('SELECT 1 FROM donante WHERE dni = ?', [datos.dni])) {
    throw new ErrorHttp(409, 'DNI_EXISTENTE', 'Ya existe una cuenta con ese DNI.', { errores: { dni: 'Ya registrado' } });
  }

  const idUsuario = transaccion(() => {
    const ahora = ahoraIso();
    const { id: idUsuario } = ejecutar(
      'INSERT INTO usuario (email, hash_contrasena, activo, creado_en) VALUES (?, ?, 1, ?)',
      [datos.email, hashContrasena(datos.contrasena), ahora],
    );
    const { id: idDonante } = ejecutar(
      `INSERT INTO donante (id_usuario, dni, nombres, apellidos, fecha_nacimiento, sexo_biologico, telefono, domicilio, localidad, grupo_abo, factor_rh, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idUsuario, datos.dni, datos.nombres, datos.apellidos, datos.fechaNacimiento, datos.sexoBiologico, datos.telefono,
        datos.domicilio || null, datos.localidad, grupoDeclarado ? datos.grupoAbo : null, grupoDeclarado ? datos.factorRh : null, ahora],
    );
    registrarConsentimiento(idDonante, 'DATOS_SALUD', b.consentimientoDatosSalud === true);
    registrarConsentimiento(idDonante, 'CONVOCATORIAS', b.consentimientoConvocatorias === true);
    auditar(idUsuario, 'REGISTRO_DONANTE', 'donante', idDonante);
    return idUsuario;
  });

  crearSesion(res, idUsuario);
  res.status(201).json({ ok: true });
});

// Límite simple de intentos fallidos por correo (mitiga fuerza bruta).
const intentos = new Map<string, { cantidad: number; hasta: number }>();

/** RF03 — Inicio de sesión. */
rutasAuth.post('/login', (req, res) => {
  const email = texto(req.body?.email).toLowerCase();
  const contrasena = typeof req.body?.contrasena === 'string' ? req.body.contrasena : '';
  const registro = intentos.get(email);
  if (registro && registro.cantidad >= 5 && registro.hasta > Date.now()) {
    throw new ErrorHttp(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.');
  }
  const u = uno<{ id_usuario: number; hash_contrasena: string; activo: number }>(
    'SELECT id_usuario, hash_contrasena, activo FROM usuario WHERE email = ?', [email],
  );
  if (!u || !u.activo || !verificarContrasena(contrasena, u.hash_contrasena)) {
    const cantidad = (registro && registro.hasta > Date.now() ? registro.cantidad : 0) + 1;
    intentos.set(email, { cantidad, hasta: Date.now() + 15 * 60_000 });
    throw new ErrorHttp(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');
  }
  intentos.delete(email);
  crearSesion(res, u.id_usuario);
  auditar(u.id_usuario, 'INICIAR_SESION', 'usuario', u.id_usuario);
  res.json({ ok: true });
});

rutasAuth.post('/logout', (req, res) => {
  cerrarSesion(req, res);
  res.json({ ok: true });
});

rutasAuth.get('/sesion', requiere(), (req, res) => {
  res.json(req.usuario);
});
