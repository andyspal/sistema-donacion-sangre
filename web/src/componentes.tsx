import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { api, ApiError, type Estudio, type Orientacion, type ParametrosClinicos } from './api';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fecha, fechaLarga, hoy, instante } from './formato';
import { Alerta, Boton, Campo, Entrada, Icono, Insignia, cx } from './ui';

const FONDO: Record<string, string> = {
  lima: 'border-verde/30 bg-verde-suave',
  ambar: 'border-ambar/30 bg-ambar-suave',
  cielo: 'border-cielo/30 bg-cielo-suave',
};
const TEXTO: Record<string, string> = { lima: 'text-verde', ambar: 'text-ambar', cielo: 'text-cielo' };

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
    <section className={cx('rounded-xl border bg-superficie p-5', FONDO[tono])} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-lg bg-superficie/70', TEXTO[tono])}>
          <Icono nombre={o.resultado === 'FAVORABLE' ? 'check' : o.resultado === 'REVISION_MEDICA' ? 'estetoscopio' : 'reloj'} />
        </span>
        <div className="min-w-0">
          <p className={cx('text-sm font-medium', TEXTO[tono])}>Resultado orientativo</p>
          <h2 className="text-xl font-semibold tracking-tight">{ETIQUETA_RESULTADO[o.resultado]}</h2>
          <p className="mt-1 text-tenue">{BAJADA[o.resultado]}</p>
        </div>
      </div>

      {o.resultado === 'DIFERIMIENTO_TEMPORAL' && (
        <div className="mt-4 rounded-lg bg-superficie/70 p-3.5">
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

// ---------------------------------------------------------------------------
// Estudios médicos: tarjeta común (donante y profesional) y carga
// ---------------------------------------------------------------------------

const ESTADO_ESTUDIO: Record<Estudio['estado'], { texto: string; tono: 'lima' | 'ambar' | 'sangre' | 'neutro' }> = {
  PROCESADO: { texto: 'Interpretado', tono: 'lima' },
  REQUIERE_REVISION: { texto: 'Requiere revisión', tono: 'ambar' },
  DETENIDO: { texto: 'Análisis detenido', tono: 'sangre' },
  PENDIENTE: { texto: 'Pendiente', tono: 'neutro' },
};

const METODO: Record<NonNullable<Estudio['metodo']>, string> = {
  TEXTO: 'Leído del texto del PDF',
  NINGUNO: 'No se leyó automáticamente',
};

/** Motivos de detención redactados para el personal (los del donante le hablan a él). */
const DETENCION_PROFESIONAL: Record<string, string> = {
  FECHA_FUTURA: 'La fecha del estudio es posterior a hoy.',
  DNI_NO_COINCIDE: 'El DNI que figura en el estudio no coincide con el del postulante.',
};

export const estudioVencido = (e: Estudio) =>
  e.motivoDetencion === 'VENCIDO' || (e.estado !== 'DETENIDO' && !!e.fechaEstudio && !e.vigente);

/** Estado de un estudio con las mismas leyendas para el donante y para el personal clínico. */
export function TarjetaEstudio({ e, enlace, profesional, acciones }: { e: Estudio; enlace: string; profesional?: boolean; acciones?: ReactNode }) {
  const vencido = estudioVencido(e);
  const estado = ESTADO_ESTUDIO[e.estado];
  let leyenda: ReactNode = null;
  if (vencido) {
    leyenda = (
      <Alerta tono="sangre" titulo="Informe vencido: no está en condiciones de usarse">
        {e.venceEl && `Venció el ${fecha(e.venceEl)}. `}No se usa para la orientación
        {e.estado === 'DETENIDO' ? ' y su análisis se detuvo antes de procesarlo.' : '.'}
        {profesional ? ' Conviene pedir un análisis actualizado.' : ' Subí un análisis más reciente.'}
      </Alerta>
    );
  } else if (e.estado === 'DETENIDO') {
    leyenda = (
      <Alerta tono="sangre" titulo="Análisis detenido">
        {profesional ? DETENCION_PROFESIONAL[e.motivoDetencion ?? ''] ?? e.observacion : e.observacion}
      </Alerta>
    );
  } else if (e.estado === 'REQUIERE_REVISION') {
    leyenda = <Alerta tono="ambar" titulo={profesional ? 'Requiere revisión del personal' : 'Requiere revisión'}>{e.observacion}</Alerta>;
  } else if (e.observacion) {
    leyenda = <p className="text-sm text-ambar">{e.observacion}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={enlace} target="_blank" rel="noreferrer" className="font-medium hover:text-primario break-all">{e.nombreArchivo}</a>
          <p className="text-sm text-tenue">Estudio del {fecha(e.fechaEstudio)} · cargado el {instante(e.cargadoEn)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {vencido && <Insignia tono="sangre">Vencido</Insignia>}
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          {acciones}
        </div>
      </div>
      {e.parametros && <Parametros p={e.parametros} />}
      {leyenda}
      {e.metodo && (
        <p className="flex items-center gap-1.5 text-xs text-tenue">
          <Icono nombre={e.metodo === 'TEXTO' ? 'archivo' : 'info'} className="size-3.5" />
          {METODO[e.metodo]}
          {profesional && e.metodo !== 'NINGUNO' && e.parametros && ' · valores extraídos automáticamente: verificalos con el archivo original'}
        </p>
      )}
    </div>
  );
}

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png'];

/** Carga de un estudio: archivo, fecha (obligatoria para fotos) y resultado del análisis. */
export function CargaEstudio({ onCargado }: { onCargado?: (e: Estudio) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaEstudio, setFechaEstudio] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState<Estudio | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const esFoto = !!archivo && archivo.type !== 'application/pdf';

  const elegir = (f: File | undefined) => {
    setError('');
    setUltimo(null);
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setError('Solo se aceptan archivos PDF, JPG o PNG.');
    if (f.size > 10 * 1024 * 1024) return setError('El archivo supera los 10 MB.');
    setArchivo(f);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    elegir(e.dataTransfer.files[0]);
  };

  const subir = async () => {
    if (!archivo) return;
    if (esFoto && !fechaEstudio) {
      return setError('Para las fotos indicá la fecha del estudio: la usamos para verificar que esté vigente antes de analizarla.');
    }
    setSubiendo(true);
    setError('');
    const datos = new FormData();
    datos.append('archivo', archivo);
    if (fechaEstudio) datos.append('fechaEstudio', fechaEstudio);
    try {
      const e = await api<Estudio>('/donante/estudios', 'POST', datos);
      setUltimo(e);
      setArchivo(null);
      setFechaEstudio('');
      if (input.current) input.current.value = '';
      onCargado?.(e);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
        className={cx('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition',
          arrastrando ? 'border-primario bg-primario-suave' : 'border-control hover:border-tenue')}>
        <Icono nombre="archivo" className="size-8 text-primario" />
        {archivo ? (
          <span><strong>{archivo.name}</strong> <span className="text-tenue">· {(archivo.size / 1024).toFixed(0)} KB</span></span>
        ) : (
          <>
            <span className="font-medium">Elegí o arrastrá un archivo</span>
            <span className="text-sm text-tenue">PDF, JPG o PNG · hasta 10 MB</span>
          </>
        )}
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => elegir(e.target.files?.[0])} />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <Campo id="fecha-estudio"
            etiqueta={<>Fecha del estudio <span className="font-normal text-tenue">{esFoto ? '(obligatoria para fotos)' : '(si no figura en el PDF)'}</span></>}>
            <Entrada id="fecha-estudio" type="date" max={hoy()} required={esFoto} value={fechaEstudio} onChange={(e) => setFechaEstudio(e.target.value)} />
          </Campo>
        </div>
        <Boton onClick={subir} disabled={!archivo} cargando={subiendo}>
          {subiendo ? 'Analizando…' : 'Subir y analizar'}
        </Boton>
      </div>

      {error && <Alerta tono="sangre">{error}</Alerta>}
      {ultimo && (
        ultimo.estado === 'PROCESADO' ? (
          <Alerta tono="lima" titulo="Listo: interpretamos tu estudio">
            <div className="mt-2"><Parametros p={ultimo.parametros!} /></div>
          </Alerta>
        ) : ultimo.estado === 'DETENIDO' ? (
          <Alerta tono="sangre" titulo={ultimo.motivoDetencion === 'VENCIDO' ? 'El estudio está vencido: no lo analizamos' : 'Se detuvo el análisis'}>
            {ultimo.observacion}
          </Alerta>
        ) : (
          <Alerta tono="ambar" titulo="El estudio requiere revisión adicional">{ultimo.observacion}</Alerta>
        )
      )}
      <p className="flex gap-2 text-xs text-tenue">
        <Icono nombre="candado" className="size-4" />
        Los archivos se guardan cifrados. Interpretamos los PDF con texto; las fotos las revisa el personal del centro. Los análisis de más de 6 meses no se procesan.
      </p>
    </div>
  );
}
