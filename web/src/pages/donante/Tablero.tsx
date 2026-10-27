import { Link } from 'react-router';
import { useCarga, type Resumen } from '../../api';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fechaHora, fechaLarga, hoy, instante } from '../../formato';
import { Alerta, Cargando, Encabezado, Icono, Insignia, Tarjeta, cx } from '../../ui';

type Estado = 'hecho' | 'pendiente' | 'atencion' | 'opcional' | 'espera';
interface Paso { titulo: string; detalle: string; estado: Estado; a: string; accion: string; insignia?: { texto: string; tono: 'lima' | 'ambar' | 'cielo' } }

function pasos(r: Resumen): Paso[] {
  const orientacionDesactualizada = !!(r.orientacion && r.cuestionario && r.cuestionario.declaradoEn > r.orientacion.generadaEn);
  // Con un diferimiento vigente el turno queda en espera: no se sugiere como siguiente paso.
  const { bloqueo, desde } = r.habilitacion;
  const enEspera = bloqueo?.codigo === 'DIFERIDO_SIN_FECHA' || (!bloqueo && desde > hoy());
  return [
    {
      titulo: 'Consentimiento de datos de salud',
      detalle: r.consentimientos.DATOS_SALUD.otorgado ? 'Otorgado. Podés revocarlo desde tu perfil.' : 'Lo necesitamos para guardar tu cuestionario y estudios.',
      estado: r.consentimientos.DATOS_SALUD.otorgado ? 'hecho' : 'pendiente', a: '/app/perfil', accion: 'Revisar',
    },
    {
      titulo: 'Cuestionario de salud',
      detalle: !r.cuestionario ? 'Menos de 3 minutos, desde el celular.'
        : r.cuestionario.vigente ? `Completado el ${instante(r.cuestionario.declaradoEn)}` : 'Las preguntas cambiaron: actualizá tus respuestas.',
      estado: !r.cuestionario ? 'pendiente' : r.cuestionario.vigente ? 'hecho' : 'atencion',
      a: '/app/cuestionario', accion: r.cuestionario ? 'Actualizar' : 'Completar',
    },
    {
      titulo: 'Estudios médicos',
      detalle: !r.estudios.total ? 'Opcional: un análisis reciente mejora la orientación.'
        : !r.estudios.vigentes ? 'Ninguno vigente para la orientación: subí un análisis reciente.'
        : `${r.estudios.vigentes} vigente${r.estudios.vigentes > 1 ? 's' : ''}${r.estudios.requierenRevision ? ` · ${r.estudios.requierenRevision} en revisión` : ''}.`,
      estado: r.estudios.vigentes ? 'hecho' : 'opcional',
      a: '/app/estudios', accion: r.estudios.total ? 'Ver' : 'Adjuntar',
    },
    {
      titulo: 'Orientación previa',
      detalle: !r.orientacion ? 'Te decimos si es buen momento para donar.'
        : orientacionDesactualizada ? 'Actualizaste tus datos: volvé a solicitarla.' : `Generada el ${instante(r.orientacion.generadaEn)}`,
      estado: !r.orientacion ? 'pendiente' : orientacionDesactualizada ? 'atencion' : 'hecho',
      insignia: r.orientacion ? { texto: ETIQUETA_RESULTADO[r.orientacion.resultado], tono: TONO_RESULTADO[r.orientacion.resultado] } : undefined,
      a: '/app/orientacion', accion: r.orientacion ? 'Ver' : 'Solicitar',
    },
    {
      titulo: 'Turno de donación',
      detalle: r.turno ? `${fechaHora(r.turno.inicio)} · ${r.turno.centro.nombre}`
        : !enEspera ? 'Elegí centro, día y horario.' : bloqueo ? 'Por ahora no podés reservar: mirá tu orientación.' : `Podés reservar desde el ${fechaLarga(desde)}.`,
      estado: r.turno ? 'hecho' : enEspera ? 'espera' : 'pendiente', a: '/app/turnos', accion: r.turno || enEspera ? 'Ver' : 'Reservar',
    },
  ];
}

const MARCA: Record<Estado, string> = {
  hecho: 'bg-verde text-white',
  pendiente: 'border border-tenue/50 text-tenue',
  atencion: 'bg-ambar text-white',
  opcional: 'border border-dashed border-tenue/50 text-tenue',
  espera: 'border border-ambar/60 text-ambar',
};

export function Tablero() {
  const { datos: r, error, cargando } = useCarga<Resumen>('/donante/resumen');
  if (cargando && !r) return <Cargando />;
  if (error || !r) return <Alerta tono="sangre">{error?.message ?? 'No se pudo cargar tu información.'}</Alerta>;

  const lista = pasos(r);
  const siguiente = lista.find((p) => p.estado === 'pendiente' || p.estado === 'atencion');
  const { bloqueo, desde, motivo } = r.habilitacion;
  const habilitado = !bloqueo && desde <= hoy();
  const titulo = bloqueo
    ? bloqueo.codigo === 'DIFERIDO_SIN_FECHA' ? 'Por ahora te recomendamos esperar' : 'Pedí tu orientación para reservar'
    : habilitado ? 'Podés donar desde hoy' : `Podrás donar desde el ${fechaLarga(desde)}`;

  return (
    <>
      <Encabezado titulo={`Hola, ${r.nombre}`} bajada="Este es tu camino para donar sangre." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta className={cx(habilitado ? 'border-verde/30' : 'border-ambar/30')}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-tenue">Cuándo podés donar</p>
            {r.grupo && <Insignia tono="sangre"><Icono nombre="gota" className="size-3" />{r.grupo}</Insignia>}
          </div>
          <p className={cx('mt-2 text-lg font-semibold', habilitado ? 'text-verde' : 'text-ambar')}>{titulo}</p>
          {(bloqueo || motivo) && <p className="mt-1 text-sm">{bloqueo?.mensaje ?? motivo}</p>}
          <p className="mt-1 text-sm text-tenue">
            {r.intervalo.donacionesUltimoAnio} de {r.intervalo.maximoAnual} donaciones en los últimos 12 meses
            {r.intervalo.ultimaDonacion ? ` · última el ${r.intervalo.ultimaDonacion.split('-').reverse().join('/')}` : ''}
          </p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-sm text-tenue">Tu próximo turno</p>
          {r.turno ? (
            <>
              <p className="mt-2 text-lg font-semibold">{fechaHora(r.turno.inicio)}</p>
              <p className="mt-1 text-sm text-tenue">{r.turno.centro.nombre} · {r.turno.centro.domicilio}</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold">Sin turno reservado</p>
              <Link to="/app/turnos" className="mt-1 inline-flex items-center gap-1 text-sm text-primario hover:underline">
                Reservar un turno <Icono nombre="flecha" className="size-3.5" />
              </Link>
            </>
          )}
        </Tarjeta>
      </div>

      {siguiente && (
        <Link to={siguiente.a} className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primario px-5 py-4 text-white hover:bg-primario-hover">
          <span>
            <span className="block text-sm font-medium opacity-90">Siguiente paso</span>
            <span className="block text-lg font-semibold">{siguiente.accion}: {siguiente.titulo.toLowerCase()}</span>
          </span>
          <Icono nombre="flecha" className="size-6" />
        </Link>
      )}

      <Tarjeta className="mt-3 p-0 sm:p-0">
        <ol className="divide-y divide-borde">
          {lista.map((p, i) => (
            <li key={p.titulo}>
              <Link to={p.a} className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5 hover:bg-superficie-2/60 rounded-xl">
                <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', MARCA[p.estado])}>
                  {p.estado === 'hecho' ? <Icono nombre="check" className="size-4" /> : p.estado === 'atencion' ? '!' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.titulo}</span>
                    {p.estado === 'opcional' && <Insignia>Opcional</Insignia>}
                    {p.insignia && <Insignia tono={p.insignia.tono}>{p.insignia.texto}</Insignia>}
                  </span>
                  <span className="block truncate text-sm text-tenue">{p.detalle}</span>
                </span>
                <span className="hidden sm:inline text-sm text-tenue">{p.accion}</span>
                <Icono nombre="flecha" className="size-4 text-tenue" />
              </Link>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:hidden">
        <Link to="/app/autoexclusion" className="flex items-center gap-3 rounded-xl border border-borde bg-superficie p-4 text-sm">
          <Icono nombre="candado" className="text-tenue" /> Autoexclusión confidencial
        </Link>
      </div>
    </>
  );
}
