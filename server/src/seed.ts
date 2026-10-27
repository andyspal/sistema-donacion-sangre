/**
 * Datos de demostración FICTICIOS. Credenciales de prueba (solo entorno local):
 *   Personal del centro (contraseña Hemored2026):
 *     medico@hemored.test       — Profesional médico
 *     admision@hemored.test     — Personal administrativo
 *     inventario@hemored.test   — Responsable de inventario
 *     direccion@hemored.test    — Administrador
 *   Donantes (contraseña Donante2026):
 *     lucia@hemored.test        — O-, orientación favorable, 2 donaciones previas
 *     martin@hemored.test       — A+, donó hace 30 días (intervalo no cumplido)
 *   Lucía tiene cargado un análisis de hace 8 meses: queda «Análisis detenido — vencido»
 *   (sirve para ver la leyenda en su panel y en el legajo del médico). En data/ quedan dos
 *   PDF ficticios para probar la carga: uno vigente y uno vencido.
 *
 * Uso: `npm run seed` reinicia la base y vuelve a sembrar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIR_CORREOS, DIR_DATOS, DIR_ESTUDIOS } from './config.ts';
import { ESQUEMA, db, ejecutar, transaccion } from './db.ts';
import { hashContrasena } from './seguridad.ts';
import { ahoraIso, fechaLocal, sumarDias } from './util.ts';
import { registrarConsentimiento } from './services/donantes.ts';
import { guardarCuestionario } from './services/cuestionario.ts';
import { generarOrientacion } from './services/orientacion.ts';
import { guardarEstudio, procesarEstudio } from './services/procesadorEstudios.ts';
import { generarEstudioEjemplo } from './estudioEjemplo.ts';

const CONTRASENA_PERSONAL = 'Hemored2026';
const CONTRASENA_DONANTE = 'Donante2026';

const respuestasSinCausales = (sexo: 'M' | 'F') => ({
  peso_kg: 68, se_siente_bien: true, infeccion_reciente: false, tatuaje: false, cirugia: false,
  transfusion: false, viaje_endemico: false, practicas_riesgo: false, odontologia: false,
  medicacion: ['ninguna'], antecedentes: ['ninguna'], ...(sexo === 'F' ? { embarazo: 'no' } : {}),
});

function crearUsuario(email: string, contrasena: string) {
  return ejecutar('INSERT INTO usuario (email, hash_contrasena, activo, creado_en) VALUES (?, ?, 1, ?)',
    [email, hashContrasena(contrasena), ahoraIso()]).id;
}

export async function sembrar() {
  const hoy = fechaLocal();

  const ids = transaccion(() => {
    // ---- Centros de hemoterapia ----
    const centros = [
      ['Centro Regional de Hemoterapia Córdoba', 'Av. Vélez Sarsfield 1500', 'Córdoba', '(0351) 000-1000'],
      ['Hospital Provincial Norte — Servicio de Hemoterapia', 'Bv. de los Andes 2200', 'Córdoba', '(0351) 000-2000'],
      ['Hospital Regional Villa María — Hemoterapia', 'Av. Sabattini 800', 'Villa María', '(0353) 000-3000'],
    ].map(([nombre, domicilio, localidad, telefono]) =>
      ejecutar('INSERT INTO centro_hemoterapia (nombre, domicilio, localidad, telefono, activo) VALUES (?, ?, ?, ?, 1)',
        [nombre, domicilio, localidad, telefono]).id);

    // ---- Agenda: 3 semanas de franjas de 30 minutos ----
    for (const idCentro of centros) {
      for (let i = 1; i <= 21; i++) {
        const fecha = sumarDias(hoy, i);
        const dia = new Date(`${fecha}T00:00`).getDay();
        if (dia === 0) continue;
        const [desde, hasta, cupo] = dia === 6 ? [8 * 60, 11 * 60, 2] : [7 * 60 + 30, 12 * 60, 3];
        for (let m = desde; m + 30 <= hasta; m += 30) {
          const hhmm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
          ejecutar('INSERT INTO agenda_turno (id_centro, inicio, fin, cupo_maximo, activa) VALUES (?, ?, ?, ?, 1)',
            [idCentro, `${fecha}T${hhmm(m)}`, `${fecha}T${hhmm(m + 30)}`, cupo]);
        }
      }
    }

    // ---- Personal del centro principal ----
    const personal: Record<string, number> = {};
    for (const [email, nombres, apellidos, rol, matricula] of [
      ['medico@hemored.test', 'Carla', 'Ibáñez', 'MEDICO', 'MP 30112'],
      ['admision@hemored.test', 'Diego', 'Sosa', 'ADMINISTRATIVO', null],
      ['inventario@hemored.test', 'Paula', 'Rinaldi', 'RESPONSABLE_INVENTARIO', null],
      ['direccion@hemored.test', 'Jorge', 'Medina', 'ADMINISTRADOR', null],
    ] as const) {
      const idUsuario = crearUsuario(email, CONTRASENA_PERSONAL);
      personal[rol] = ejecutar(
        'INSERT INTO personal (id_usuario, id_centro, nombres, apellidos, rol, matricula, activo) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [idUsuario, centros[0], nombres, apellidos, rol, matricula],
      ).id;
    }

    // ---- Donantes ficticios ----
    type Semilla = {
      email: string; dni: string; nombres: string; apellidos: string; nacimiento: string; sexo: 'M' | 'F';
      localidad: string; grupo: string; rh: string; convocatorias: boolean; donaciones: number[];
    };
    const semillas: Semilla[] = [
      { email: 'lucia@hemored.test', dni: '30111222', nombres: 'Lucía', apellidos: 'Fernández', nacimiento: '1994-03-12', sexo: 'F', localidad: 'Córdoba', grupo: 'O', rh: '-', convocatorias: true, donaciones: [-230, -110] },
      { email: 'martin@hemored.test', dni: '33444555', nombres: 'Martín', apellidos: 'Gómez', nacimiento: '1989-08-02', sexo: 'M', localidad: 'Córdoba', grupo: 'A', rh: '+', convocatorias: true, donaciones: [-30] },
      { email: 'sofia.ruiz@hemored.test', dni: '38222111', nombres: 'Sofía', apellidos: 'Ruiz', nacimiento: '1998-11-20', sexo: 'F', localidad: 'Córdoba', grupo: 'O', rh: '-', convocatorias: true, donaciones: [-150] },
      { email: 'tomas.diaz@hemored.test', dni: '35666777', nombres: 'Tomás', apellidos: 'Díaz', nacimiento: '1991-05-04', sexo: 'M', localidad: 'Córdoba', grupo: 'O', rh: '-', convocatorias: true, donaciones: [] },
      { email: 'valen.paz@hemored.test', dni: '40123456', nombres: 'Valentina', apellidos: 'Paz', nacimiento: '2001-02-14', sexo: 'F', localidad: 'Córdoba', grupo: 'O', rh: '-', convocatorias: false, donaciones: [] },
      { email: 'nico.ortiz@hemored.test', dni: '37888999', nombres: 'Nicolás', apellidos: 'Ortiz', nacimiento: '1993-09-30', sexo: 'M', localidad: 'Villa María', grupo: 'O', rh: '-', convocatorias: true, donaciones: [] },
      { email: 'ana.molina@hemored.test', dni: '32555444', nombres: 'Ana', apellidos: 'Molina', nacimiento: '1987-07-19', sexo: 'F', localidad: 'Córdoba', grupo: 'A', rh: '-', convocatorias: true, donaciones: [-200] },
      { email: 'bruno.vega@hemored.test', dni: '39444333', nombres: 'Bruno', apellidos: 'Vega', nacimiento: '1996-12-01', sexo: 'M', localidad: 'Córdoba', grupo: 'B', rh: '+', convocatorias: true, donaciones: [] },
    ];
    const donantes: { id: number; sexo: 'M' | 'F' }[] = [];
    for (const s of semillas) {
      const idUsuario = crearUsuario(s.email, CONTRASENA_DONANTE);
      const id = ejecutar(
        `INSERT INTO donante (id_usuario, dni, nombres, apellidos, fecha_nacimiento, sexo_biologico, telefono, domicilio, localidad, grupo_abo, factor_rh, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idUsuario, s.dni, s.nombres, s.apellidos, s.nacimiento, s.sexo, '351 000 0000', null, s.localidad, s.grupo, s.rh, ahoraIso()],
      ).id;
      registrarConsentimiento(id, 'DATOS_SALUD', true);
      registrarConsentimiento(id, 'CONVOCATORIAS', s.convocatorias);
      guardarCuestionario(id, respuestasSinCausales(s.sexo), s.sexo);
      for (const dias of s.donaciones) {
        const fecha = `${sumarDias(hoy, dias)}T09:00`;
        const idEval = ejecutar(
          `INSERT INTO evaluacion_presencial (id_donante, id_centro, id_personal, resultado, evaluada_en) VALUES (?, ?, ?, 'APTO', ?)`,
          [id, centros[0], personal.MEDICO, `${sumarDias(hoy, dias)}T12:00:00.000Z`],
        ).id;
        ejecutar(
          `INSERT INTO donacion (id_donante, id_centro, id_evaluacion_presencial, fecha_hora, volumen_ml, registrada_en) VALUES (?, ?, ?, ?, 450, ?)`,
          [id, centros[0], idEval, fecha, `${sumarDias(hoy, dias)}T12:30:00.000Z`],
        );
      }
      donantes.push({ id, sexo: s.sexo });
    }

    // ---- Inventario y niveles mínimos del centro principal ----
    const minimos: Record<string, Record<string, number>> = {
      GLOBULOS_ROJOS: { 'O+': 20, 'O-': 8, 'A+': 15, 'A-': 6, 'B+': 6, 'B-': 3, 'AB+': 3, 'AB-': 2 },
      PLAQUETAS: { 'O+': 8, 'O-': 3, 'A+': 6, 'A-': 2, 'B+': 3, 'B-': 1, 'AB+': 1, 'AB-': 1 },
      PLASMA: { 'O+': 15, 'O-': 5, 'A+': 12, 'A-': 4, 'B+': 5, 'B-': 2, 'AB+': 4, 'AB-': 2 },
    };
    // Existencias: holgadas en general, O- de glóbulos rojos apenas por encima del mínimo
    // y B- de glóbulos rojos ya por debajo (dispara una alerta al iniciar).
    const existencias: Record<string, Record<string, number>> = {
      GLOBULOS_ROJOS: { 'O+': 34, 'O-': 9, 'A+': 27, 'A-': 8, 'B+': 10, 'B-': 1, 'AB+': 5, 'AB-': 3 },
      PLAQUETAS: { 'O+': 12, 'O-': 4, 'A+': 9, 'A-': 3, 'B+': 5, 'B-': 2, 'AB+': 2, 'AB-': 1 },
      PLASMA: { 'O+': 40, 'O-': 9, 'A+': 31, 'A-': 7, 'B+': 11, 'B-': 4, 'AB+': 9, 'AB-': 3 },
    };
    const vida: Record<string, number[]> = { GLOBULOS_ROJOS: [12, 30], PLAQUETAS: [2, 4], PLASMA: [120, 300] };
    for (const [componente, porGrupo] of Object.entries(minimos)) {
      for (const [grupoRh, minimo] of Object.entries(porGrupo)) {
        const grupo = grupoRh.slice(0, -1);
        const rh = grupoRh.slice(-1);
        ejecutar('INSERT INTO umbral_stock (id_centro, componente, grupo_abo, factor_rh, minimo_unidades, activo) VALUES (?, ?, ?, ?, ?, 1)',
          [centros[0], componente, grupo, rh, minimo]);
        const total = existencias[componente][grupoRh];
        const primera = Math.ceil(total / 2);
        for (const [cantidad, dias] of [[primera, vida[componente][0]], [total - primera, vida[componente][1]]]) {
          if (cantidad <= 0) continue;
          ejecutar(
            `INSERT INTO existencia_hemocomponente (id_centro, componente, grupo_abo, factor_rh, fecha_vencimiento, cantidad_unidades, actualizada_en)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [centros[0], componente, grupo, rh, sumarDias(hoy, dias), cantidad, ahoraIso()],
          );
        }
      }
    }
    return { donantes };
  });

  // Estudios de ejemplo (ficticios): uno vigente para cargar desde la PWA y uno vencido.
  generarEstudioEjemplo(path.join(DIR_DATOS, 'estudio-ejemplo-lucia.pdf'), {
    paciente: 'FERNANDEZ LUCIA', dni: '30111222', fecha: sumarDias(hoy, -12),
  });
  const vencido = path.join(DIR_DATOS, 'estudio-ejemplo-vencido.pdf');
  generarEstudioEjemplo(vencido, { paciente: 'FERNANDEZ LUCIA', dni: '30111222', fecha: sumarDias(hoy, -240) });
  const idVencido = guardarEstudio(ids.donantes[0].id,
    { originalname: 'analisis-marzo.pdf', mimetype: 'application/pdf', buffer: fs.readFileSync(vencido) });
  await procesarEstudio(idVencido);

  // Orientaciones iniciales (usa el mismo motor de reglas que la PWA).
  for (const d of ids.donantes) await generarOrientacion(d.id);
  console.log('Datos de demostración sembrados.');
}

/** Elimina todas las tablas y los estudios cifrados (solo desarrollo). */
function reiniciar() {
  const tablas = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((t) => t.name);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tablas) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(ESQUEMA);
  fs.rmSync(DIR_ESTUDIOS, { recursive: true, force: true });
  fs.mkdirSync(DIR_ESTUDIOS, { recursive: true });
  fs.rmSync(path.join(DIR_DATOS, 'bandeja-salida.log'), { force: true });
  fs.rmSync(DIR_CORREOS, { recursive: true, force: true });
}

if (import.meta.main && process.argv.includes('--reset')) {
  reiniciar();
  await sembrar();
}
