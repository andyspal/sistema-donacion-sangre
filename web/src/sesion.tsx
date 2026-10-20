import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, ApiError, type Usuario } from './api';
import { Cargando } from './ui';

interface ContextoSesion {
  usuario: Usuario | null;
  cargando: boolean;
  recargar: () => Promise<Usuario | null>;
  salir: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    // Solo un 401 significa «sin sesión»; ante un corte momentáneo del servidor se reintenta.
    for (let intento = 0; ; intento++) {
      try {
        const u = await api<Usuario>('/auth/sesion');
        setUsuario(u);
        setCargando(false);
        return u;
      } catch (e) {
        if ((e as ApiError).estado === 401 || intento >= 4) {
          setUsuario(null);
          setCargando(false);
          return null;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }, []);

  const salir = useCallback(async () => {
    await api('/auth/logout', 'POST').catch(() => undefined);
    setUsuario(null);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  return <Contexto.Provider value={{ usuario, cargando, recargar, salir }}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion fuera de SesionProvider');
  return c;
}

export const esPersonal = (u: Usuario | null) => !!u && u.rol !== 'DONANTE';
export const rutaInicio = (u: Usuario) => (u.rol === 'DONANTE' ? '/app' : '/hospital');

/** Protege rutas por tipo de usuario (control de acceso en el cliente; la API vuelve a validarlo). */
export function Protegida({ para, children }: { para: 'DONANTE' | 'PERSONAL'; children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <Cargando pantalla />;
  if (!usuario) return <Navigate to={`/ingresar?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`} replace />;
  const ok = para === 'DONANTE' ? usuario.rol === 'DONANTE' : esPersonal(usuario);
  if (!ok) return <Navigate to={rutaInicio(usuario)} replace />;
  return <>{children}</>;
}
