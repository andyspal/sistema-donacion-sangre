import crypto from 'node:crypto';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import { ErrorHttp, ahoraIso } from '../util.ts';

export const PROCEDIMIENTO = {
  titulo: 'Autoexclusión confidencial',
  norma: 'Resolución 536/2026 del Ministerio de Salud de la Nación',
  pasos: [
    'Si después de donar pensás que tu sangre no debería usarse —por ejemplo, porque recordaste una situación de riesgo que no declaraste— podés pedir que tu unidad no se utilice.',
    'No necesitás explicar el motivo. La solicitud es confidencial y solo la ve el personal autorizado del banco de sangre.',
    'Cuanto antes la envíes, más probable es que la unidad todavía no se haya procesado o transfundido.',
    'La autoexclusión no te sanciona ni te impide volver a donar: el profesional puede contactarte para orientarte.',
  ],
};

interface FilaDonacion {
  id_donacion: number;
  fecha_hora: string;
  volumen_ml: number;
  centro: string;
  id_autoexclusion: number | null;
  confirmada_en: string | null;
}

/** RF10 / CU06 — donaciones del donante y si ya tienen una autoexclusión registrada. */
export function donacionesDelDonante(idDonante: number) {
  return todos<FilaDonacion>(
    `SELECT d.id_donacion, d.fecha_hora, d.volumen_ml, c.nombre AS centro, ax.id_autoexclusion, ax.confirmada_en
     FROM donacion d JOIN centro_hemoterapia c ON c.id_centro = d.id_centro
     LEFT JOIN autoexclusion ax ON ax.id_donacion = d.id_donacion
     WHERE d.id_donante = ? ORDER BY d.fecha_hora DESC`, [idDonante],
  ).map((d) => ({
    id: d.id_donacion,
    fechaHora: d.fecha_hora,
    volumenMl: d.volumen_ml,
    centro: d.centro,
    autoexclusionSolicitada: d.id_autoexclusion !== null,
    autoexclusionEn: d.confirmada_en,
  }));
}

/** CU06 — Solicitar autoexclusión confidencial (RF14). */
export function registrarAutoexclusion(idUsuario: number, idDonante: number, idDonacion: number) {
  return transaccion(() => {
    const donacion = uno<{ id_donante: number }>('SELECT id_donante FROM donacion WHERE id_donacion = ?', [idDonacion]);
    if (!donacion || donacion.id_donante !== idDonante) {
      throw new ErrorHttp(404, 'DONACION_INVALIDA', 'No encontramos esa donación entre las tuyas.');
    }
    if (uno('SELECT 1 FROM autoexclusion WHERE id_donacion = ?', [idDonacion])) {
      throw new ErrorHttp(409, 'DUPLICADO', 'Ya registramos una solicitud de autoexclusión para esa donación.');
    }
    const codigo = `AX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const confirmadaEn = ahoraIso();
    const { id } = ejecutar(
      'INSERT INTO autoexclusion (id_donacion, codigo_acuse, confirmada_en) VALUES (?, ?, ?)',
      [idDonacion, codigo, confirmadaEn],
    );
    auditar(idUsuario, 'SOLICITAR_AUTOEXCLUSION', 'autoexclusion', id);
    return { codigoAcuse: codigo, confirmadaEn };
  });
}
