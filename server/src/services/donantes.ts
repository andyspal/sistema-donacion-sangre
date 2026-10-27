import { ejecutar, todos, uno } from '../db.ts';
import { VERSION_CONSENTIMIENTO } from '../config.ts';
import { ahoraIso } from '../util.ts';

export interface FilaDonante {
  id_donante: number;
  id_usuario: number;
  dni: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo_biologico: 'M' | 'F';
  telefono: string;
  domicilio: string | null;
  localidad: string;
  grupo_abo: 'A' | 'B' | 'AB' | 'O' | null;
  factor_rh: '+' | '-' | null;
  creado_en: string;
  correo_turnos: 0 | 1;
  recordatorio_horas: 0 | 24 | 48;
}

export type TipoConsentimiento = 'DATOS_SALUD' | 'CONVOCATORIAS';

export const obtenerDonante = (idDonante: number) =>
  uno<FilaDonante>('SELECT * FROM donante WHERE id_donante = ?', [idDonante]);

/** Estado vigente de cada consentimiento: el último registro de cada tipo (RF02). */
export function consentimientos(idDonante: number): Record<TipoConsentimiento, { otorgado: boolean; fecha: string | null }> {
  const filas = todos<{ tipo: TipoConsentimiento; otorgado: number; otorgado_en: string }>(
    `SELECT c.tipo, c.otorgado, c.otorgado_en FROM consentimiento c
     WHERE c.id_donante = ? AND c.id_consentimiento = (
       SELECT MAX(id_consentimiento) FROM consentimiento WHERE id_donante = c.id_donante AND tipo = c.tipo)`,
    [idDonante],
  );
  const estado = {
    DATOS_SALUD: { otorgado: false, fecha: null },
    CONVOCATORIAS: { otorgado: false, fecha: null },
  } as Record<TipoConsentimiento, { otorgado: boolean; fecha: string | null }>;
  for (const f of filas) estado[f.tipo] = { otorgado: !!f.otorgado, fecha: f.otorgado_en };
  return estado;
}

export function registrarConsentimiento(idDonante: number, tipo: TipoConsentimiento, otorgado: boolean) {
  return ejecutar(
    'INSERT INTO consentimiento (id_donante, tipo, otorgado, version_documento, otorgado_en) VALUES (?, ?, ?, ?, ?)',
    [idDonante, tipo, otorgado ? 1 : 0, VERSION_CONSENTIMIENTO, ahoraIso()],
  ).id;
}

export function perfilPublico(d: FilaDonante, email: string) {
  return {
    id: d.id_donante,
    email,
    dni: d.dni,
    nombres: d.nombres,
    apellidos: d.apellidos,
    fechaNacimiento: d.fecha_nacimiento,
    sexoBiologico: d.sexo_biologico,
    telefono: d.telefono,
    domicilio: d.domicilio,
    localidad: d.localidad,
    grupoAbo: d.grupo_abo,
    factorRh: d.factor_rh,
    preferencias: { correoTurnos: !!d.correo_turnos, recordatorioHoras: d.recordatorio_horas },
  };
}
