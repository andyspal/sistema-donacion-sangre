import fs from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { DIR_CORREOS, SMTP, URL_PUBLICA } from '../config.ts';

export interface Correo {
  para: string;
  asunto: string;
  cuerpo: string;
  enlace?: string | null;
  /** Texto del botón que lleva al enlace. */
  accion?: string;
  /** Botón rojo de campaña (convocatorias) en lugar del azul institucional. */
  destacado?: boolean;
}

// Paleta institucional (Poncho, argentina.gob.ar).
const AZUL = '#232D4F';
const ROJO = '#C62828';
const CELESTE = '#75AADB';
const GRIS = '#555555';

let transporte: Transporter | undefined;

/** SMTP real si está configurado; si no, nodemailer arma el mensaje y se guarda como .eml (desarrollo). */
function obtenerTransporte(): Transporter {
  transporte ??= SMTP.host
    ? nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.puerto,
      secure: SMTP.seguro,
      auth: SMTP.usuario ? { user: SMTP.usuario, pass: SMTP.contrasena } : undefined,
    })
    : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  return transporte;
}

export const modoCorreo = (): 'SMTP' | 'ARCHIVO' => (SMTP.host ? 'SMTP' : 'ARCHIVO');

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Versión HTML y de texto del correo. Nunca incluye información clínica (RNF03). */
export function plantilla(c: Correo): { text: string; html: string } {
  const perfil = `${URL_PUBLICA}/app/perfil`;
  const pie = 'Este mensaje no contiene información clínica. Podés elegir qué avisos recibir por correo desde tu perfil.';
  const text = [c.asunto, '', c.cuerpo, ...(c.enlace ? ['', `${c.accion ?? 'Abrir HemoRed'}: ${c.enlace}`] : []), '', '—', pie, perfil].join('\n');
  const boton = c.enlace
    ? `<p style="margin:28px 0 8px"><a href="${escapar(c.enlace)}" style="display:inline-block;background:${c.destacado ? ROJO : AZUL};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px">${escapar(c.accion ?? 'Abrir HemoRed')}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapar(c.asunto)}</title></head>
<body style="margin:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif;color:#141414">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:${AZUL};padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">
          <span style="color:${ROJO}">&#9679;</span> HemoRed
          <div style="font-size:12px;font-weight:400;opacity:.85;margin-top:2px">Donación voluntaria de sangre</div>
        </td></tr>
        <tr><td style="height:4px;background:${CELESTE}"></td></tr>
        <tr><td style="padding:28px 24px 20px">
          <h1 style="margin:0 0 12px;font-size:20px;color:${AZUL}">${escapar(c.asunto)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.55">${escapar(c.cuerpo)}</p>
          ${boton}
        </td></tr>
        <tr><td style="padding:16px 24px 24px;border-top:1px solid #DEE2E6;font-size:12px;line-height:1.5;color:${GRIS}">
          ${escapar(pie)} <a href="${escapar(perfil)}" style="color:${AZUL}">Preferencias de avisos</a><br>
          Ley 22.990 de Sangre · Ley 25.326 de Protección de Datos Personales
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

export async function enviarCorreo(c: Correo): Promise<void> {
  const { text, html } = plantilla(c);
  const info = await obtenerTransporte().sendMail({ from: SMTP.remitente, to: c.para, subject: c.asunto, text, html });
  if (!SMTP.host) {
    fs.mkdirSync(DIR_CORREOS, { recursive: true });
    const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${c.para.replace(/[^a-z0-9@._-]/gi, '_')}.eml`;
    fs.writeFileSync(path.join(DIR_CORREOS, nombre), (info as { message: Buffer }).message);
  }
}
