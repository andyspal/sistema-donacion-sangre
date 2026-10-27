import { useEffect } from 'react';
import { Link } from 'react-router';
import { api, useCarga } from '../../api';
import { instante } from '../../formato';
import { Cargando, Encabezado, Icono, Insignia, Tarjeta, Vacio, cx } from '../../ui';

interface Aviso {
  id: number; tipo: 'CONVOCATORIA' | 'CONFIRMACION_TURNO' | 'RECORDATORIO_TURNO' | 'CANCELACION_TURNO'; canal: string; asunto: string; cuerpo: string;
  enlace: string | null; estado: string; creadaEn: string; leida: boolean;
}

const ICONO = { CONVOCATORIA: 'megafono', CONFIRMACION_TURNO: 'calendario', RECORDATORIO_TURNO: 'reloj', CANCELACION_TURNO: 'calendario' };

/** Por dónde salió el aviso además de quedar en esta bandeja. */
const envio = (a: Aviso) => a.canal === 'APP' ? 'solo en la app'
  : a.canal !== 'EMAIL' ? a.canal.toLowerCase()
  : a.estado === 'ENVIADO' ? 'también por correo' : a.estado === 'FALLIDO' ? 'no se pudo enviar el correo' : 'enviando por correo';

export function Avisos() {
  const { datos, cargando } = useCarga<Aviso[]>('/avisos');
  // Se marcan como leídos recién después de mostrarlos, para conservar la marca «Nuevo» en esta visita.
  useEffect(() => {
    if (datos?.some((a) => !a.leida)) void api('/avisos/leidos', 'POST').catch(() => undefined);
  }, [datos]);

  return (
    <>
      <Encabezado titulo="Avisos" bajada="Convocatorias, confirmaciones y recordatorios de turnos. También te los enviamos por correo, según tus preferencias." />
      {cargando && !datos ? <Cargando /> : !datos?.length ? (
        <Vacio icono="campana" titulo="No tenés avisos">Si un centro cercano necesita donantes como vos, te avisamos acá.</Vacio>
      ) : (
        <ul className="grid gap-3">
          {datos.map((a) => (
            <li key={a.id}>
              <Tarjeta className={cx('flex gap-3', !a.leida && 'border-primario/40')}>
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-lg', a.tipo === 'CONVOCATORIA' ? 'bg-primario-suave text-primario' : 'bg-superficie-2 text-tenue')}>
                  <Icono nombre={ICONO[a.tipo]} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.asunto}</p>
                    {!a.leida && <Insignia tono="cielo">Nuevo</Insignia>}
                  </div>
                  <p className="mt-1 text-sm text-tenue">{a.cuerpo}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-tenue">
                    <span>{instante(a.creadaEn)} · {envio(a)}</span>
                    {a.tipo === 'CONVOCATORIA' && a.enlace && (
                      <Link to={a.enlace} className="inline-flex items-center gap-1 rounded-lg bg-primario px-3 py-1.5 text-sm font-medium text-white hover:bg-primario-hover">
                        Reservar turno <Icono nombre="flecha" className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
