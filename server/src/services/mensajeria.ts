import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS } from '../config.ts';
import { ejecutar, uno } from '../db.ts';
import { ahoraIso } from '../util.ts';
import { enviarCorreo } from './correo.ts';

/** APP: el aviso solo queda en la bandeja de la PWA (el donante no quiere ese correo). */
export type Canal = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'APP';
export type TipoNotificacion = 'CONVOCATORIA' | 'CONFIRMACION_TURNO' | 'RECORDATORIO_TURNO' | 'CANCELACION_TURNO';
export type EstadoEnvio = 'ENVIADO' | 'FALLIDO';

export interface Aviso {
  idDonante: number;
  tipo: TipoNotificacion;
  canal: Canal;
  destino: string;
  asunto: string;
  cuerpo: string;
  enlace?: string;
  idConvocatoria?: number;
  idTurno?: number;
}

const BANDEJA = path.join(DIR_DATOS, 'bandeja-salida.log');

const ACCION: Record<TipoNotificacion, string> = {
  CONVOCATORIA: 'Reservar turno',
  CONFIRMACION_TURNO: 'Ver mi turno',
  RECORDATORIO_TURNO: 'Ver mi turno',
  CANCELACION_TURNO: 'Reservar otro turno',
};

/**
 * Registra el aviso: queda visible en la bandeja de avisos de la PWA y pendiente
 * de entrega por el canal externo. Los mensajes nunca incluyen información clínica (RNF03).
 */
export function registrarAviso(aviso: Aviso): number {
  const soloApp = aviso.canal === 'APP';
  return ejecutar(
    `INSERT INTO notificacion (id_convocatoria, id_donante, id_turno, tipo, canal, asunto, cuerpo, enlace, estado, enviada_en, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [aviso.idConvocatoria ?? null, aviso.idDonante, aviso.idTurno ?? null, aviso.tipo, aviso.canal, aviso.asunto, aviso.cuerpo,
      aviso.enlace ?? null, soloApp ? 'ENVIADO' : 'PENDIENTE', soloApp ? ahoraIso() : null, ahoraIso()],
  ).id;
}

/**
 * Adaptador de los servicios de mensajería externos. El correo se envía por SMTP
 * (o se guarda como .eml en desarrollo); SMS y WhatsApp siguen simulados en
 * data/bandeja-salida.log. Con MENSAJERIA_FALLA=1 se simula la caída del proveedor.
 */
export async function entregar(id: number, destino: string): Promise<EstadoEnvio> {
  const n = uno<{ tipo: TipoNotificacion; canal: Canal; asunto: string; cuerpo: string; enlace: string | null }>(
    'SELECT tipo, canal, asunto, cuerpo, enlace FROM notificacion WHERE id_notificacion = ?', [id],
  );
  if (!n) return 'FALLIDO';
  if (n.canal === 'APP') return 'ENVIADO';
  let estado: EstadoEnvio = 'ENVIADO';
  try {
    if (process.env.MENSAJERIA_FALLA === '1') throw new Error('Proveedor no disponible');
    if (n.canal === 'EMAIL') {
      await enviarCorreo({
        para: destino, asunto: n.asunto, cuerpo: n.cuerpo, enlace: n.enlace,
        accion: ACCION[n.tipo], destacado: n.tipo === 'CONVOCATORIA',
      });
    }
    fs.appendFileSync(BANDEJA,
      `[${ahoraIso()}] ${n.canal} → ${destino}\n  ${n.asunto}\n  ${n.cuerpo}${n.enlace ? `\n  ${n.enlace}` : ''}\n\n`);
  } catch (error) {
    console.error(`Mensajería: no se pudo entregar el aviso ${id}:`, (error as Error).message);
    estado = 'FALLIDO';
  }
  ejecutar('UPDATE notificacion SET estado = ?, enviada_en = ? WHERE id_notificacion = ?',
    [estado, estado === 'ENVIADO' ? ahoraIso() : null, id]);
  return estado;
}

/** Registra y entrega un aviso. El registro es inmediato; la entrega, asincrónica. */
export async function enviarAviso(aviso: Aviso): Promise<EstadoEnvio> {
  return entregar(registrarAviso(aviso), aviso.destino);
}

/** Envío en segundo plano: un error de mensajería nunca afecta la operación que lo originó. */
export function avisarEnSegundoPlano(aviso: Aviso) {
  enviarAviso(aviso).catch((error) => console.error('Mensajería:', (error as Error).message));
}

/** Reintenta una notificación pendiente o fallida. */
export const reintentarAviso = (idNotificacion: number, destino: string) => entregar(idNotificacion, destino);
