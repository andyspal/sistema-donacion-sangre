import { useState } from 'react';
import { api, ApiError, useCarga } from '../../api';
import { instante } from '../../formato';
import { useSesion } from '../../sesion';
import { Alerta, Boton, Cargando, Encabezado, Icono, Insignia, Tarjeta, Vacio } from '../../ui';

interface Convocatoria {
  id: number; estado: 'ABIERTA' | 'SIN_DESTINATARIOS' | 'CERRADA'; creadaEn: string; cerradaEn: string | null;
  alerta: { id: number; estado: string; cantidadDetectada: number; minimo: number; componente: string; grupo: string };
  envios: { id: number; estado: 'ENVIADO' | 'PENDIENTE' | 'FALLIDO'; canal: string; enviadaEn: string | null; destinatario: string; reservoTurno: boolean }[];
}

const ESTADO = {
  ABIERTA: { texto: 'Abierta', tono: 'lima' },
  SIN_DESTINATARIOS: { texto: 'Sin destinatarios', tono: 'ambar' },
  CERRADA: { texto: 'Cerrada', tono: 'neutro' },
} as const;

const ENVIO = { ENVIADO: 'lima', PENDIENTE: 'ambar', FALLIDO: 'sangre' } as const;

export function Convocatorias() {
  const { usuario } = useSesion();
  const { datos, cargando, setDatos, recargar } = useCarga<Convocatoria[]>('/hospital/convocatorias');
  const [ejecutando, setEjecutando] = useState(false);
  const [msg, setMsg] = useState('');
  const gestiona = usuario?.rol === 'RESPONSABLE_INVENTARIO' || usuario?.rol === 'ADMINISTRADOR';

  return (
    <>
      <Encabezado titulo="Convocatorias segmentadas"
        bajada="Se generan solas cuando una reserva cae debajo del mínimo: solo se convoca a donantes compatibles, habilitados, cercanos y que lo autorizaron."
        acciones={gestiona && (
          <Boton variante="secundario" chico cargando={ejecutando} onClick={async () => {
            setEjecutando(true);
            try { setDatos(await api<Convocatoria[]>('/hospital/monitor/ejecutar', 'POST')); setMsg('Chequeo de stock ejecutado.'); }
            finally { setEjecutando(false); }
          }}>Ejecutar chequeo de stock</Boton>
        )} />

      {msg && <Alerta tono="lima" className="mb-4">{msg}</Alerta>}

      {cargando && !datos ? <Cargando /> : !datos?.length ? (
        <Vacio icono="megafono" titulo="No hay convocatorias">Todas las reservas están por encima de sus niveles mínimos.</Vacio>
      ) : (
        <div className="grid gap-3">
          {datos.map((c) => {
            const fallidos = c.envios.filter((e) => e.estado !== 'ENVIADO').length;
            const reservas = c.envios.filter((e) => e.reservoTurno).length;
            return (
              <Tarjeta key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Insignia tono="sangre"><Icono nombre="gota" className="size-3" />{c.alerta.grupo}</Insignia>
                      <h2 className="font-medium first-letter:uppercase">{c.alerta.componente}</h2>
                      <Insignia tono={ESTADO[c.estado].tono}>{ESTADO[c.estado].texto}</Insignia>
                    </div>
                    <p className="mt-1 text-sm text-tenue">
                      Alerta {c.alerta.estado === 'ACTIVA' ? 'activa' : 'atendida'}: {c.alerta.cantidadDetectada} unidades (mínimo {c.alerta.minimo}) · {instante(c.creadaEn)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div><p className="text-xl font-semibold tabular-nums">{c.envios.length}</p><p className="text-xs text-tenue">avisos</p></div>
                    <div><p className="text-xl font-semibold tabular-nums text-lima">{reservas}</p><p className="text-xs text-tenue">turnos</p></div>
                  </div>
                </div>
                {c.estado === 'SIN_DESTINATARIOS' && (
                  <p className="mt-3 text-sm text-ambar">No hay donantes que cumplan los criterios. La alerta queda visible hasta que se repongan las unidades.</p>
                )}
                {c.envios.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {c.envios.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                        <span className="truncate">{e.destinatario}</span>
                        <span className="flex shrink-0 gap-1.5">
                          {e.reservoTurno && <Insignia tono="cielo">Reservó</Insignia>}
                          <Insignia tono={ENVIO[e.estado]}>{e.estado.toLowerCase()}</Insignia>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {gestiona && fallidos > 0 && (
                  <Boton chico variante="secundario" className="mt-3" onClick={async () => {
                    try {
                      const r = await api<{ reintentados: number; enviados: number }>(`/hospital/convocatorias/${c.id}/reintentar`, 'POST');
                      setMsg(`Se reintentaron ${r.reintentados} envíos; ${r.enviados} salieron correctamente.`);
                      await recargar();
                    } catch (e) { setMsg((e as ApiError).message); }
                  }}>Reintentar {fallidos} envíos</Boton>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
