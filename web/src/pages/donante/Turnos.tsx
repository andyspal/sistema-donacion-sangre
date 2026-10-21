import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError, useCarga, type Centro, type Resumen, type Turno } from '../../api';
import { ETIQUETA_RESULTADO, fecha, fechaCorta, fechaHora, fechaLarga } from '../../formato';
import { Alerta, Boton, Cargando, Dialogo, Encabezado, Icono, Insignia, Tarjeta, Vacio, cx } from '../../ui';

interface Disponibilidad {
  fechaHabilitacion: string;
  dias: { fecha: string; libres: number; horarios: { id: number; hora: string; fin: string; libres: number }[] }[];
}

const ESTADO_TURNO: Record<string, { texto: string; tono: 'lima' | 'neutro' | 'cielo' | 'sangre' }> = {
  RESERVADO: { texto: 'Reservado', tono: 'lima' },
  ASISTIO: { texto: 'Asististe', tono: 'cielo' },
  CANCELADO: { texto: 'Cancelado', tono: 'neutro' },
  AUSENTE: { texto: 'Ausente', tono: 'sangre' },
};

export function Turnos() {
  const [params] = useSearchParams();
  const idConvocatoria = params.get('convocatoria');
  const { datos: centros } = useCarga<Centro[]>('/centros');
  const { datos: resumen, recargar: recargarResumen } = useCarga<Resumen>('/donante/resumen');
  const { datos: turnos, recargar: recargarTurnos } = useCarga<Turno[]>('/turnos');
  const [idCentro, setIdCentro] = useState<number | null>(params.get('centro') ? Number(params.get('centro')) : null);
  const { datos: disp, cargando: cargandoDisp, recargar: recargarDisp } = useCarga<Disponibilidad>(idCentro ? `/centros/${idCentro}/disponibilidad` : null);
  const [dia, setDia] = useState<string | null>(null);
  const [horario, setHorario] = useState<{ id: number; hora: string } | null>(null);
  const [error, setError] = useState('');
  const [confirmado, setConfirmado] = useState<Turno | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aCancelar, setACancelar] = useState<Turno | null>(null);

  useEffect(() => { setDia(null); setHorario(null); }, [idCentro]);
  useEffect(() => {
    // Al cargar la disponibilidad se preselecciona el primer día habilitado con cupo.
    if (disp && !dia) setDia(disp.dias.find((d) => d.libres > 0 && d.fecha >= disp.fechaHabilitacion)?.fecha ?? null);
  }, [disp, dia]);

  const activo = resumen?.turno ?? null;
  const centro = centros?.find((c) => c.id === idCentro);
  const diaSel = disp?.dias.find((d) => d.fecha === dia);
  const orientacion = resumen?.orientacion;

  const reservar = async () => {
    if (!horario) return;
    setEnviando(true);
    setError('');
    try {
      const t = await api<Turno>('/turnos', 'POST', { idAgenda: horario.id, idConvocatoria: idConvocatoria ? Number(idConvocatoria) : undefined });
      setConfirmado(t);
      setHorario(null);
      await Promise.all([recargarResumen(), recargarTurnos(), recargarDisp()]);
    } catch (e) {
      const ae = e as ApiError;
      setError(ae.message);
      if (ae.codigo === 'HORARIO_OCUPADO' || ae.codigo === 'HORARIO_VENCIDO') {
        setHorario(null);
        await recargarDisp();
      }
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async () => {
    await api(`/turnos/${aCancelar!.id}/cancelar`, 'POST');
    setACancelar(null);
    setConfirmado(null);
    await Promise.all([recargarResumen(), recargarTurnos(), recargarDisp()]);
  };

  return (
    <>
      <Encabezado titulo="Turnos" bajada="Elegí un centro de hemoterapia, el día y el horario que te queden cómodos." />

      {idConvocatoria && !activo && (
        <Alerta tono="lima" icono="megafono" titulo="Respondés a una convocatoria" className="mb-4">
          Gracias por sumarte: el centro necesita donantes como vos. Elegí un horario para reservar.
        </Alerta>
      )}

      {confirmado && (
        <Tarjeta className="mb-4 border-lima/40 aparecer">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-lima text-fondo"><Icono nombre="check" /></span>
            <div>
              <h2 className="text-lg font-semibold">¡Turno confirmado!</h2>
              <p className="text-tenue">{fechaLarga(confirmado.inicio)} a las {confirmado.inicio.slice(11, 16)} h · {confirmado.centro.nombre}</p>
              <p className="mt-1 text-sm text-tenue">{confirmado.centro.domicilio}, {confirmado.centro.localidad}. Te enviamos la confirmación por correo.</p>
            </div>
          </div>
        </Tarjeta>
      )}

      {activo ? (
        <Tarjeta className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-tenue">Tu turno reservado</p>
            <p className="mt-1 text-lg font-semibold">{fechaHora(activo.inicio)}</p>
            <p className="text-sm text-tenue">{activo.centro.nombre} · {activo.centro.domicilio}</p>
            <ul className="mt-3 grid gap-1 text-sm text-tenue">
              <li className="flex gap-2"><Icono nombre="check" className="size-4 text-lima" />Llevá tu DNI.</li>
              <li className="flex gap-2"><Icono nombre="check" className="size-4 text-lima" />Desayuná liviano (sin lácteos ni grasas) e hidratate.</li>
            </ul>
          </div>
          <Boton variante="peligro" onClick={() => setACancelar(activo)}>Cancelar turno</Boton>
        </Tarjeta>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {orientacion && orientacion.resultado !== 'FAVORABLE' && (
            <Alerta tono={orientacion.resultado === 'REVISION_MEDICA' ? 'cielo' : 'ambar'} titulo={`Tu última orientación: ${ETIQUETA_RESULTADO[orientacion.resultado].toLowerCase()}`}>
              {orientacion.resultado === 'REVISION_MEDICA'
                ? 'Podés reservar igual: el profesional va a evaluar tu caso en la entrevista.'
                : orientacion.fechaHabilitacionEstimada
                  ? `Te recomendamos elegir un día a partir del ${fecha(orientacion.fechaHabilitacionEstimada)} para evitar un diferimiento en el centro.`
                  : 'Te recomendamos esperar a resolver lo indicado antes de reservar.'}{' '}
              <Link to="/app/orientacion" className="text-lima hover:underline">Ver detalle</Link>
            </Alerta>
          )}
          {!orientacion && (
            <Alerta tono="cielo" titulo="¿Ya pediste tu orientación previa?">
              Te ayuda a evitar viajes en vano. <Link to="/app/orientacion" className="text-lima hover:underline">Pedirla ahora</Link>
            </Alerta>
          )}

          <section aria-labelledby="paso-centro">
            <h2 id="paso-centro" className="mb-2 text-sm font-medium text-tenue">1 · Centro</h2>
            {!centros ? <Cargando /> : (
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Centro de hemoterapia">
                {centros.map((c) => (
                  <button key={c.id} role="radio" aria-checked={idCentro === c.id} onClick={() => { setIdCentro(c.id); setError(''); }}
                    className={cx('rounded-xl border p-4 text-left transition cursor-pointer',
                      idCentro === c.id ? 'border-lima/60 bg-lima-suave' : 'border-borde bg-superficie hover:border-tenue/50')}>
                    <span className="block font-medium leading-snug">{c.nombre}</span>
                    <span className="mt-1 block text-sm text-tenue">{c.domicilio} · {c.localidad}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {idCentro && (
            <section aria-labelledby="paso-dia">
              <h2 id="paso-dia" className="mb-2 text-sm font-medium text-tenue">2 · Día</h2>
              {cargandoDisp && !disp ? <Cargando /> : !disp?.dias.some((d) => d.libres > 0) ? (
                <Vacio icono="calendario" titulo="No hay cupos disponibles">Probá con otro centro o volvé a consultar en unos días.</Vacio>
              ) : (
                <>
                  {disp.fechaHabilitacion > disp.dias[0].fecha && (
                    <p className="mb-2 text-sm text-ambar">Por el intervalo entre donaciones podés reservar desde el {fecha(disp.fechaHabilitacion)}.</p>
                  )}
                  <div className="-mx-4 flex gap-2 overflow-x-auto scroll-oculto px-4 pb-1">
                    {disp.dias.map((d) => {
                      const bloqueado = d.libres === 0 || d.fecha < disp.fechaHabilitacion;
                      const [nombre, num, mes] = fechaCorta(d.fecha).split(' ');
                      return (
                        <button key={d.fecha} disabled={bloqueado} onClick={() => { setDia(d.fecha); setHorario(null); setError(''); }}
                          aria-pressed={dia === d.fecha}
                          className={cx('flex w-[4.25rem] shrink-0 flex-col items-center rounded-lg border py-2.5 transition',
                            bloqueado ? 'cursor-not-allowed border-borde/50 opacity-35' : 'cursor-pointer',
                            dia === d.fecha ? 'border-lima bg-lima text-fondo' : !bloqueado && 'border-borde bg-superficie hover:border-tenue/50')}>
                          <span className="text-xs capitalize opacity-80">{nombre}</span>
                          <span className="text-xl font-semibold tabular-nums">{num}</span>
                          <span className="text-xs opacity-80">{d.libres === 0 ? 'lleno' : mes}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {diaSel && (
            <section aria-labelledby="paso-hora">
              <h2 id="paso-hora" className="mb-2 text-sm font-medium text-tenue">3 · Horario · {fechaLarga(diaSel.fecha)}</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {diaSel.horarios.map((h) => (
                  <button key={h.id} disabled={h.libres === 0} onClick={() => { setHorario(h); setError(''); }} aria-pressed={horario?.id === h.id}
                    className={cx('rounded-lg border py-2.5 text-center transition',
                      h.libres === 0 ? 'cursor-not-allowed border-borde/50 opacity-35' : 'cursor-pointer',
                      horario?.id === h.id ? 'border-lima bg-lima text-fondo' : h.libres > 0 && 'border-borde bg-superficie hover:border-tenue/50')}>
                    <span className="block font-semibold tabular-nums">{h.hora}</span>
                    <span className="block text-xs opacity-75">{h.libres === 0 ? 'Completo' : `${h.libres} ${h.libres === 1 ? 'lugar' : 'lugares'}`}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && <Alerta tono="sangre">{error}</Alerta>}

          {horario && centro && diaSel && (
            <div className="sticky bottom-20 md:bottom-4 z-10 aparecer">
              <div className="flex flex-col gap-3 rounded-xl border border-lima/40 bg-superficie/95 p-4 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{fechaCorta(diaSel.fecha)} · {horario.hora} h</p>
                  <p className="text-sm text-tenue">{centro.nombre}</p>
                </div>
                <Boton onClick={reservar} cargando={enviando}>Confirmar turno</Boton>
              </div>
            </div>
          )}
        </div>
      )}

      {!!turnos?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-tenue">Tus turnos</h2>
          <ul className="divide-y divide-borde rounded-xl border border-borde bg-superficie">
            {turnos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{fechaHora(t.inicio)}</p>
                  <p className="text-sm text-tenue">{t.centro.nombre}</p>
                </div>
                <Insignia tono={ESTADO_TURNO[t.estado]?.tono}>{ESTADO_TURNO[t.estado]?.texto ?? t.estado}</Insignia>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialogo abierto={!!aCancelar} onCerrar={() => setACancelar(null)} titulo="¿Cancelar tu turno?"
        acciones={<>
          <Boton variante="secundario" onClick={() => setACancelar(null)}>Mantener turno</Boton>
          <Boton variante="peligro" onClick={cancelar}>Sí, cancelar</Boton>
        </>}>
        {aCancelar && <>Se liberará tu lugar del {fechaLarga(aCancelar.inicio)} a las {aCancelar.inicio.slice(11, 16)} h para otra persona.</>}
      </Dialogo>
    </>
  );
}
