import { NavLink, Outlet, useNavigate } from 'react-router';
import { useCarga, type Centro } from '../api';
import { NOMBRE_ROL } from '../formato';
import { useSesion } from '../sesion';
import { Icono, cx } from '../ui';
import { Marca } from './DonanteLayout';

export function HospitalLayout() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();
  const { datos: centro } = useCarga<Centro>('/hospital/centro');
  const clinico = usuario?.rol === 'MEDICO' || usuario?.rol === 'ADMINISTRADOR';

  const nav = [
    { a: '/hospital', texto: 'Agenda', icono: 'calendario', fin: true },
    { a: '/hospital/postulantes', texto: 'Postulantes', icono: 'lupa' },
    { a: '/hospital/inventario', texto: 'Inventario', icono: 'caja' },
    { a: '/hospital/convocatorias', texto: 'Convocatorias', icono: 'megafono' },
    ...(clinico ? [{ a: '/hospital/autoexclusiones', texto: 'Autoexclusiones', icono: 'candado' }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Marca />
            <span className="hidden sm:inline text-tenue text-sm truncate">· Panel hospitalario{centro ? ` — ${centro.nombre}` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm">{usuario?.nombre}</p>
              <p className="text-xs text-tenue">{usuario && NOMBRE_ROL[usuario.rol]}</p>
            </div>
            <button onClick={async () => { await salir(); navegar('/'); }}
              className="grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2 cursor-pointer" aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icono nombre="salir" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto scroll-oculto px-4 pb-2" aria-label="Panel">
          {nav.map((n) => (
            <NavLink key={n.a} to={n.a} end={n.fin}
              className={({ isActive }) => cx('flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                isActive ? 'bg-superficie-2 text-texto' : 'text-tenue hover:text-texto')}>
              <Icono nombre={n.icono} className="size-4" />{n.texto}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 aparecer">
        <Outlet />
      </main>
    </div>
  );
}
