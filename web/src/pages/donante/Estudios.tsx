import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError, useCarga, type Estudio } from '../../api';
import { Parametros } from '../../componentes';
import { fecha, hoy, instante } from '../../formato';
import { Alerta, Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Icono, Insignia, Tarjeta, Vacio, cx } from '../../ui';

const ESTADO = {
  PROCESADO: { texto: 'Interpretado', tono: 'lima' },
  REQUIERE_REVISION: { texto: 'Requiere revisión', tono: 'ambar' },
  PENDIENTE: { texto: 'Pendiente', tono: 'neutro' },
} as const;

export function Estudios() {
  const { datos: estudios, cargando, recargar } = useCarga<Estudio[]>('/donante/estudios');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaEstudio, setFechaEstudio] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState<Estudio | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Estudio | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const elegir = (f: File | undefined) => {
    setError('');
    setUltimo(null);
    if (!f) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) return setError('Solo se aceptan archivos PDF, JPG o PNG.');
    if (f.size > 10 * 1024 * 1024) return setError('El archivo supera los 10 MB.');
    setArchivo(f);
  };

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    const datos = new FormData();
    datos.append('archivo', archivo);
    if (fechaEstudio) datos.append('fechaEstudio', fechaEstudio);
    try {
      setUltimo(await api<Estudio>('/donante/estudios', 'POST', datos));
      setArchivo(null);
      setFechaEstudio('');
      if (input.current) input.current.value = '';
      await recargar();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSubiendo(false);
    }
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    elegir(e.dataTransfer.files[0]);
  };

  return (
    <>
      <Encabezado titulo="Estudios médicos"
        bajada="Adjuntá un análisis de sangre reciente (hemograma, serologías). Es opcional, pero mejora tu orientación." />

      <Tarjeta className="flex flex-col gap-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
          className={cx('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition',
            arrastrando ? 'border-primario bg-primario-suave' : 'border-control hover:border-tenue')}>
          <Icono nombre="archivo" className="size-8 text-tenue" />
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
          <div className="sm:w-56">
            <Campo etiqueta={<>Fecha del estudio <span className="font-normal text-tenue">(si no figura)</span></>} id="fecha-estudio">
              <Entrada id="fecha-estudio" type="date" max={hoy()} value={fechaEstudio} onChange={(e) => setFechaEstudio(e.target.value)} />
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
          ) : (
            <Alerta tono="ambar" titulo="El estudio requiere revisión adicional">{ultimo.observacion}</Alerta>
          )
        )}
        <p className="text-xs text-tenue flex gap-2">
          <Icono nombre="candado" className="size-4" />
          Los archivos se guardan cifrados. Por ahora interpretamos PDFs con texto; las imágenes las revisa el personal del centro.
        </p>
      </Tarjeta>

      <h2 className="mt-8 mb-3 text-sm font-medium text-tenue">Tus estudios</h2>
      {cargando && !estudios ? <Cargando /> : !estudios?.length ? (
        <Vacio icono="archivo" titulo="Todavía no adjuntaste estudios">Podés pedir tu orientación igual: la hemoglobina se mide en el centro.</Vacio>
      ) : (
        <ul className="grid gap-3">
          {estudios.map((e) => (
            <li key={e.id}>
              <Tarjeta className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a href={`/api/donante/estudios/${e.id}/archivo`} target="_blank" rel="noreferrer" className="font-medium hover:text-primario break-all">
                      {e.nombreArchivo}
                    </a>
                    <p className="text-sm text-tenue">Estudio del {fecha(e.fechaEstudio)} · cargado el {instante(e.cargadoEn)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Insignia tono={ESTADO[e.estado].tono}>{ESTADO[e.estado].texto}</Insignia>
                    <button onClick={() => setAEliminar(e)} aria-label={`Eliminar ${e.nombreArchivo}`}
                      className="grid size-9 place-items-center rounded-lg text-tenue hover:text-sangre hover:bg-superficie-2 cursor-pointer">
                      <Icono nombre="basura" className="size-4" />
                    </button>
                  </div>
                </div>
                {e.parametros && <Parametros p={e.parametros} />}
                {e.observacion && <p className="text-sm text-ambar">{e.observacion}</p>}
                {e.estado === 'PROCESADO' && !e.vigente && (
                  <p className="text-sm text-ambar">Por su antigüedad no se usa para la orientación. Si podés, subí un análisis más reciente.</p>
                )}
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      {!!estudios?.length && (
        <Link to="/app/orientacion" state={{ solicitar: true }} className="mt-5 inline-flex items-center gap-2 text-primario hover:underline">
          Actualizar mi orientación con estos estudios <Icono nombre="flecha" className="size-4" />
        </Link>
      )}

      <Dialogo abierto={!!aEliminar} onCerrar={() => setAEliminar(null)} titulo="¿Eliminar este estudio?"
        acciones={<>
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={async () => {
            await api(`/donante/estudios/${aEliminar!.id}`, 'DELETE');
            setAEliminar(null);
            setUltimo(null);
            await recargar();
          }}>Eliminar</Boton>
        </>}>
        Se borrará «{aEliminar?.nombreArchivo}» de forma definitiva y dejará de considerarse en próximas orientaciones.
      </Dialogo>
    </>
  );
}
