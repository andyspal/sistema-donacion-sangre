import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS } from '../config.ts';
import { ejecutar, uno } from '../db.ts';
import { ahoraIso } from '../util.ts';

export type Canal = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type TipoNotificacion = 'CONVOCATORIA' | 'CONFIRMACION_TURNO' | 'CANCELACION_TURNO';
export type EstadoEnvio = 'ENVIADO' | 'FALLIDO';

interface Aviso {
  idDonante: number;
  tipo: TipoNotificacion;
  canal: Canal;
  destino: string;
  asunto: string;
  cuerpo: string;
  enlace?: string;
  idConvocatoria?: number;
}

const BANDEJA = path.join(DIR_DATOS, 'bandeja-salida.log');

/**
 * Adaptador del servicio de mensajería externo (correo, SMS, WhatsApp).
 * En el MVP simula la pasarela: escribe el mensaje en data/bandeja-salida.log
 * y lo deja visible en la bandeja de avisos de la PWA. Con MENSAJERIA_FALLA=1
 * simula la caída del proveedor para probar el flujo alternativo.
 * Los mensajes nunca incluyen información clínica (RNF03).
 */
function entregar(id: number, destino: string): EstadoEnvio {
  const n = uno<{ canal: string; asunto: string; cuerpo: string; enlace: string | null }>(
    'SELECT canal, asunto, cuerpo, enlace FROM notificacion WHERE id_notificacion = ?', [id],
  )!;
  let estado: EstadoEnvio = 'ENVIADO';
  try {
    if (process.env.MENSAJERIA_FALLA === '1') throw new Error('Proveedor no disponible');
    fs.appendFileSync(BANDEJA,
      `[${ahoraIso()}] ${n.canal} → ${destino}\n  ${n.asunto}\n  ${n.cuerpo}${n.enlace ? `\n  ${n.enlace}` : ''}\n\n`);
  } catch {
    estado = 'FALLIDO';
  }
  ejecutar('UPDATE notificacion SET estado = ?, enviada_en = ? WHERE id_notificacion = ?',
    [estado, estado === 'ENVIADO' ? ahoraIso() : null, id]);
  return estado;
}

export function enviarAviso(aviso: Aviso): EstadoEnvio {
  const { id } = ejecutar(
    `INSERT INTO notificacion (id_convocatoria, id_donante, tipo, canal, asunto, cuerpo, enlace, estado, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`,
    [aviso.idConvocatoria ?? null, aviso.idDonante, aviso.tipo, aviso.canal, aviso.asunto, aviso.cuerpo, aviso.enlace ?? null, ahoraIso()],
  );
  return entregar(id, aviso.destino);
}

/** Reintenta una notificación pendiente o fallida. */
export const reintentarAviso = (idNotificacion: number, destino: string) => entregar(idNotificacion, destino);
