import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSesion } from '../sesion';
import { Icono, cx } from '../ui';

const NAV = [
  { a: '/app', texto: 'Inicio', icono: 'inicio', fin: true },
  { a: '/app/orientacion', texto: 'Orientación', icono: 'estetoscopio' },
  { a: '/app/turnos', texto: 'Turnos', icono: 'calendario' },
  { a: '/app/historial', texto: 'Historial', icono: 'historial' },
  { a: '/app/perfil', texto: 'Perfil', icono: 'usuario' },
];

const SECUNDARIA = [
  { a: '/app/cuestionario', texto: 'Cuestionario de salud', icono: 'lista' },
  { a: '/app/estudios', texto: 'Estudios médicos', icono: 'archivo' },
  { a: '/app/autoexclusion', texto: 'Autoexclusión confidencial', icono: 'candado' },
];

export function Marca() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <path d="M12 2.5c-3.6 5.1-7.2 9.2-7.2 12.8a7.2 7.2 0 0 0 14.4 0c0-3.6-3.6-7.7-7.2-12.8z" fill="var(--color-sangre)" />
        <path d="M9.2 15.6h5.6M12 12.8v5.6" stroke="var(--color-lima)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      HemoRed
    </span>
  );
}

export function DonanteLayout() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [sinLeer, setSinLeer] = useState(0);

  useEffect(() => {
    api<{ avisosSinLeer: number }>('/donante/resumen').then((r) => setSinLeer(r.avisosSinLeer)).catch(() => undefined);
  }, [pathname]);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const cerrar = async () => {
    await salir();
    navegar('/');
  };

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <NavLink to="/app"><Marca /></NavLink>
          <nav className="hidden md:flex items-center gap-1" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.a} to={n.a} end={n.fin}
                className={({ isActive }) => cx('rounded-lg px-3 py-1.5 text-sm transition', isActive ? 'bg-superficie-2 text-texto' : 'text-tenue hover:text-texto')}>
                {n.texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <NavLink to="/app/avisos" aria-label={`Avisos${sinLeer ? ` (${sinLeer} sin leer)` : ''}`}
              className="relative grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2">
              <Icono nombre="campana" />
              {sinLeer > 0 && (
                <span className="absolute right-1.5 top-1.5 grid min-w-4 h-4 place-items-center rounded-full bg-lima px-1 text-[10px] font-bold text-fondo">{sinLeer}</span>
              )}
            </NavLink>
            <button onClick={cerrar} className="grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2 cursor-pointer" aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icono nombre="salir" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-6 md:grid md:grid-cols-[13rem_1fr] md:gap-8">
        <aside className="hidden md:block">
          <p className="px-3 text-xs uppercase tracking-wider text-tenue/80">Hola, {usuario?.nombre.split(' ')[0]}</p>
          <nav className="mt-3 flex flex-col gap-1" aria-label="Trámites">
            {SECUNDARIA.map((n) => (
              <NavLink key={n.a} to={n.a}
                className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition', isActive ? 'bg-superficie-2 text-texto' : 'text-tenue hover:text-texto hover:bg-superficie')}>
                <Icono nombre={n.icono} className="size-4" />{n.texto}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 aparecer" key={pathname}>
          <Outlet />
        </main>
      </div>

      {/* Navegación inferior en móviles (RNF07: desde 360 px) */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-fondo/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.a} to={n.a} end={n.fin}
              className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2.5 text-[11px] transition', isActive ? 'text-lima' : 'text-tenue')}>
              <Icono nombre={n.icono} className="size-5" />{n.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
