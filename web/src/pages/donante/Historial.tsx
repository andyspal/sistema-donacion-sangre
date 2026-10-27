import { useCarga, type Donacion, type Intervalo } from '../../api';
import { fecha, fechaHora, fechaLarga, hoy, instante } from '../../formato';
import { Alerta, Cargando, Encabezado, Icono, Insignia, Tarjeta, Vacio } from '../../ui';

interface Historial {
  donaciones: Donacion[];
  evaluaciones: { resultado: 'APTO' | 'DIFERIDO'; fechaHabilitacion: string | null; evaluadaEn: string; centro: string }[];
  intervalo: Intervalo;
}

export function Historial() {
  const { datos: h, cargando, error } = useCarga<Historial>('/donante/historial');
  if (cargando && !h) return <Cargando />;
  if (error || !h) return <Alerta tono="sangre">{error?.message ?? 'No se pudo cargar tu historial.'}</Alerta>;
  const habilitado = h.intervalo.fechaHabilitacion <= hoy();

  return (
    <>
      <Encabezado titulo="Historial de donaciones" bajada="Tus donaciones registradas por los centros y los intervalos de descanso." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tarjeta>
          <p className="text-sm text-tenue">Donaciones totales</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{h.donaciones.length}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-sm text-tenue">Últimos 12 meses</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{h.intervalo.donacionesUltimoAnio}<span className="text-lg text-tenue">/{h.intervalo.maximoAnual}</span></p>
        </Tarjeta>
        <Tarjeta className="col-span-2 sm:col-span-1">
          <p className="text-sm text-tenue">Próxima donación</p>
          <p className={`mt-1 text-lg font-semibold ${habilitado ? 'text-verde' : 'text-ambar'}`}>
            {habilitado ? 'Desde hoy' : fechaLarga(h.intervalo.fechaHabilitacion)}
          </p>
        </Tarjeta>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium text-tenue">Donaciones</h2>
      {!h.donaciones.length ? (
        <Vacio icono="gota" titulo="Todavía no registramos donaciones">Cuando dones, el centro la registrará y aparecerá acá.</Vacio>
      ) : (
        <ol className="relative grid gap-3 border-l border-borde pl-5">
          {h.donaciones.map((d) => (
            <li key={d.id} className="relative">
              <span className="absolute -left-[27px] top-4 grid size-3.5 place-items-center rounded-full bg-sangre ring-4 ring-fondo" />
              <Tarjeta className="flex flex-wrap items-center justify-between gap-2 py-3 sm:py-3">
                <div>
                  <p className="font-medium">{fechaHora(d.fechaHora)}</p>
                  <p className="text-sm text-tenue">{d.centro}</p>
                </div>
                <Insignia tono="sangre"><Icono nombre="gota" className="size-3" />{d.volumenMl} ml</Insignia>
              </Tarjeta>
            </li>
          ))}
        </ol>
      )}

      {!!h.evaluaciones.length && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium text-tenue">Evaluaciones presenciales</h2>
          <ul className="divide-y divide-borde rounded-xl border border-borde bg-superficie">
            {h.evaluaciones.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{instante(e.evaluadaEn)}</p>
                  <p className="text-sm text-tenue">{e.centro}{e.fechaHabilitacion ? ` · habilitación: ${fecha(e.fechaHabilitacion)}` : ''}</p>
                </div>
                <Insignia tono={e.resultado === 'APTO' ? 'lima' : 'ambar'}>{e.resultado === 'APTO' ? 'Apto' : 'Diferido'}</Insignia>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
