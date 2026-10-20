import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api, ApiError, useCarga, type Orientacion as TOrientacion } from '../../api';
import { ResultadoOrientacion } from '../../componentes';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fecha, instante } from '../../formato';
import { Alerta, Boton, Cargando, Encabezado, Icono, Insignia, Tarjeta, Vacio } from '../../ui';

const FALTANTE: Record<string, { texto: string; a: string }> = {
  cuestionario: { texto: 'Completar el cuestionario de salud', a: '/app/cuestionario' },
  consentimiento_datos_salud: { texto: 'Otorgar el consentimiento de datos de salud', a: '/app/cuestionario' },
};

export function Orientacion() {
  const { state } = useLocation();
  const navegar = useNavigate();
  const { datos: historial, cargando, recargar } = useCarga<TOrientacion[]>('/orientaciones');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const auto = useRef(false);

  const solicitar = async () => {
    setProcesando(true);
    setError(null);
    try {
      await api<TOrientacion>('/orientaciones', 'POST');
      await recargar();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setProcesando(false);
    }
  };

  useEffect(() => {
    if ((state as { solicitar?: boolean } | null)?.solicitar && !auto.current) {
      auto.current = true;
      navegar('.', { replace: true, state: null });
      void solicitar();
    }
  }, [state]);

  const actual = historial?.[0];
  const anteriores = historial?.slice(1) ?? [];

  return (
    <>
      <Encabezado titulo="Orientación previa"
        bajada="Analizamos tu cuestionario, tus estudios y tu historial de donaciones con criterios de la normativa vigente."
        acciones={actual && <Boton variante="secundario" chico cargando={procesando} onClick={solicitar}>Actualizar</Boton>} />

      {error && (
        <Alerta tono={error.codigo === 'DATOS_INCOMPLETOS' ? 'ambar' : 'sangre'} titulo={error.message} className="mb-4">
          {error.detalle?.camposFaltantes?.length ? (
            <ul className="mt-1 grid gap-1">
              {error.detalle.camposFaltantes.map((c) => FALTANTE[c] && (
                <li key={c}><Link to={FALTANTE[c].a} className="text-lima hover:underline">{FALTANTE[c].texto} →</Link></li>
              ))}
            </ul>
          ) : null}
        </Alerta>
      )}

      {procesando && (
        <Tarjeta className="mb-4">
          <Cargando texto="Procesando estudios y evaluando las reglas…" />
        </Tarjeta>
      )}

      {cargando && !historial ? <Cargando /> : !actual ? (
        !procesando && (
          <Vacio icono="estetoscopio" titulo="Todavía no pediste tu orientación">
            <p>Necesitás haber completado el cuestionario de salud. Los estudios son opcionales.</p>
            <Boton className="mt-4" onClick={solicitar} cargando={procesando}>Solicitar orientación</Boton>
          </Vacio>
        )
      ) : !procesando && (
        <div className="grid gap-4">
          <ResultadoOrientacion o={actual} />

          <div className="flex flex-wrap gap-3">
            {actual.resultado === 'FAVORABLE' && (
              <Link to="/app/turnos" className="inline-flex items-center gap-2 rounded-xl bg-lima px-5 py-3 font-semibold text-fondo hover:brightness-110">
                <Icono nombre="calendario" className="size-5" /> Reservar mi turno
              </Link>
            )}
            {actual.resultado === 'DIFERIMIENTO_TEMPORAL' && actual.fechaHabilitacionEstimada && (
              <Link to="/app/turnos" className="inline-flex items-center gap-2 rounded-xl border border-borde px-5 py-3 hover:border-tenue/60">
                <Icono nombre="calendario" className="size-5" /> Reservar desde el {fecha(actual.fechaHabilitacionEstimada)}
              </Link>
            )}
            {actual.resultado === 'REVISION_MEDICA' && (
              <Link to="/app/turnos" className="inline-flex items-center gap-2 rounded-xl border border-borde px-5 py-3 hover:border-tenue/60">
                <Icono nombre="calendario" className="size-5" /> Reservar turno para la evaluación
              </Link>
            )}
            <Link to="/app/cuestionario" className="inline-flex items-center rounded-xl px-4 py-3 text-tenue hover:text-texto">Revisar mis respuestas</Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Tarjeta>
              <p className="text-sm text-tenue">Intervalo entre donaciones</p>
              <p className="mt-1 font-medium">
                {actual.intervalo.cumplido ? 'Cumplido' : `Habilitado desde el ${fecha(actual.intervalo.fechaHabilitacion)}`}
              </p>
              <p className="mt-1 text-sm text-tenue">
                Mínimo {actual.intervalo.diasMinimos / 7} semanas entre donaciones y hasta {actual.intervalo.maximoAnual} por año.
                {' '}Llevás {actual.intervalo.donacionesUltimoAnio} en los últimos 12 meses.
              </p>
            </Tarjeta>
            <Tarjeta>
              <p className="text-sm text-tenue">Estudios analizados</p>
              {actual.estudios.length ? (
                <ul className="mt-1 grid gap-1 text-sm">
                  {actual.estudios.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{e.nombreArchivo}</span>
                      <Insignia tono={e.considerado ? 'lima' : 'neutro'}>{e.considerado ? 'Considerado' : 'No considerado'}</Insignia>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm">Sin estudios. <Link to="/app/estudios" className="text-lima hover:underline">Adjuntar uno</Link></p>
              )}
            </Tarjeta>
          </div>

          {anteriores.length > 0 && (
            <details className="rounded-2xl border border-borde p-4">
              <summary className="cursor-pointer text-sm text-tenue">Orientaciones anteriores ({anteriores.length})</summary>
              <ul className="mt-3 grid gap-2">
                {anteriores.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-tenue">{instante(o.generadaEn)}</span>
                    <Insignia tono={TONO_RESULTADO[o.resultado]}>{ETIQUETA_RESULTADO[o.resultado]}</Insignia>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}
