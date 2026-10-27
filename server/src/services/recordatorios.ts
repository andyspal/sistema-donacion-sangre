import { todos } from '../db.ts';
import { URL_PUBLICA } from '../config.ts';
import { fechaHoraLocal } from '../util.ts';
import { enviarAviso } from './mensajeria.ts';
import { formato } from './turnos.ts';

interface TurnoPorRecordar {
  id_turno: number;
  id_donante: number;
  inicio: string;
  reservado_en: string;
  centro: string;
  domicilio: string;
  localidad: string;
  recordatorio_horas: number;
  email: string;
}

/**
 * Turnos reservados a los que corresponde enviar el recordatorio: empiezan dentro de la
 * anticipación elegida por el donante (24 o 48 h), todavía no se les envió y se reservaron
 * antes de que se abriera esa ventana (si no, la confirmación ya cumple ese rol).
 */
export function turnosPorRecordar(ahora = new Date()): TurnoPorRecordar[] {
  return todos<TurnoPorRecordar>(
    `SELECT t.id_turno, t.id_donante, a.inicio, t.reservado_en, c.nombre AS centro, c.domicilio, c.localidad,
            d.recordatorio_horas, u.email
     FROM turno t
     JOIN agenda_turno a ON a.id_agenda_turno = t.id_agenda_turno
     JOIN centro_hemoterapia c ON c.id_centro = a.id_centro
     JOIN donante d ON d.id_donante = t.id_donante
     JOIN usuario u ON u.id_usuario = d.id_usuario
     WHERE t.estado = 'RESERVADO' AND a.inicio > ? AND d.recordatorio_horas > 0 AND u.activo = 1
       AND NOT EXISTS (SELECT 1 FROM notificacion n WHERE n.id_turno = t.id_turno AND n.tipo = 'RECORDATORIO_TURNO')`,
    [fechaHoraLocal(ahora)],
  ).filter((t) => {
    const apertura = new Date(`${t.inicio}:00`).getTime() - t.recordatorio_horas * 3_600_000;
    return ahora.getTime() >= apertura && new Date(t.reservado_en).getTime() < apertura;
  });
}

/** Envía por correo los recordatorios de turno pendientes. Se ejecuta periódicamente. */
export async function enviarRecordatorios(ahora = new Date()) {
  const turnos = turnosPorRecordar(ahora);
  for (const t of turnos) {
    await enviarAviso({
      idDonante: t.id_donante,
      idTurno: t.id_turno,
      tipo: 'RECORDATORIO_TURNO',
      canal: 'EMAIL',
      destino: t.email,
      asunto: 'Recordatorio: tu turno para donar sangre',
      cuerpo: `Te esperamos en ${t.centro} (${t.domicilio}, ${t.localidad}) el ${formato(t.inicio)}. ` +
        'Llevá tu DNI, desayuná liviano y tomá bastante agua. Si no podés ir, cancelá el turno para liberar el lugar.',
      enlace: `${URL_PUBLICA}/app/turnos`,
    });
  }
  return turnos.length;
}
