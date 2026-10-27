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
        <path d="M9.2 15.6h5.6M12 12.8v5.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      HemoRed
    </span>
  );
}

/**
 * Pie de la barra lateral: iniciales y datos del usuario, y el cierre de sesión con el mismo
 * formato que los ítems del menú. Con la barra cerrada quedan el círculo y el ícono, alineados.
 */
export function PieBarra({ nombre, detalle, onSalir }: { nombre: string; detalle: string[]; onSalir: () => void }) {
  const iniciales = nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const visible = 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-borde pt-3">
      <div className="flex items-center gap-2.5 px-2 py-1">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primario-suave text-[10px] font-semibold text-primario" aria-hidden="true">
          {iniciales}
        </span>
        <div className={cx('min-w-0 flex-1 leading-tight whitespace-nowrap', visible)}>
          <p className="truncate text-sm font-medium">{nombre}</p>
          {detalle.map((d) => <p key={d} className="truncate text-xs text-tenue">{d}</p>)}
        </div>
      </div>
      <button onClick={onSalir} aria-label="Cerrar sesión" title="Cerrar sesión"
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-tenue transition hover:bg-sangre-suave hover:text-sangre cursor-pointer">
        <Icono nombre="salir" className="size-4" /><span className={cx('whitespace-nowrap', visible)}>Cerrar sesión</span>
      </button>
    </div>
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

  const enlace = ({ isActive }: { isActive: boolean }) => cx(
    'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
    isActive ? 'bg-superficie-2 text-texto' : 'text-tenue hover:text-texto hover:bg-superficie',
  );
  const visible = 'whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

  return (
    <div className="min-h-dvh pb-24 md:grid md:grid-cols-[4rem_1fr] md:pb-0">
      {/* Escritorio: barra lateral de íconos que se expande al pasar el mouse (o al enfocarla con teclado) */}
      <div className="hidden md:block">
        <aside className="group fixed inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden border-r border-borde bg-fondo p-3 transition-[width] duration-200 hover:w-72 focus-within:w-72">
          <NavLink to="/app" className="flex h-10 items-center pl-2 text-transparent transition-colors group-hover:text-texto group-focus-within:text-texto"><Marca /></NavLink>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.a} to={n.a} end={n.fin} className={enlace} title={n.texto}>
                <Icono nombre={n.icono} className="size-4" /><span className={visible}>{n.texto}</span>
              </NavLink>
            ))}
          </nav>
          <nav className="mt-1 flex flex-col gap-1" aria-label="Trámites">
            {SECUNDARIA.map((n) => (
              <NavLink key={n.a} to={n.a} className={enlace} title={n.texto}>
                <Icono nombre={n.icono} className="size-4" /><span className={visible}>{n.texto}</span>
              </NavLink>
            ))}
            <NavLink to="/app/avisos" className={enlace} title="Avisos" aria-label={`Avisos${sinLeer ? ` (${sinLeer} sin leer)` : ''}`}>
              <span className="relative">
                <Icono nombre="campana" className="size-4" />
                {sinLeer > 0 && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primario" />}
              </span>
              <span className={visible}>Avisos{sinLeer > 0 && ` (${sinLeer})`}</span>
            </NavLink>
          </nav>
          <PieBarra nombre={usuario?.nombre ?? ''} detalle={['Donante']} onSalir={cerrar} />
        </aside>
      </div>

      {/* Móvil: barra superior (avisos y salir) */}
      <header className="sticky top-0 z-20 border-b border-borde bg-fondo md:hidden">
        <div className="mx-auto flex h-14 items-center justify-between gap-3 px-4">
          <NavLink to="/app"><Marca /></NavLink>
          <div className="flex items-center gap-1">
            <NavLink to="/app/avisos" aria-label={`Avisos${sinLeer ? ` (${sinLeer} sin leer)` : ''}`}
              className="relative grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2">
              <Icono nombre="campana" />
              {sinLeer > 0 && (
                <span className="absolute right-1.5 top-1.5 grid min-w-4 h-4 place-items-center rounded-full bg-primario px-1 text-[10px] font-bold text-fondo">{sinLeer}</span>
              )}
            </NavLink>
            <button onClick={cerrar} className="grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2 cursor-pointer" aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icono nombre="salir" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-w-0 px-4 pt-6 md:px-10 md:py-8 aparecer" key={pathname}>
        <div className="mx-auto max-w-4xl"><Outlet /></div>
      </main>

      {/* Navegación inferior en móviles (RNF07: desde 360 px) */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-fondo md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.a} to={n.a} end={n.fin}
              className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2.5 text-[11px] transition', isActive ? 'text-primario' : 'text-tenue')}>
              <Icono nombre={n.icono} className="size-5" />{n.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
