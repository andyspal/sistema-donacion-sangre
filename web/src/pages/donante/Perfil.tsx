import { useEffect, useState } from 'react';
import { api, ApiError, useCarga, type Consentimientos } from '../../api';
import { LOCALIDADES, fecha, instante } from '../../formato';
import { Alerta, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, cx } from '../../ui';

interface PerfilDonante {
  email: string; dni: string; nombres: string; apellidos: string; fechaNacimiento: string; sexoBiologico: 'M' | 'F';
  telefono: string; domicilio: string | null; localidad: string; grupoAbo: string | null; factorRh: string | null;
  consentimientos: Consentimientos;
}

function Interruptor({ activo, onChange, etiqueta }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={() => onChange(!activo)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition cursor-pointer', activo ? 'bg-primario' : 'bg-superficie-2 border border-borde')}>
      <span className={cx('absolute top-1 size-5 rounded-full transition-all', activo ? 'left-6 bg-fondo' : 'left-1 bg-tenue')} />
    </button>
  );
}

export function Perfil() {
  const { datos: p, cargando, recargar } = useCarga<PerfilDonante>('/donante/perfil');
  const [f, setF] = useState({ telefono: '', localidad: '', domicilio: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);

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

  const datos: [string, string][] = [
    ['Nombre', `${p.nombres} ${p.apellidos}`], ['DNI', p.dni], ['Nacimiento', fecha(p.fechaNacimiento)],
    ['Sexo biológico', p.sexoBiologico === 'F' ? 'Femenino' : 'Masculino'],
    ['Grupo sanguíneo', p.grupoAbo ? `${p.grupoAbo}${p.factorRh}` : 'Sin confirmar'], ['Correo', p.email],
  ];

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
          <h2 className="font-medium">Consentimientos</h2>
          <ul className="mt-3 divide-y divide-borde">
            <li className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="font-medium">Tratamiento de datos de salud</p>
                <p className="text-sm text-tenue">Necesario para guardar tu cuestionario y estudios y orientarte. Ley 25.326.</p>
                {p.consentimientos.DATOS_SALUD.fecha && <p className="text-xs text-tenue/70 mt-1">Último cambio: {instante(p.consentimientos.DATOS_SALUD.fecha)}</p>}
              </div>
              <Interruptor etiqueta="Tratamiento de datos de salud" activo={p.consentimientos.DATOS_SALUD.otorgado} onChange={(v) => cambiarConsentimiento('datosSalud', v)} />
            </li>
            <li className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="font-medium">Recibir convocatorias</p>
                <p className="text-sm text-tenue">Te avisamos cuando un centro cercano necesite donantes de tu grupo. Nunca incluimos datos de salud en los mensajes.</p>
                {p.consentimientos.CONVOCATORIAS.fecha && <p className="text-xs text-tenue/70 mt-1">Último cambio: {instante(p.consentimientos.CONVOCATORIAS.fecha)}</p>}
              </div>
              <Interruptor etiqueta="Recibir convocatorias" activo={p.consentimientos.CONVOCATORIAS.otorgado} onChange={(v) => cambiarConsentimiento('convocatorias', v)} />
            </li>
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
