import { Router } from 'express';
import { auditar } from '../auditoria.ts';
import { ROLES_PERSONAL, personal, requiere } from '../auth.ts';
import { ErrorHttp, fechaLocal } from '../util.ts';
import { configReglas, definicionCuestionario } from '../services/configuracion.ts';
import {
  agendaDelDia, buscarPostulantes, descargarEstudioPermitido, generarFranjas, legajo, listarAutoexclusiones,
  registrarDonacion, registrarEvaluacion,
} from '../services/hospital.ts';
import { leerArchivoEstudio, obtenerFilaEstudio } from '../services/procesadorEstudios.ts';
import {
  actualizarExistencia, agregarLote, configurarMinimo, consultarInventario, listarConvocatorias, monitorearStock, reintentarEnvios,
} from '../services/inventario.ts';
import { uno } from '../db.ts';

export const rutasHospital = Router();
rutasHospital.use(requiere(...ROLES_PERSONAL));

const id = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorHttp(400, 'PARAMETRO_INVALIDO', 'Identificador inválido.');
  return n;
};

rutasHospital.get('/centro', (req, res) => {
  res.json(uno('SELECT id_centro AS id, nombre, domicilio, localidad, telefono FROM centro_hemoterapia WHERE id_centro = ?', [personal(req).idCentro]));
});

// ---- Agenda (RF13) ----

rutasHospital.get('/agenda', (req, res) => {
  res.json(agendaDelDia(personal(req).idCentro, String(req.query.fecha ?? fechaLocal())));
});

rutasHospital.post('/agenda/generar', requiere('ADMINISTRATIVO', 'ADMINISTRADOR'), (req, res) => {
  res.status(201).json(generarFranjas(personal(req), req.body ?? {}));
});

// ---- Postulantes, legajo y evaluación (RF15, RF16, RF17 — CU03) ----

rutasHospital.get('/postulantes', (req, res) => {
  const resultados = buscarPostulantes(String(req.query.q ?? ''));
  if (!resultados.length) throw new ErrorHttp(404, 'SIN_RESULTADOS', 'La búsqueda no obtuvo resultados.');
  res.json(resultados);
});

rutasHospital.get('/postulantes/:id', (req, res) => {
  res.json(legajo(id(req.params.id), req.usuario!));
});

rutasHospital.get('/postulantes/:id/estudios/:idEstudio/archivo', (req, res) => {
  descargarEstudioPermitido(req.usuario!);
  const fila = obtenerFilaEstudio(id(req.params.idEstudio));
  if (!fila || fila.id_donante !== id(req.params.id)) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El estudio no existe.');
  auditar(req.usuario!.idUsuario, 'VER_ESTUDIO', 'estudio_medico', fila.id_estudio_medico);
  res.setHeader('Content-Type', fila.tipo_mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fila.nombre_archivo)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(leerArchivoEstudio(fila));
});

rutasHospital.post('/postulantes/:id/evaluaciones', requiere('MEDICO'), (req, res) => {
  res.status(201).json(registrarEvaluacion(personal(req), id(req.params.id), req.body ?? {}));
});

rutasHospital.post('/postulantes/:id/donaciones', requiere('MEDICO', 'ADMINISTRATIVO', 'ADMINISTRADOR'), (req, res) => {
  res.status(201).json(registrarDonacion(personal(req), id(req.params.id), req.body ?? {}));
});

// ---- Inventario (RF18–RF21 — CU04) ----

rutasHospital.get('/inventario', (req, res) => {
  res.json(consultarInventario(personal(req).idCentro));
});

const gestionInventario = requiere('RESPONSABLE_INVENTARIO', 'ADMINISTRADOR');

rutasHospital.put('/inventario/:id', gestionInventario, (req, res) => {
  actualizarExistencia(personal(req), id(req.params.id), req.body ?? {});
  res.json(consultarInventario(personal(req).idCentro));
});

rutasHospital.post('/inventario', gestionInventario, (req, res) => {
  agregarLote(personal(req), req.body ?? {});
  res.status(201).json(consultarInventario(personal(req).idCentro));
});

rutasHospital.put('/umbrales', gestionInventario, (req, res) => {
  configurarMinimo(personal(req), req.body ?? {});
  res.json(consultarInventario(personal(req).idCentro));
});

// ---- Convocatorias (RF22, RF23 — CU05) ----

rutasHospital.get('/convocatorias', (req, res) => {
  res.json(listarConvocatorias(personal(req).idCentro));
});

rutasHospital.post('/convocatorias/:id/reintentar', gestionInventario, (req, res) => {
  res.json(reintentarEnvios(personal(req), id(req.params.id)));
});

rutasHospital.post('/monitor/ejecutar', gestionInventario, (req, res) => {
  monitorearStock(personal(req).idCentro);
  auditar(req.usuario!.idUsuario, 'EJECUTAR_MONITOR', 'umbral_stock', null);
  res.json(listarConvocatorias(personal(req).idCentro));
});

// ---- Autoexclusiones (RF14): solo personal clínico ----

rutasHospital.get('/autoexclusiones', requiere('MEDICO', 'ADMINISTRADOR'), (req, res) => {
  res.json(listarAutoexclusiones(personal(req)));
});

rutasHospital.get('/cuestionario/definicion', requiere('MEDICO', 'ADMINISTRADOR'), (_req, res) => {
  res.json(definicionCuestionario());
});

// ---- Reglas de orientación vigentes (RNF11, solo lectura) ----

rutasHospital.get('/reglas', (_req, res) => {
  res.json(configReglas());
});
