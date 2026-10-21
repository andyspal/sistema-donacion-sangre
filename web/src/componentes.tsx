import type { Orientacion, ParametrosClinicos } from './api';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fecha, fechaLarga, instante } from './formato';
import { Icono, Insignia, cx } from './ui';

const FONDO: Record<string, string> = {
  lima: 'border-lima/30 bg-lima-suave',
  ambar: 'border-ambar/30 bg-ambar-suave',
  cielo: 'border-cielo/30 bg-cielo-suave',
};
const TEXTO: Record<string, string> = { lima: 'text-lima', ambar: 'text-ambar', cielo: 'text-cielo' };

const BAJADA = {
  FAVORABLE: 'Según lo que declaraste, no encontramos impedimentos para donar.',
  DIFERIMIENTO_TEMPORAL: 'Es probable que tengas que esperar un tiempo antes de donar.',
  REVISION_MEDICA: 'Hay información que un profesional debe evaluar antes de que dones.',
} as const;

/** Resultado de la orientación previa (RF09) con la aclaración obligatoria. */
export function ResultadoOrientacion({ o, compacto }: { o: Orientacion; compacto?: boolean }) {
  const tono = TONO_RESULTADO[o.resultado];
  const causales = o.motivos.filter((m) => m.tipo !== 'AVISO');
  const avisos = o.motivos.filter((m) => m.tipo === 'AVISO');
  return (
    <section className={cx('rounded-xl border p-5', FONDO[tono])} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-lg bg-fondo/60', TEXTO[tono])}>
          <Icono nombre={o.resultado === 'FAVORABLE' ? 'check' : o.resultado === 'REVISION_MEDICA' ? 'estetoscopio' : 'reloj'} />
        </span>
        <div className="min-w-0">
          <p className={cx('text-sm font-medium', TEXTO[tono])}>Resultado orientativo</p>
          <h2 className="text-xl font-semibold tracking-tight">{ETIQUETA_RESULTADO[o.resultado]}</h2>
          <p className="mt-1 text-tenue">{BAJADA[o.resultado]}</p>
        </div>
      </div>

      {o.resultado === 'DIFERIMIENTO_TEMPORAL' && (
        <div className="mt-4 rounded-lg bg-fondo/60 p-3.5">
          {o.fechaHabilitacionEstimada ? (
            <p>Fecha estimada para volver a donar: <strong className="text-ambar">{fechaLarga(o.fechaHabilitacionEstimada)}</strong></p>
          ) : (
            <p className="text-tenue">No podemos estimar una fecha con la información disponible: el profesional del centro te la indicará.</p>
          )}
        </div>
      )}

      {!compacto && causales.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {causales.map((m) => (
            <li key={m.regla} className="flex gap-2.5 text-sm">
              <Icono nombre="alerta" className={cx('size-4 mt-0.5', m.tipo === 'REVISION_MEDICA' ? 'text-cielo' : 'text-ambar')} />
              <span>
                {m.mensaje}
                {m.fechaHabilitacion && <span className="text-tenue"> · hasta el {fecha(m.fechaHabilitacion)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!compacto && avisos.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {avisos.map((m, i) => (
            <li key={`${m.regla}-${i}`} className="flex gap-2.5 text-sm text-tenue">
              <Icono nombre="info" className="size-4 mt-0.5" />{m.mensaje}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex gap-2 border-t border-borde/70 pt-3 text-xs text-tenue">
        <Icono nombre="escudo" className="size-4" />
        <span><strong className="text-texto/90">No constituye una decisión médica.</strong> {o.aviso.replace(/^Este resultado es orientativo y no constituye una decisión médica\. /, '')}</span>
      </p>
      {!compacto && <p className="mt-1 text-xs text-tenue/70">Generada el {instante(o.generadaEn)} · reglas v{o.motorVersion}</p>}
    </section>
  );
}

/** Parámetros clínicos extraídos de un estudio (RF06). */
export function Parametros({ p }: { p: ParametrosClinicos }) {
  const filas: [string, string][] = [];
  if (p.hemoglobina !== undefined) filas.push(['Hemoglobina', `${p.hemoglobina.toLocaleString('es-AR')} g/dL`]);
  if (p.hematocrito !== undefined) filas.push(['Hematocrito', `${p.hematocrito.toLocaleString('es-AR')} %`]);
  if (p.plaquetas !== undefined) filas.push(['Plaquetas', `${p.plaquetas.toLocaleString('es-AR')} /mm³`]);
  return (
    <div className="flex flex-wrap gap-2">
      {filas.map(([k, v]) => (
        <span key={k} className="rounded-lg border border-borde bg-fondo px-2.5 py-1 text-sm"><span className="text-tenue">{k}</span> {v}</span>
      ))}
      {p.serologias && Object.entries(p.serologias).map(([k, v]) => (
        <Insignia key={k} tono={v === 'REACTIVO' ? 'sangre' : 'neutro'}>{k}: {v === 'REACTIVO' ? 'reactivo' : 'no reactivo'}</Insignia>
      ))}
    </div>
  );
}
