import { Router } from 'express';
import multer from 'multer';
import { ejecutar, todos, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import { idDonante, requiere } from '../auth.ts';
import { ErrorHttp, ahoraIso, fechaLocal } from '../util.ts';
import { consentimientos, obtenerDonante, perfilPublico, registrarConsentimiento, type TipoConsentimiento } from '../services/donantes.ts';
import { definicionCuestionario } from '../services/configuracion.ts';
import { guardarCuestionario, ultimoCuestionario, validarRespuestas } from '../services/cuestionario.ts';
import {
  TIPOS_PERMITIDOS, eliminarArchivoEstudio, guardarEstudio, leerArchivoEstudio, listarEstudios, obtenerFilaEstudio,
  procesarEstudio,
} from '../services/procesadorEstudios.ts';
import { generarOrientacion, listarOrientaciones, ultimaOrientacion } from '../services/orientacion.ts';
import { verificarIntervalosDonante } from '../services/intervalos.ts';
import { habilitacionParaTurnos } from '../services/habilitacion.ts';
import { cancelarTurno, consultarDisponibilidad, listarCentros, misTurnos, reservarTurno, turnoActivo } from '../services/turnos.ts';
import { PROCEDIMIENTO, donacionesDelDonante, registrarAutoexclusion } from '../services/autoexclusion.ts';

export const rutasDonante = Router();
rutasDonante.use(requiere('DONANTE'));

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, archivo, cb) => cb(null, TIPOS_PERMITIDOS.includes(archivo.mimetype)),
});

const donante = (req: Parameters<typeof idDonante>[0]) => obtenerDonante(idDonante(req))!;
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorHttp(400, 'PARAMETRO_INVALIDO', 'Identificador inválido.');
  return n;
};

// ---- Perfil, consentimientos y tablero ----

rutasDonante.get('/donante/perfil', (req, res) => {
  res.json({ ...perfilPublico(donante(req), req.usuario!.email), consentimientos: consentimientos(idDonante(req)) });
});

rutasDonante.put('/donante/perfil', (req, res) => {
  const telefono = String(req.body?.telefono ?? '').trim();
  const localidad = String(req.body?.localidad ?? '').trim();
  const domicilio = String(req.body?.domicilio ?? '').trim();
  const errores: Record<string, string> = {};
  if (!/^\+?[\d\s-]{8,20}$/.test(telefono)) errores.telefono = 'Ingresá un teléfono válido';
  if (!localidad) errores.localidad = 'Seleccioná tu localidad';
  if (Object.keys(errores).length) throw new ErrorHttp(422, 'VALIDACION', 'Revisá los datos.', { errores });
  ejecutar('UPDATE donante SET telefono = ?, localidad = ?, domicilio = ? WHERE id_donante = ?',
    [telefono, localidad, domicilio || null, idDonante(req)]);
  auditar(req.usuario!.idUsuario, 'ACTUALIZAR_PERFIL', 'donante', idDonante(req));
  res.json({ ok: true });
});

rutasDonante.put('/donante/consentimientos', (req, res) => {
  const actuales = consentimientos(idDonante(req));
  const claves = [['datosSalud', 'DATOS_SALUD'], ['convocatorias', 'CONVOCATORIAS']] as [string, TipoConsentimiento][];
  for (const [clave, tipo] of claves) {
    const valor = req.body?.[clave];
    if (typeof valor === 'boolean' && valor !== actuales[tipo].otorgado) {
      const id = registrarConsentimiento(idDonante(req), tipo, valor);
      auditar(req.usuario!.idUsuario, valor ? 'OTORGAR_CONSENTIMIENTO' : 'REVOCAR_CONSENTIMIENTO', 'consentimiento', id, { tipo });
    }
  }
  res.json(consentimientos(idDonante(req)));
});

/** Preferencias de avisos de turnos por correo (confirmación/cancelación y recordatorio). */
rutasDonante.put('/donante/preferencias', (req, res) => {
  const correoTurnos = req.body?.correoTurnos;
  const recordatorioHoras = req.body?.recordatorioHoras;
  if (typeof correoTurnos !== 'boolean' || ![0, 24, 48].includes(recordatorioHoras)) {
    throw new ErrorHttp(422, 'VALIDACION', 'Preferencias inválidas.');
  }
  ejecutar('UPDATE donante SET correo_turnos = ?, recordatorio_horas = ? WHERE id_donante = ?',
    [correoTurnos ? 1 : 0, recordatorioHoras, idDonante(req)]);
  auditar(req.usuario!.idUsuario, 'ACTUALIZAR_PREFERENCIAS', 'donante', idDonante(req), { correoTurnos, recordatorioHoras });
  res.json(perfilPublico(donante(req), req.usuario!.email).preferencias);
});

/** Tablero del donante: estado de cada paso del camino. */
rutasDonante.get('/donante/resumen', (req, res) => {
  const d = donante(req);
  const id = d.id_donante;
  const cuestionario = ultimoCuestionario(id);
  const estudios = listarEstudios(id);
  res.json({
    nombre: d.nombres,
    grupo: d.grupo_abo && d.factor_rh ? `${d.grupo_abo}${d.factor_rh}` : null,
    consentimientos: consentimientos(id),
    cuestionario: cuestionario
      ? { declaradoEn: cuestionario.declaradoEn, vigente: !Object.keys(validarRespuestas(cuestionario.respuestas, d.sexo_biologico).errores).length }
      : null,
    estudios: {
      total: estudios.length,
      requierenRevision: estudios.filter((e) => e.estado === 'REQUIERE_REVISION').length,
      detenidos: estudios.filter((e) => e.estado === 'DETENIDO').length,
      vigentes: estudios.filter((e) => e.estado === 'PROCESADO' && e.vigente).length,
    },
    orientacion: ultimaOrientacion(id) ?? null,
    intervalo: verificarIntervalosDonante(id, d.sexo_biologico),
    habilitacion: habilitacionParaTurnos(id, d.sexo_biologico),
    turno: turnoActivo(id),
    donaciones: donacionesDelDonante(id).length,
    avisosSinLeer: uno<{ n: number }>('SELECT COUNT(*) AS n FROM notificacion WHERE id_donante = ? AND leida_en IS NULL', [id])!.n,
  });
});

// ---- RF04 — Cuestionario de salud ----

rutasDonante.get('/cuestionario/definicion', (req, res) => {
  const sexo = donante(req).sexo_biologico;
  const def = definicionCuestionario();
  res.json({
    ...def,
    secciones: def.secciones.map((s) => ({ ...s, preguntas: s.preguntas.filter((p) => !p.soloSexo || p.soloSexo === sexo) })),
  });
});

rutasDonante.get('/donante/cuestionario', (req, res) => {
  res.json(ultimoCuestionario(idDonante(req)) ?? null);
});

rutasDonante.post('/donante/cuestionario', (req, res) => {
  if (!consentimientos(idDonante(req)).DATOS_SALUD.otorgado) {
    throw new ErrorHttp(403, 'SIN_CONSENTIMIENTO', 'Para guardar datos de salud necesitamos tu consentimiento.');
  }
  const id = guardarCuestionario(idDonante(req), req.body?.respuestas ?? {}, donante(req).sexo_biologico);
  auditar(req.usuario!.idUsuario, 'DECLARAR_CUESTIONARIO', 'cuestionario_salud', id);
  res.status(201).json({ id });
});

// ---- RF05/RF06 — Estudios médicos ----

rutasDonante.get('/donante/estudios', (req, res) => {
  res.json(listarEstudios(idDonante(req)));
});

rutasDonante.post('/donante/estudios', subida.single('archivo'), async (req, res) => {
  if (!consentimientos(idDonante(req)).DATOS_SALUD.otorgado) {
    throw new ErrorHttp(403, 'SIN_CONSENTIMIENTO', 'Para adjuntar estudios necesitamos tu consentimiento.');
  }
  if (!req.file) throw new ErrorHttp(422, 'ARCHIVO_INVALIDO', 'Adjuntá un archivo PDF, JPG o PNG de hasta 10 MB.');
  const fecha = typeof req.body?.fechaEstudio === 'string' ? req.body.fechaEstudio : undefined;
  if (fecha && fecha > fechaLocal()) throw new ErrorHttp(422, 'VALIDACION', 'La fecha del estudio no puede ser futura.');
  const archivo = { ...req.file, originalname: Buffer.from(req.file.originalname, 'latin1').toString('utf8') };
  const id = guardarEstudio(idDonante(req), archivo, fecha);
  auditar(req.usuario!.idUsuario, 'CARGAR_ESTUDIO', 'estudio_medico', id);
  await procesarEstudio(id); // se procesa al cargar para dar devolución inmediata
  res.status(201).json(listarEstudios(idDonante(req)).find((e) => e.id === id));
});

function estudioPropio(req: Parameters<typeof idDonante>[0]) {
  const fila = obtenerFilaEstudio(idParam(req.params.id));
  if (!fila || fila.id_donante !== idDonante(req)) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El estudio no existe.');
  return fila;
}

rutasDonante.get('/donante/estudios/:id/archivo', (req, res) => {
  const fila = estudioPropio(req);
  res.setHeader('Content-Type', fila.tipo_mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fila.nombre_archivo)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(leerArchivoEstudio(fila));
});

rutasDonante.delete('/donante/estudios/:id', (req, res) => {
  const fila = estudioPropio(req);
  eliminarArchivoEstudio(fila);
  ejecutar('DELETE FROM estudio_medico WHERE id_estudio_medico = ?', [fila.id_estudio_medico]);
  auditar(req.usuario!.idUsuario, 'ELIMINAR_ESTUDIO', 'estudio_medico', fila.id_estudio_medico);
  res.json({ ok: true });
});

// ---- CU01 — Orientación previa ----

rutasDonante.post('/orientaciones', async (req, res) => {
  const resultado = await generarOrientacion(idDonante(req));
  auditar(req.usuario!.idUsuario, 'GENERAR_ORIENTACION', 'orientacion', resultado.id, { resultado: resultado.resultado });
  res.json(resultado);
});

rutasDonante.get('/orientaciones', (req, res) => {
  res.json(listarOrientaciones(idDonante(req)));
});

// ---- CU02 — Turnos ----

rutasDonante.get('/centros', (_req, res) => {
  res.json(listarCentros());
});

rutasDonante.get('/centros/:id/disponibilidad', (req, res) => {
  const d = donante(req);
  res.json({
    fechaHabilitacion: habilitacionParaTurnos(d.id_donante, d.sexo_biologico).desde,
    dias: consultarDisponibilidad(idParam(req.params.id)),
  });
});

rutasDonante.get('/turnos', (req, res) => {
  res.json(misTurnos(idDonante(req)));
});

rutasDonante.post('/turnos', (req, res) => {
  const conv = req.body?.idConvocatoria ? idParam(req.body.idConvocatoria) : undefined;
  const turno = reservarTurno(req.usuario!.idUsuario, idDonante(req), idParam(req.body?.idAgenda), conv);
  res.status(201).json(turno);
});

rutasDonante.post('/turnos/:id/cancelar', (req, res) => {
  cancelarTurno(req.usuario!.idUsuario, idDonante(req), idParam(req.params.id));
  res.json({ ok: true });
});

// ---- RF10 — Historial ----

rutasDonante.get('/donante/historial', (req, res) => {
  const d = donante(req);
  const evaluaciones = todos<{ resultado: string; fecha_habilitacion: string | null; evaluada_en: string; centro: string }>(
    `SELECT e.resultado, e.fecha_habilitacion, e.evaluada_en, c.nombre AS centro FROM evaluacion_presencial e
     JOIN centro_hemoterapia c ON c.id_centro = e.id_centro WHERE e.id_donante = ? ORDER BY e.evaluada_en DESC`, [d.id_donante],
  ).map((e) => ({ resultado: e.resultado, fechaHabilitacion: e.fecha_habilitacion, evaluadaEn: e.evaluada_en, centro: e.centro }));
  res.json({
    donaciones: donacionesDelDonante(d.id_donante).map(({ autoexclusionSolicitada: _a, autoexclusionEn: _b, ...resto }) => resto),
    evaluaciones,
    intervalo: verificarIntervalosDonante(d.id_donante, d.sexo_biologico),
  });
});

// ---- CU06 — Autoexclusión confidencial ----

rutasDonante.get('/autoexclusion/donaciones', (req, res) => {
  res.json({ procedimiento: PROCEDIMIENTO, donaciones: donacionesDelDonante(idDonante(req)) });
});

rutasDonante.post('/autoexclusiones', (req, res) => {
  res.status(201).json(registrarAutoexclusion(req.usuario!.idUsuario, idDonante(req), idParam(req.body?.idDonacion)));
});

// ---- Avisos (bandeja de notificaciones simuladas) ----

rutasDonante.get('/avisos', (req, res) => {
  res.json(todos<{ id_notificacion: number; tipo: string; canal: string; asunto: string; cuerpo: string; enlace: string | null; estado: string; creada_en: string; leida_en: string | null }>(
    'SELECT * FROM notificacion WHERE id_donante = ? ORDER BY id_notificacion DESC LIMIT 50', [idDonante(req)],
  ).map((n) => ({
    id: n.id_notificacion, tipo: n.tipo, canal: n.canal, asunto: n.asunto, cuerpo: n.cuerpo,
    enlace: n.enlace ? new URL(n.enlace).pathname + new URL(n.enlace).search : null,
    estado: n.estado, creadaEn: n.creada_en, leida: !!n.leida_en,
  })));
});

rutasDonante.post('/avisos/leidos', (req, res) => {
  ejecutar('UPDATE notificacion SET leida_en = ? WHERE id_donante = ? AND leida_en IS NULL', [ahoraIso(), idDonante(req)]);
  res.json({ ok: true });
});
