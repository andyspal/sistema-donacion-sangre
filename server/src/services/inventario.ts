import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { auditar } from '../auditoria.ts';
import type { UsuarioSesion } from '../auth.ts';
import { URL_PUBLICA } from '../config.ts';
import { ErrorHttp, ahoraIso, esFecha, fechaLocal, normalizar } from '../util.ts';
import { verificarIntervalosDonante } from './intervalos.ts';
import { entregar, registrarAviso, reintentarAviso } from './mensajeria.ts';

export const COMPONENTES = ['GLOBULOS_ROJOS', 'PLAQUETAS', 'PLASMA'] as const;
export const GRUPOS = ['O', 'A', 'B', 'AB'] as const;
export const FACTORES = ['+', '-'] as const;
type Componente = (typeof COMPONENTES)[number];

const esComponente = (v: unknown): v is Componente => COMPONENTES.includes(v as Componente);

// ---------------------------------------------------------------------------
// CU04 — Consultar inventario (RF19)
// ---------------------------------------------------------------------------

export function consultarInventario(idCentro: number) {
  const hoy = fechaLocal();
  const umbrales = todos<{ id_umbral_stock: number; componente: Componente; grupo_abo: string; factor_rh: string; minimo_unidades: number }>(
    'SELECT * FROM umbral_stock WHERE id_centro = ? AND activo = 1', [idCentro],
  );
  const lotes = todos<{ id_existencia: number; componente: Componente; grupo_abo: string; factor_rh: string; fecha_vencimiento: string; cantidad_unidades: number; actualizada_en: string }>(
    'SELECT * FROM existencia_hemocomponente WHERE id_centro = ? ORDER BY fecha_vencimiento', [idCentro],
  );
  const filas = [];
  for (const componente of COMPONENTES) {
    for (const grupo of GRUPOS) {
      for (const rh of FACTORES) {
        const propios = lotes.filter((l) => l.componente === componente && l.grupo_abo === grupo && l.factor_rh === rh);
        const disponibles = propios.filter((l) => l.fecha_vencimiento >= hoy).reduce((s, l) => s + l.cantidad_unidades, 0);
        const umbral = umbrales.find((u) => u.componente === componente && u.grupo_abo === grupo && u.factor_rh === rh);
        filas.push({
          componente, grupo, rh, disponibles,
          minimo: umbral?.minimo_unidades ?? null,
          idUmbral: umbral?.id_umbral_stock ?? null,
          critico: umbral ? disponibles < umbral.minimo_unidades : false,
          lotes: propios.map((l) => ({
            id: l.id_existencia, cantidad: l.cantidad_unidades, vencimiento: l.fecha_vencimiento,
            vencido: l.fecha_vencimiento < hoy, actualizadaEn: l.actualizada_en,
          })),
        });
      }
    }
  }
  return filas;
}

// ---------------------------------------------------------------------------
// CU04 — Actualizar existencias (RF18) y niveles mínimos (RF20)
// ---------------------------------------------------------------------------

function validarLote(datos: { cantidad?: unknown; fechaVencimiento?: unknown }) {
  const errores: Record<string, string> = {};
  const cantidad = Number(datos.cantidad);
  if (datos.cantidad === undefined || datos.cantidad === '' || !Number.isInteger(cantidad)) errores.cantidad = 'Cantidad obligatoria';
  else if (cantidad < 0) errores.cantidad = 'La cantidad no puede ser negativa';
  if (!esFecha(datos.fechaVencimiento)) errores.fechaVencimiento = 'Fecha de vencimiento obligatoria';
  if (Object.keys(errores).length) throw new ErrorHttp(422, 'VALIDACION', 'Revisá los datos del hemocomponente.', { errores });
  return { cantidad, fechaVencimiento: datos.fechaVencimiento as string };
}

export function actualizarExistencia(usuario: UsuarioSesion & { idCentro: number }, idExistencia: number, datos: { cantidad?: unknown; fechaVencimiento?: unknown }) {
  const { cantidad, fechaVencimiento } = validarLote(datos);
  transaccion(() => {
    const lote = uno<{ id_centro: number; cantidad_unidades: number }>('SELECT id_centro, cantidad_unidades FROM existencia_hemocomponente WHERE id_existencia = ?', [idExistencia]);
    if (!lote || lote.id_centro !== usuario.idCentro) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El registro de inventario no existe.');
    ejecutar('UPDATE existencia_hemocomponente SET cantidad_unidades = ?, fecha_vencimiento = ?, actualizada_en = ? WHERE id_existencia = ?',
      [cantidad, fechaVencimiento, ahoraIso(), idExistencia]);
    auditar(usuario.idUsuario, 'ACTUALIZAR_EXISTENCIA', 'existencia_hemocomponente', idExistencia,
      { anterior: lote.cantidad_unidades, nueva: cantidad, fechaVencimiento });
  });
  // Evento asincrónico al Monitor de Stock (dispara CU05 si corresponde).
  setImmediate(() => monitorearStock(usuario.idCentro));
}

export function agregarLote(usuario: UsuarioSesion & { idCentro: number }, datos: { componente?: unknown; grupo?: unknown; rh?: unknown; cantidad?: unknown; fechaVencimiento?: unknown }) {
  const { cantidad, fechaVencimiento } = validarLote(datos);
  if (!esComponente(datos.componente) || !GRUPOS.includes(datos.grupo as never) || !FACTORES.includes(datos.rh as never)) {
    throw new ErrorHttp(422, 'VALIDACION', 'Indicá componente, grupo y factor Rh.');
  }
  const id = transaccion(() => {
    const { id } = ejecutar(
      `INSERT INTO existencia_hemocomponente (id_centro, componente, grupo_abo, factor_rh, fecha_vencimiento, cantidad_unidades, actualizada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.idCentro, datos.componente as string, datos.grupo as string, datos.rh as string, fechaVencimiento, cantidad, ahoraIso()],
    );
    auditar(usuario.idUsuario, 'AGREGAR_EXISTENCIA', 'existencia_hemocomponente', id, { cantidad });
    return id;
  });
  setImmediate(() => monitorearStock(usuario.idCentro));
  return { id };
}

export function configurarMinimo(usuario: UsuarioSesion & { idCentro: number }, datos: { componente?: unknown; grupo?: unknown; rh?: unknown; minimo?: unknown }) {
  const minimo = Number(datos.minimo);
  if (!Number.isInteger(minimo) || minimo < 0) throw new ErrorHttp(422, 'VALIDACION', 'El mínimo debe ser un entero no negativo.');
  if (!esComponente(datos.componente) || !GRUPOS.includes(datos.grupo as never) || !FACTORES.includes(datos.rh as never)) {
    throw new ErrorHttp(422, 'VALIDACION', 'Indicá componente, grupo y factor Rh.');
  }
  transaccion(() => {
    ejecutar(
      `INSERT INTO umbral_stock (id_centro, componente, grupo_abo, factor_rh, minimo_unidades, activo) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT (id_centro, componente, grupo_abo, factor_rh) DO UPDATE SET minimo_unidades = excluded.minimo_unidades, activo = 1`,
      [usuario.idCentro, datos.componente as string, datos.grupo as string, datos.rh as string, minimo],
    );
    auditar(usuario.idUsuario, 'CONFIGURAR_MINIMO', 'umbral_stock', null, datos);
  });
  setImmediate(() => monitorearStock(usuario.idCentro));
}

// ---------------------------------------------------------------------------
// CU05 — Monitor de stock, selección de donantes y envío de convocatorias
// ---------------------------------------------------------------------------

/** Compara existencias vigentes contra los mínimos (RF21) y genera o atiende alertas. */
export function monitorearStock(idCentro: number) {
  const hoy = fechaLocal();
  const umbrales = todos<{ id_umbral_stock: number; componente: string; grupo_abo: string; factor_rh: string; minimo_unidades: number; disponibles: number }>(
    `SELECT u.*, COALESCE((SELECT SUM(e.cantidad_unidades) FROM existencia_hemocomponente e
              WHERE e.id_centro = u.id_centro AND e.componente = u.componente AND e.grupo_abo = u.grupo_abo
                AND e.factor_rh = u.factor_rh AND e.fecha_vencimiento >= ?), 0) AS disponibles
     FROM umbral_stock u WHERE u.id_centro = ? AND u.activo = 1`, [hoy, idCentro],
  );
  for (const u of umbrales) {
    const activa = uno<{ id_alerta_stock: number }>(
      `SELECT id_alerta_stock FROM alerta_stock WHERE id_umbral_stock = ? AND estado = 'ACTIVA'`, [u.id_umbral_stock],
    );
    if (u.disponibles < u.minimo_unidades && !activa) {
      generarAlerta(idCentro, u);
    } else if (u.disponibles < u.minimo_unidades && activa) {
      // El faltante sigue: se suma a quien haya quedado habilitado desde la última revisión.
      const cv = uno<{ id_convocatoria: number }>(
        `SELECT id_convocatoria FROM convocatoria WHERE id_alerta_stock = ? AND estado <> 'CERRADA'`, [activa.id_alerta_stock],
      );
      if (cv) convocarPendientes(idCentro, cv.id_convocatoria, u.grupo_abo, u.factor_rh);
    } else if (u.disponibles >= u.minimo_unidades && activa) {
      transaccion(() => {
        ejecutar(`UPDATE alerta_stock SET estado = 'ATENDIDA', atendida_en = ? WHERE id_alerta_stock = ?`, [ahoraIso(), activa.id_alerta_stock]);
        ejecutar(`UPDATE convocatoria SET estado = 'CERRADA', cerrada_en = ? WHERE id_alerta_stock = ? AND estado <> 'CERRADA'`,
          [ahoraIso(), activa.id_alerta_stock]);
      });
    }
  }
}

/** RF22 — donantes compatibles, habilitados, con orientación favorable, cercanos y que aceptaron convocatorias. */
export function seleccionarCandidatos(idCentro: number, grupo: string, rh: string) {
  const centro = uno<{ localidad: string }>('SELECT localidad FROM centro_hemoterapia WHERE id_centro = ?', [idCentro])!;
  const candidatos = todos<{ id_donante: number; nombres: string; sexo_biologico: 'M' | 'F'; localidad: string; telefono: string | null; email: string | null; resultado: string | null; consiente: number | null; turno_activo: number }>(
    `SELECT d.id_donante, d.nombres, d.sexo_biologico, d.localidad, d.telefono, u.email,
            (SELECT o.resultado FROM orientacion o WHERE o.id_donante = d.id_donante ORDER BY o.id_orientacion DESC LIMIT 1) AS resultado,
            (SELECT c.otorgado FROM consentimiento c WHERE c.id_donante = d.id_donante AND c.tipo = 'CONVOCATORIAS'
              ORDER BY c.id_consentimiento DESC LIMIT 1) AS consiente,
            EXISTS (SELECT 1 FROM turno t JOIN agenda_turno a ON a.id_agenda_turno = t.id_agenda_turno
                    WHERE t.id_donante = d.id_donante AND t.estado = 'RESERVADO' AND a.inicio > ?) AS turno_activo
     FROM donante d JOIN usuario u ON u.id_usuario = d.id_usuario
     WHERE u.activo = 1 AND d.grupo_abo = ? AND d.factor_rh = ?`,
    [`${fechaLocal()}T00:00`, grupo, rh],
  );
  return candidatos.filter((c) =>
    c.consiente === 1                                         // RF02: autorizó recibir convocatorias
    && c.email && c.telefono                                  // datos completos para contactarlo
    && c.resultado === 'FAVORABLE'                            // orientación previa registrada
    && !c.turno_activo                                        // ya tiene turno: no se lo vuelve a convocar
    && normalizar(c.localidad) === normalizar(centro.localidad) // cercanía al centro
    && verificarIntervalosDonante(c.id_donante, c.sexo_biologico).cumplido); // RF07
}

const NOMBRE_COMPONENTE: Record<string, string> = {
  GLOBULOS_ROJOS: 'glóbulos rojos', PLAQUETAS: 'plaquetas', PLASMA: 'plasma',
};

function generarAlerta(idCentro: number, u: { id_umbral_stock: number; grupo_abo: string; factor_rh: string; disponibles: number }) {
  const idConvocatoria = transaccion(() => {
    const { id: idAlerta } = ejecutar(
      `INSERT INTO alerta_stock (id_umbral_stock, cantidad_detectada, estado, detectada_en) VALUES (?, ?, 'ACTIVA', ?)`,
      [u.id_umbral_stock, u.disponibles, ahoraIso()],
    );
    const { id } = ejecutar(
      `INSERT INTO convocatoria (id_alerta_stock, id_centro, estado, creada_en) VALUES (?, ?, 'SIN_DESTINATARIOS', ?)`,
      [idAlerta, idCentro, ahoraIso()],
    );
    return id;
  });
  const destinatarios = convocarPendientes(idCentro, idConvocatoria, u.grupo_abo, u.factor_rh);
  auditar(null, 'GENERAR_CONVOCATORIA', 'convocatoria', idConvocatoria, { destinatarios });
}

/**
 * Avisa a los candidatos que todavía no recibieron esta convocatoria: al crearla y en cada
 * revisión mientras dure el faltante, así también llega a quien se registró o quedó
 * habilitado después. Nadie recibe dos veces el mismo llamado. Devuelve cuántos sumó.
 */
function convocarPendientes(idCentro: number, idConvocatoria: number, grupo: string, rh: string): number {
  const { destinatarios, centro } = transaccion(() => {
    const avisados = new Set(todos<{ id_donante: number }>(
      'SELECT id_donante FROM notificacion WHERE id_convocatoria = ?', [idConvocatoria],
    ).map((n) => n.id_donante));
    const destinatarios = seleccionarCandidatos(idCentro, grupo, rh).filter((c) => !avisados.has(c.id_donante));
    if (destinatarios.length) {
      ejecutar(`UPDATE convocatoria SET estado = 'ABIERTA' WHERE id_convocatoria = ? AND estado = 'SIN_DESTINATARIOS'`, [idConvocatoria]);
    }
    const centro = uno<{ nombre: string }>('SELECT nombre FROM centro_hemoterapia WHERE id_centro = ?', [idCentro])!.nombre;
    return { destinatarios, centro };
  });
  if (!destinatarios.length) return 0;

  // RF23 — un aviso por destinatario, sin información sensible (RNF03): queda en la bandeja
  // de avisos de la PWA y además se envía por correo, de a uno para no saturar el servidor SMTP.
  const avisos = destinatarios.map((d) => ({
    destino: d.email!,
    id: registrarAviso({
      idDonante: d.id_donante, idConvocatoria, tipo: 'CONVOCATORIA', canal: 'EMAIL', destino: d.email!,
      asunto: `${centro} necesita donantes`,
      cuerpo: `Hola ${d.nombres}: ${centro} necesita donantes como vos esta semana. Si podés ayudar, reservá tu turno desde el enlace.`,
      enlace: `${URL_PUBLICA}/app/turnos?centro=${idCentro}&convocatoria=${idConvocatoria}`,
    }),
  }));
  void (async () => {
    for (const a of avisos) await entregar(a.id, a.destino);
  })().catch((error) => console.error('Convocatoria:', (error as Error).message));
  return destinatarios.length;
}

export function listarConvocatorias(idCentro: number) {
  return todos<{ id_convocatoria: number; estado: string; creada_en: string; cerrada_en: string | null; id_alerta_stock: number; alerta_estado: string; cantidad_detectada: number; componente: string; grupo_abo: string; factor_rh: string; minimo_unidades: number }>(
    `SELECT cv.id_convocatoria, cv.estado, cv.creada_en, cv.cerrada_en, a.id_alerta_stock, a.estado AS alerta_estado,
            a.cantidad_detectada, u.componente, u.grupo_abo, u.factor_rh, u.minimo_unidades
     FROM convocatoria cv JOIN alerta_stock a ON a.id_alerta_stock = cv.id_alerta_stock
     JOIN umbral_stock u ON u.id_umbral_stock = a.id_umbral_stock
     WHERE cv.id_centro = ? ORDER BY cv.id_convocatoria DESC LIMIT 50`, [idCentro],
  ).map((c) => {
    const envios = todos<{ id_notificacion: number; estado: string; canal: string; enviada_en: string | null; nombres: string; apellidos: string; reservo: number }>(
      `SELECT n.id_notificacion, n.estado, n.canal, n.enviada_en, d.nombres, d.apellidos,
              EXISTS (SELECT 1 FROM turno t WHERE t.id_convocatoria = n.id_convocatoria AND t.id_donante = n.id_donante AND t.estado <> 'CANCELADO') AS reservo
       FROM notificacion n JOIN donante d ON d.id_donante = n.id_donante WHERE n.id_convocatoria = ? ORDER BY n.id_notificacion`,
      [c.id_convocatoria],
    );
    return {
      id: c.id_convocatoria, estado: c.estado, creadaEn: c.creada_en, cerradaEn: c.cerrada_en,
      alerta: {
        id: c.id_alerta_stock, estado: c.alerta_estado, cantidadDetectada: c.cantidad_detectada, minimo: c.minimo_unidades,
        componente: NOMBRE_COMPONENTE[c.componente], grupo: `${c.grupo_abo}${c.factor_rh}`,
      },
      envios: envios.map((e) => ({
        id: e.id_notificacion, estado: e.estado, canal: e.canal, enviadaEn: e.enviada_en,
        destinatario: `${e.apellidos}, ${e.nombres}`, reservoTurno: !!e.reservo,
      })),
    };
  });
}

/** Reintenta los envíos fallidos de una convocatoria (flujo alternativo de CU05). */
export async function reintentarEnvios(usuario: UsuarioSesion & { idCentro: number }, idConvocatoria: number) {
  const cv = uno<{ id_centro: number }>('SELECT id_centro FROM convocatoria WHERE id_convocatoria = ?', [idConvocatoria]);
  if (!cv || cv.id_centro !== usuario.idCentro) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'La convocatoria no existe.');
  const fallidos = todos<{ id_notificacion: number; email: string }>(
    `SELECT n.id_notificacion, u.email FROM notificacion n
     JOIN donante d ON d.id_donante = n.id_donante JOIN usuario u ON u.id_usuario = d.id_usuario
     WHERE n.id_convocatoria = ? AND n.estado IN ('PENDIENTE','FALLIDO')`, [idConvocatoria],
  );
  let enviados = 0;
  for (const f of fallidos) {
    if (await reintentarAviso(f.id_notificacion, f.email) === 'ENVIADO') enviados++;
  }
  auditar(usuario.idUsuario, 'REINTENTAR_ENVIOS', 'convocatoria', idConvocatoria, { enviados, total: fallidos.length });
  return { reintentados: fallidos.length, enviados };
}
