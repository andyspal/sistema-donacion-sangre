import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../../api';
import { LOCALIDADES, hoy } from '../../formato';
import { Marca } from '../../layouts/DonanteLayout';
import { useSesion } from '../../sesion';
import { Alerta, Boton, Campo, Casilla, Entrada, Segmentado, Selector, Tarjeta } from '../../ui';

const INICIAL = {
  nombres: '', apellidos: '', dni: '', fechaNacimiento: '', sexoBiologico: '' as '' | 'M' | 'F',
  email: '', telefono: '', localidad: '', domicilio: '', grupo: '', contrasena: '',
  consentimientoDatosSalud: false, consentimientoConvocatorias: false,
};

export function Registro() {
  const { usuario, recargar } = useSesion();
  const navegar = useNavigate();
  const [f, setF] = useState(INICIAL);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/app" replace />;

  const set = <K extends keyof typeof INICIAL>(k: K, v: (typeof INICIAL)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrores((e) => ({ ...e, [k]: '' }));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    try {
      const [grupoAbo, factorRh] = f.grupo ? [f.grupo.slice(0, -1), f.grupo.slice(-1)] : ['', ''];
      await api('/auth/registro', 'POST', { ...f, grupoAbo, factorRh });
      await recargar();
      navegar('/app', { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      setErrores(ae.detalle?.errores ?? {});
      setMensaje(ae.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  };

  const err = (k: string) => errores[k] || undefined;

  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link to="/"><Marca /></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Registrate como donante</h1>
        <p className="mt-1 text-tenue">Te pedimos lo justo para orientarte y contactarte. Lleva un par de minutos.</p>

        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          {mensaje && <Alerta tono="sangre">{mensaje}</Alerta>}

          <Tarjeta className="grid gap-4 sm:grid-cols-2">
            <h2 className="sm:col-span-2 font-medium">Tus datos</h2>
            <Campo etiqueta="Nombres" id="nombres" error={err('nombres')}>
              <Entrada id="nombres" autoComplete="given-name" value={f.nombres} invalida={!!err('nombres')} onChange={(e) => set('nombres', e.target.value)} />
            </Campo>
            <Campo etiqueta="Apellidos" id="apellidos" error={err('apellidos')}>
              <Entrada id="apellidos" autoComplete="family-name" value={f.apellidos} invalida={!!err('apellidos')} onChange={(e) => set('apellidos', e.target.value)} />
            </Campo>
            <Campo etiqueta="DNI" id="dni" error={err('dni')}>
              <Entrada id="dni" inputMode="numeric" value={f.dni} invalida={!!err('dni')} placeholder="Sin puntos" onChange={(e) => set('dni', e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de nacimiento" id="nac" error={err('fechaNacimiento')}>
              <Entrada id="nac" type="date" max={hoy()} value={f.fechaNacimiento} invalida={!!err('fechaNacimiento')} onChange={(e) => set('fechaNacimiento', e.target.value)} />
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="Sexo biológico" error={err('sexoBiologico')}
                ayuda="Se usa para los intervalos entre donaciones y los valores de referencia de hemoglobina.">
                <div>
                  <Segmentado nombre="Sexo biológico" invalida={!!err('sexoBiologico')} valor={f.sexoBiologico || undefined}
                    opciones={[{ valor: 'F', texto: 'Femenino' }, { valor: 'M', texto: 'Masculino' }]} onChange={(v) => set('sexoBiologico', v)} />
                </div>
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta className="grid gap-4 sm:grid-cols-2">
            <h2 className="sm:col-span-2 font-medium">Contacto y ubicación</h2>
            <Campo etiqueta="Correo electrónico" id="email" error={err('email')}>
              <Entrada id="email" type="email" autoComplete="email" value={f.email} invalida={!!err('email')} onChange={(e) => set('email', e.target.value)} />
            </Campo>
            <Campo etiqueta="Teléfono celular" id="tel" error={err('telefono')}>
              <Entrada id="tel" type="tel" autoComplete="tel" value={f.telefono} invalida={!!err('telefono')} placeholder="351 555 1234" onChange={(e) => set('telefono', e.target.value)} />
            </Campo>
            <Campo etiqueta="Localidad" id="loc" error={err('localidad')} ayuda="Para convocarte solo desde centros cercanos.">
              <Selector id="loc" value={f.localidad} invalida={!!err('localidad')} onChange={(e) => set('localidad', e.target.value)}>
                <option value="">Elegí tu localidad</option>
                {LOCALIDADES.map((l) => <option key={l}>{l}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta={<>Domicilio <span className="text-tenue font-normal">(opcional)</span></>} id="dom">
              <Entrada id="dom" autoComplete="street-address" value={f.domicilio} onChange={(e) => set('domicilio', e.target.value)} />
            </Campo>
          </Tarjeta>

          <Tarjeta className="grid gap-4 sm:grid-cols-2">
            <h2 className="sm:col-span-2 font-medium">Cuenta</h2>
            <Campo etiqueta="Grupo sanguíneo" id="grupo" error={err('grupoAbo')} ayuda="Si no lo sabés, lo confirmamos en tu primera donación.">
              <Selector id="grupo" value={f.grupo} onChange={(e) => set('grupo', e.target.value)}>
                <option value="">No sé</option>
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((g) => <option key={g}>{g}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Contraseña" id="pass" error={err('contrasena')} ayuda="Mínimo 8 caracteres, con letras y números.">
              <Entrada id="pass" type="password" autoComplete="new-password" value={f.contrasena} invalida={!!err('contrasena')} onChange={(e) => set('contrasena', e.target.value)} />
            </Campo>
          </Tarjeta>

          <Tarjeta className="flex flex-col gap-3">
            <h2 className="font-medium">Consentimientos</h2>
            <Casilla marcada={f.consentimientoDatosSalud} onChange={(v) => set('consentimientoDatosSalud', v)}>
              <strong>Acepto el tratamiento de mis datos de salud</strong> (cuestionario y estudios) para recibir una orientación previa.
              Se guardan cifrados y solo accede el personal sanitario autorizado (Ley 25.326). <span className="text-tenue">Necesario para la orientación.</span>
            </Casilla>
            <Casilla marcada={f.consentimientoConvocatorias} onChange={(v) => set('consentimientoConvocatorias', v)}>
              <strong>Quiero recibir convocatorias</strong> cuando un centro cercano necesite donantes de mi grupo sanguíneo.
              <span className="text-tenue"> Opcional; podés cambiarlo cuando quieras.</span>
            </Casilla>
          </Tarjeta>

          <Boton type="submit" cargando={enviando} className="self-stretch sm:self-end">Crear mi cuenta</Boton>
          <p className="text-sm text-tenue">¿Ya tenés cuenta? <Link to="/ingresar" className="text-lima hover:underline">Ingresá</Link></p>
        </form>
      </div>
    </div>
  );
}
