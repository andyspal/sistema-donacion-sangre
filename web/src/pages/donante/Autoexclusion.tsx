import { useState } from 'react';
import { api, ApiError, useCarga, type Donacion } from '../../api';
import { fechaHora, instante } from '../../formato';
import { Alerta, Boton, Cargando, Dialogo, Encabezado, Icono, Insignia, Tarjeta, Vacio, cx } from '../../ui';

interface Datos {
  procedimiento: { titulo: string; norma: string; pasos: string[] };
  donaciones: Donacion[];
}

export function Autoexclusion() {
  const { datos, cargando, error, recargar } = useCarga<Datos>('/autoexclusion/donaciones');
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [acuse, setAcuse] = useState<{ codigoAcuse: string; confirmadaEn: string } | null>(null);

  if (cargando && !datos) return <Cargando />;
  if (error || !datos) return <Alerta tono="sangre">{error?.message ?? 'No se pudo cargar la información.'}</Alerta>;

  const elegibles = datos.donaciones.filter((d) => !d.autoexclusionSolicitada);
  const donacion = datos.donaciones.find((d) => d.id === seleccion);

  const enviar = async () => {
    setEnviando(true);
    setFallo('');
    try {
      setAcuse(await api('/autoexclusiones', 'POST', { idDonacion: seleccion }));
      setSeleccion(null);
      await recargar();
    } catch (e) {
      setFallo((e as ApiError).message);
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  };

  return (
    <>
      <Encabezado titulo={datos.procedimiento.titulo} bajada={`Procedimiento según la ${datos.procedimiento.norma}.`} />

      <Tarjeta className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-superficie-2 text-tenue"><Icono nombre="candado" /></span>
        <ul className="grid gap-2 text-[15px] text-tenue">
          {datos.procedimiento.pasos.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </Tarjeta>

      {acuse && (
        <Tarjeta className="mt-4 border-verde/40 aparecer" role="status">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-verde text-white"><Icono nombre="check" /></span>
            <div>
              <h2 className="text-lg font-semibold">Recibimos tu solicitud</h2>
              <p className="text-tenue">Se registró de forma confidencial el {instante(acuse.confirmadaEn)} y solo la verá el personal autorizado.</p>
              <p className="mt-2 text-sm">Código de acuse: <span className="font-mono text-primario">{acuse.codigoAcuse}</span></p>
            </div>
          </div>
        </Tarjeta>
      )}

      <h2 className="mt-8 mb-3 text-sm font-medium text-tenue">¿Qué donación no debería usarse?</h2>
      {!datos.donaciones.length ? (
        <Vacio icono="gota" titulo="No tenés donaciones registradas">
          La autoexclusión se solicita sobre una donación ya realizada. Cuando dones, vas a poder usar esta opción.
        </Vacio>
      ) : (
        <>
          <div className="grid gap-2" role="radiogroup" aria-label="Donaciones">
            {datos.donaciones.map((d) => {
              const activa = seleccion === d.id;
              return (
                <button key={d.id} role="radio" aria-checked={activa} disabled={d.autoexclusionSolicitada}
                  onClick={() => { setSeleccion(d.id); setFallo(''); setAcuse(null); }}
                  className={cx('flex items-center gap-3 rounded-xl border p-4 text-left transition',
                    d.autoexclusionSolicitada ? 'cursor-not-allowed border-borde opacity-60' : 'cursor-pointer',
                    activa ? 'border-primario/60 bg-primario-suave' : !d.autoexclusionSolicitada && 'border-borde bg-superficie hover:border-tenue/50')}>
                  <span className={cx('grid size-5 place-items-center rounded-full border', activa ? 'border-primario' : 'border-tenue/60')}>
                    {activa && <span className="size-2.5 rounded-full bg-primario" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{fechaHora(d.fechaHora)}</span>
                    <span className="block text-sm text-tenue">{d.centro} · {d.volumenMl} ml</span>
                  </span>
                  {d.autoexclusionSolicitada && <Insignia>Solicitada el {instante(d.autoexclusionEn!).slice(0, 10)}</Insignia>}
                </button>
              );
            })}
          </div>
          {fallo && <Alerta tono="sangre" className="mt-3">{fallo}</Alerta>}
          {elegibles.length > 0 ? (
            <Boton className="mt-4" variante="peligro" disabled={!seleccion} onClick={() => setConfirmar(true)}>
              Solicitar autoexclusión
            </Boton>
          ) : (
            <p className="mt-4 text-sm text-tenue">Ya solicitaste la autoexclusión de todas tus donaciones registradas.</p>
          )}
        </>
      )}

      <Dialogo abierto={confirmar} onCerrar={() => setConfirmar(false)} titulo="¿Confirmás la autoexclusión?"
        acciones={<>
          <Boton variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Boton>
          <Boton variante="peligro" cargando={enviando} onClick={enviar}>Confirmar</Boton>
        </>}>
        {donacion && <>Vas a pedir que la unidad donada el <strong className="text-texto">{fechaHora(donacion.fechaHora)}</strong> en {donacion.centro} no se utilice. </>}
        No necesitás dar explicaciones y no podrás deshacerlo desde la aplicación.
      </Dialogo>
    </>
  );
}
