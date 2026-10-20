import { useEffect, useState } from 'react';
import { api, ApiError, useCarga } from '../../api';
import { NOMBRE_COMPONENTE, fecha, hoy, instante } from '../../formato';
import { useSesion } from '../../sesion';
import { Alerta, Boton, Campo, Cargando, Encabezado, Entrada, Icono, Insignia, Tarjeta, cx } from '../../ui';

interface Fila {
  componente: string; grupo: string; rh: string; disponibles: number; minimo: number | null; idUmbral: number | null; critico: boolean;
  lotes: { id: number; cantidad: number; vencimiento: string; vencido: boolean; actualizadaEn: string }[];
}

const clave = (f: Pick<Fila, 'componente' | 'grupo' | 'rh'>) => `${f.componente}|${f.grupo}${f.rh}`;

function Lote({ lote, editable, onGuardado }: { lote: Fila['lotes'][number]; editable: boolean; onGuardado: (filas: Fila[]) => void }) {
  const [cantidad, setCantidad] = useState(String(lote.cantidad));
  const [venc, setVenc] = useState(lote.vencimiento);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setCantidad(String(lote.cantidad)); setVenc(lote.vencimiento); }, [lote]);
  const cambiado = cantidad !== String(lote.cantidad) || venc !== lote.vencimiento;

  return (
    <li className="grid gap-2 py-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24">
          <Campo etiqueta="Unidades" id={`c-${lote.id}`}>
            <Entrada id={`c-${lote.id}`} type="number" min={0} disabled={!editable} value={cantidad} invalida={!!error}
              onChange={(e) => { setCantidad(e.target.value); setError(''); }} />
          </Campo>
        </div>
        <div className="w-44">
          <Campo etiqueta="Vencimiento" id={`v-${lote.id}`}>
            <Entrada id={`v-${lote.id}`} type="date" disabled={!editable} value={venc} onChange={(e) => setVenc(e.target.value)} />
          </Campo>
        </div>
        {lote.vencido && <Insignia tono="sangre">Vencido</Insignia>}
        {editable && cambiado && (
          <Boton chico cargando={guardando} onClick={async () => {
            setGuardando(true);
            try {
              onGuardado(await api<Fila[]>(`/hospital/inventario/${lote.id}`, 'PUT', { cantidad: cantidad === '' ? undefined : Number(cantidad), fechaVencimiento: venc }));
            } catch (e) {
              const ae = e as ApiError;
              setError(Object.values(ae.detalle?.errores ?? {})[0] ?? ae.message);
              setCantidad(String(lote.cantidad)); // se conservan los valores anteriores
              setVenc(lote.vencimiento);
            } finally { setGuardando(false); }
          }}>Guardar</Boton>
        )}
      </div>
      {error && <p className="text-sm text-sangre" role="alert">{error}</p>}
      <p className="text-xs text-tenue">Actualizado {instante(lote.actualizadaEn)}</p>
    </li>
  );
}

function Detalle({ fila, editable, onCambio }: { fila: Fila; editable: boolean; onCambio: (filas: Fila[]) => void }) {
  const [minimo, setMinimo] = useState(String(fila.minimo ?? 0));
  const [nuevo, setNuevo] = useState({ cantidad: '', fechaVencimiento: '' });
  const [error, setError] = useState('');
  useEffect(() => { setMinimo(String(fila.minimo ?? 0)); }, [fila.minimo]);

  const llamar = async (fn: () => Promise<Fila[]>) => {
    setError('');
    try { onCambio(await fn()); } catch (e) { setError((e as ApiError).message); }
  };

  return (
    <Tarjeta className="flex flex-col gap-4 lg:sticky lg:top-32">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{NOMBRE_COMPONENTE[fila.componente]} · {fila.grupo}{fila.rh}</h2>
        <Insignia tono={fila.critico ? 'sangre' : 'lima'}>{fila.disponibles} disponibles</Insignia>
      </div>
      {!editable && <Alerta tono="neutro">Solo el responsable de inventario puede modificar existencias.</Alerta>}

      <div>
        <p className="text-sm text-tenue">Lotes</p>
        {fila.lotes.length ? (
          <ul className="divide-y divide-borde">
            {fila.lotes.map((l) => <Lote key={l.id} lote={l} editable={editable} onGuardado={onCambio} />)}
          </ul>
        ) : <p className="mt-1 text-sm text-tenue">Sin existencias registradas.</p>}
      </div>

      {editable && (
        <>
          <div className="border-t border-borde pt-4">
            <p className="text-sm font-medium">Ingresar unidades</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="w-24"><Campo etiqueta="Unidades" id="n-c"><Entrada id="n-c" type="number" min={0} value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} /></Campo></div>
              <div className="w-44"><Campo etiqueta="Vencimiento" id="n-v"><Entrada id="n-v" type="date" min={hoy()} value={nuevo.fechaVencimiento} onChange={(e) => setNuevo({ ...nuevo, fechaVencimiento: e.target.value })} /></Campo></div>
              <Boton chico variante="secundario" disabled={!nuevo.cantidad || !nuevo.fechaVencimiento} onClick={() => llamar(async () => {
                const r = await api<Fila[]>('/hospital/inventario', 'POST', { componente: fila.componente, grupo: fila.grupo, rh: fila.rh, cantidad: Number(nuevo.cantidad), fechaVencimiento: nuevo.fechaVencimiento });
                setNuevo({ cantidad: '', fechaVencimiento: '' });
                return r;
              })}><Icono nombre="mas" className="size-4" />Agregar lote</Boton>
            </div>
          </div>
          <div className="border-t border-borde pt-4">
            <p className="text-sm font-medium">Nivel mínimo de reserva</p>
            <div className="mt-2 flex items-end gap-2">
              <div className="w-24"><Entrada type="number" min={0} aria-label="Mínimo de unidades" value={minimo} onChange={(e) => setMinimo(e.target.value)} /></div>
              <Boton chico variante="secundario" disabled={minimo === String(fila.minimo ?? 0)} onClick={() => llamar(() =>
                api<Fila[]>('/hospital/umbrales', 'PUT', { componente: fila.componente, grupo: fila.grupo, rh: fila.rh, minimo: Number(minimo) }))}>
                Guardar mínimo
              </Boton>
            </div>
            <p className="mt-1.5 text-xs text-tenue">Si las unidades vigentes caen por debajo, se genera una alerta y una convocatoria segmentada.</p>
          </div>
        </>
      )}
      {error && <Alerta tono="sangre">{error}</Alerta>}
    </Tarjeta>
  );
}

export function Inventario() {
  const { usuario } = useSesion();
  const { datos, cargando, setDatos } = useCarga<Fila[]>('/hospital/inventario');
  const [sel, setSel] = useState<string | null>(null);
  const editable = usuario?.rol === 'RESPONSABLE_INVENTARIO' || usuario?.rol === 'ADMINISTRADOR';

  if (cargando && !datos) return <Cargando />;
  if (!datos) return <Alerta tono="sangre">No se pudo cargar el inventario.</Alerta>;

  const fila = datos.find((f) => clave(f) === sel);
  const criticos = datos.filter((f) => f.critico);
  const componentes = [...new Set(datos.map((f) => f.componente))];

  return (
    <>
      <Encabezado titulo="Inventario de hemocomponentes" bajada={`Unidades vigentes al ${fecha(hoy())} por componente, grupo y factor Rh.`} />
      {criticos.length > 0 && (
        <Alerta tono="sangre" titulo={`${criticos.length} ${criticos.length === 1 ? 'reserva está' : 'reservas están'} por debajo del mínimo`} className="mb-4">
          {criticos.map((c) => `${NOMBRE_COMPONENTE[c.componente]} ${c.grupo}${c.rh}`).join(' · ')}
        </Alerta>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="grid gap-4">
          {componentes.map((comp) => (
            <Tarjeta key={comp}>
              <h2 className="font-medium">{NOMBRE_COMPONENTE[comp]}</h2>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {datos.filter((f) => f.componente === comp).map((f) => {
                  const pct = f.minimo ? Math.min(100, (f.disponibles / (f.minimo * 2)) * 100) : 100;
                  return (
                    <button key={clave(f)} onClick={() => setSel(clave(f))} aria-pressed={sel === clave(f)}
                      className={cx('flex flex-col items-center gap-1 rounded-xl border p-2.5 transition cursor-pointer',
                        sel === clave(f) ? 'border-lima' : f.critico ? 'border-sangre/50 bg-sangre-suave' : 'border-borde hover:border-tenue/50')}>
                      <span className="text-xs text-tenue">{f.grupo}{f.rh}</span>
                      <span className={cx('text-xl font-semibold tabular-nums', f.critico && 'text-sangre')}>{f.disponibles}</span>
                      <span className="h-1 w-full rounded-full bg-superficie-2">
                        <span className={cx('block h-full rounded-full', f.critico ? 'bg-sangre' : 'bg-lima')} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-[11px] text-tenue">mín {f.minimo ?? '—'}</span>
                    </button>
                  );
                })}
              </div>
            </Tarjeta>
          ))}
        </div>
        <div>
          {fila ? <Detalle key={sel} fila={fila} editable={editable} onCambio={setDatos} /> : (
            <Tarjeta className="text-center text-sm text-tenue">Seleccioná un grupo para ver lotes, vencimientos y el nivel mínimo.</Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
