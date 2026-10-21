import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api';
import { Marca } from '../../layouts/DonanteLayout';
import { rutaInicio, useSesion } from '../../sesion';
import { Alerta, Boton, Campo, Entrada } from '../../ui';

const DEMO = [
  ['lucia@hemored.test', 'Donante2026', 'Donante con orientación favorable y donaciones'],
  ['martin@hemored.test', 'Donante2026', 'Donante con intervalo de descanso pendiente'],
  ['medico@hemored.test', 'Hemored2026', 'Profesional médico'],
  ['admision@hemored.test', 'Hemored2026', 'Administración'],
  ['inventario@hemored.test', 'Hemored2026', 'Responsable de inventario'],
];

export function Ingresar() {
  const { usuario, recargar } = useSesion();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const destino = (u: NonNullable<typeof usuario>) => {
    const volver = params.get('volver');
    return volver && volver.startsWith(rutaInicio(u)) ? volver : rutaInicio(u);
  };

  if (usuario) return <Navigate to={destino(usuario)} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api('/auth/login', 'POST', { email, contrasena });
      const u = await recargar();
      navegar(u ? destino(u) : '/', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/"><Marca /></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Ingresá a tu cuenta</h1>
        <p className="mt-1 text-tenue">Donantes y personal de los centros.</p>

        <form onSubmit={enviar} className="mt-6 flex flex-col gap-4" noValidate>
          {error && <Alerta tono="sangre">{error}</Alerta>}
          <Campo etiqueta="Correo electrónico" id="email">
            <Entrada id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo etiqueta="Contraseña" id="contrasena">
            <Entrada id="contrasena" type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </Campo>
          <Boton type="submit" cargando={enviando} className="mt-1">Ingresar</Boton>
        </form>

        <p className="mt-6 text-sm text-tenue">
          ¿Todavía no tenés cuenta? <Link to="/registro" className="text-lima hover:underline">Registrate como donante</Link>
        </p>

        <details className="mt-8 rounded-lg border border-dashed border-borde p-3 text-sm">
          <summary className="cursor-pointer text-tenue">Cuentas de demostración</summary>
          <ul className="mt-3 grid gap-2">
            {DEMO.map(([e, c, d]) => (
              <li key={e}>
                <button type="button" onClick={() => { setEmail(e); setContrasena(c); }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-superficie-2 cursor-pointer">
                  <span className="block font-mono text-xs">{e}</span>
                  <span className="block text-xs text-tenue">{d}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
