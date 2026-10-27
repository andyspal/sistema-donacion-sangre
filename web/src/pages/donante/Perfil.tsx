import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, useCarga, type Consentimientos, type Preferencias } from '../../api';
import { LOCALIDADES, fecha, instante } from '../../formato';
import { Alerta, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, cx } from '../../ui';

interface PerfilDonante {
  email: string; dni: string; nombres: string; apellidos: string; fechaNacimiento: string; sexoBiologico: 'M' | 'F';
  telefono: string; domicilio: string | null; localidad: string; grupoAbo: string | null; factorRh: string | null;
  consentimientos: Consentimientos; preferencias: Preferencias;
}

function Interruptor({ activo, onChange, etiqueta, deshabilitado }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado} onClick={() => onChange(!activo)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition cursor-pointer disabled:opacity-50', activo ? 'bg-primario' : 'bg-superficie-2 border border-borde')}>
      <span className={cx('absolute top-1 size-5 rounded-full shadow-sm transition-all', activo ? 'left-6 bg-white' : 'left-1 bg-tenue')} />
    </button>
  );
}

function Opcion({ titulo, children, fechaCambio, control }: { titulo: string; children: ReactNode; fechaCambio?: string | null; control: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-sm text-tenue">{children}</p>
        {fechaCambio && <p className="text-xs text-tenue/80 mt-1">Último cambio: {instante(fechaCambio)}</p>}
      </div>
      {control}
    </li>
  );
}

export function Perfil() {
  const { datos: p, cargando, recargar } = useCarga<PerfilDonante>('/donante/perfil');
  const [f, setF] = useState({ telefono: '', localidad: '', domicilio: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardandoPreferencias, setGuardandoPreferencias] = useState(false);

  useEffect(() => { if (p) setF({ telefono: p.telefono, localidad: p.localidad, domicilio: p.domicilio ?? '' }); }, [p]);

  if (cargando && !p) return <Cargando />;
  if (!p) return <Alerta tono="sangre">No se pudo cargar tu perfil.</Alerta>;

  const guardar = async () => {
    setGuardando(true);
    setOk('');
    try {
      await api('/donante/perfil', 'PUT', f);
      setErrores({});
      setOk('Datos de contacto actualizados.');
    } catch (e) {
      setErrores((e as ApiError).detalle?.errores ?? {});
    } finally {
      setGuardando(false);
    }
  };

  const cambiarConsentimiento = async (clave: 'datosSalud' | 'convocatorias', valor: boolean) => {
    await api('/donante/consentimientos', 'PUT', { [clave]: valor });
    await recargar();
  };

  const cambiarPreferencias = async (cambios: Partial<Preferencias>) => {
    setGuardandoPreferencias(true);
    try {
      await api('/donante/preferencias', 'PUT', { ...p.preferencias, ...cambios });
      await recargar();
    } finally {
      setGuardandoPreferencias(false);
    }
  };

  const datos: [string, string][] = [
    ['Nombre', `${p.nombres} ${p.apellidos}`], ['DNI', p.dni], ['Nacimiento', fecha(p.fechaNacimiento)],
    ['Sexo biológico', p.sexoBiologico === 'F' ? 'Femenino' : 'Masculino'],
    ['Grupo sanguíneo', p.grupoAbo ? `${p.grupoAbo}${p.factorRh}` : 'Sin confirmar'], ['Correo', p.email],
  ];
  const c = p.consentimientos;

  return (
    <>
      <Encabezado titulo="Tu perfil" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <h2 className="font-medium">Datos personales</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {datos.map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-tenue">{k}</dt><dd className="break-all">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-tenue">Para corregir estos datos, acercate al centro con tu DNI.</p>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <h2 className="font-medium">Contacto</h2>
          <Campo etiqueta="Teléfono" id="tel" error={errores.telefono}>
            <Entrada id="tel" type="tel" value={f.telefono} invalida={!!errores.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
          <Campo etiqueta="Localidad" id="loc" error={errores.localidad}>
            <Selector id="loc" value={f.localidad} onChange={(e) => setF({ ...f, localidad: e.target.value })}>
              {!LOCALIDADES.includes(f.localidad) && <option>{f.localidad}</option>}
              {LOCALIDADES.map((l) => <option key={l}>{l}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Domicilio" id="dom">
            <Entrada id="dom" value={f.domicilio} onChange={(e) => setF({ ...f, domicilio: e.target.value })} />
          </Campo>
          {ok && <Alerta tono="lima">{ok}</Alerta>}
          <Boton variante="secundario" className="self-start" cargando={guardando} onClick={guardar}>Guardar cambios</Boton>
        </Tarjeta>

        <Tarjeta className="lg:col-span-2">
          <h2 className="font-medium">Avisos de turnos por correo</h2>
          <p className="mt-1 text-sm text-tenue">Se envían a {p.email}. Siempre quedan también en Avisos, dentro de la app.</p>
          <ul className="mt-2 divide-y divide-borde">
            <Opcion titulo="Confirmación y cancelación" control={
              <Interruptor etiqueta="Correo de confirmación y cancelación de turnos" activo={p.preferencias.correoTurnos}
                deshabilitado={guardandoPreferencias} onChange={(v) => cambiarPreferencias({ correoTurnos: v })} />
            }>
              Un correo cuando reservás o cancelás un turno, con el centro, el día y la hora.
            </Opcion>
            <Opcion titulo="Recordatorio antes del turno" control={
              <div className="w-36 shrink-0">
                <Selector aria-label="Anticipación del recordatorio" value={p.preferencias.recordatorioHoras} disabled={guardandoPreferencias}
                  onChange={(e) => cambiarPreferencias({ recordatorioHoras: Number(e.target.value) as Preferencias['recordatorioHoras'] })}>
                  <option value={24}>24 h antes</option>
                  <option value={48}>48 h antes</option>
                  <option value={0}>No enviar</option>
                </Selector>
              </div>
            }>
              Te recordamos el turno y qué llevar. Si no podés ir, cancelalo para liberar el lugar.
            </Opcion>
          </ul>
        </Tarjeta>

        <Tarjeta className="lg:col-span-2">
          <h2 className="font-medium">Consentimientos</h2>
          <ul className="mt-2 divide-y divide-borde">
            <Opcion titulo="Tratamiento de datos de salud" fechaCambio={c.DATOS_SALUD.fecha} control={
              <Interruptor etiqueta="Tratamiento de datos de salud" activo={c.DATOS_SALUD.otorgado} onChange={(v) => cambiarConsentimiento('datosSalud', v)} />
            }>
              Necesario para guardar tu cuestionario y estudios y orientarte. Ley 25.326.
            </Opcion>
            <Opcion titulo="Recibir convocatorias" fechaCambio={c.CONVOCATORIAS.fecha} control={
              <Interruptor etiqueta="Recibir convocatorias" activo={c.CONVOCATORIAS.otorgado} onChange={(v) => cambiarConsentimiento('convocatorias', v)} />
            }>
              Te avisamos por correo y en la app cuando un centro cercano necesite donantes de tu grupo. Nunca incluimos datos de salud en los mensajes.
            </Opcion>
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
