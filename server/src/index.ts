import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { DIR_WEB, PUERTO, URL_PUBLICA } from './config.ts';
import { todos, uno } from './db.ts';
import { sesion } from './auth.ts';
import { ErrorHttp } from './util.ts';
import { rutasAuth } from './routes/auth.ts';
import { rutasDonante } from './routes/donante.ts';
import { rutasHospital } from './routes/hospital.ts';
import { monitorearStock } from './services/inventario.ts';
import { sembrar } from './seed.ts';

if (!uno('SELECT 1 FROM centro_hemoterapia LIMIT 1')) await sembrar();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// Cabeceras de seguridad básicas.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Protección CSRF: las operaciones que modifican datos solo se aceptan desde el propio origen.
const origenesPermitidos = new Set([new URL(URL_PUBLICA).origin, `http://localhost:${PUERTO}`, `http://127.0.0.1:${PUERTO}`]);
app.use('/api', (req, _res, next) => {
  const origen = req.headers.origin;
  if (req.method !== 'GET' && origen && !origenesPermitidos.has(origen)) {
    throw new ErrorHttp(403, 'ORIGEN_NO_PERMITIDO', 'Origen no permitido.');
  }
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(sesion);

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', rutasAuth);
app.use('/api/hospital', rutasHospital);
app.use('/api', rutasDonante);
app.use('/api', (_req, _res, next) => next(new ErrorHttp(404, 'NO_ENCONTRADO', 'Recurso inexistente.')));

// En producción la API sirve también la PWA compilada (web/dist).
if (fs.existsSync(DIR_WEB)) {
  app.use(express.static(DIR_WEB, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIR_WEB, 'index.html')));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ErrorHttp) {
    res.status(error.estado).json({ error: { codigo: error.codigo, mensaje: error.message, detalle: error.detalle } });
    return;
  }
  if (error instanceof multer.MulterError) {
    const mensaje = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 10 MB.' : 'No se pudo recibir el archivo.';
    res.status(422).json({ error: { codigo: 'ARCHIVO_INVALIDO', mensaje } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la solicitud no es JSON válido.' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. La operación no se registró.' } });
});

app.listen(PUERTO, () => {
  console.log(`API HEMORED escuchando en http://localhost:${PUERTO}`);
});

// Chequeo programado del Monitor de Stock (CU05), además del disparo por cada actualización.
const chequearTodo = () => {
  for (const c of todos<{ id_centro: number }>('SELECT id_centro FROM centro_hemoterapia WHERE activo = 1')) {
    try { monitorearStock(c.id_centro); } catch (e) { console.error('Monitor de stock:', e); }
  }
};
setTimeout(chequearTodo, 2_000);
setInterval(chequearTodo, 60 * 60_000);
