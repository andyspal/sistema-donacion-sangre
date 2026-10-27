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

  const cerrar = async () => { await salir(); navegar('/'); };
  const enlace = (vertical: boolean) => ({ isActive }: { isActive: boolean }) => cx(
    'flex shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm transition',
    vertical ? 'py-2' : 'py-1.5',
    isActive ? 'bg-superficie-2 text-texto' : 'text-tenue hover:text-texto hover:bg-superficie',
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[4rem_1fr]">
      {/* Escritorio: barra lateral de íconos que se expande al pasar el mouse (o al enfocarla con teclado) */}
      <div className="hidden md:block">
        <aside className="group fixed inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden border-r border-borde bg-fondo p-3 transition-[width] duration-200 hover:w-60 focus-within:w-60">
          <div className="flex h-10 items-center pl-2 text-transparent transition-colors group-hover:text-texto group-focus-within:text-texto"><Marca /></div>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Panel">
            {nav.map((n) => (
              <NavLink key={n.a} to={n.a} end={n.fin} className={enlace(true)} title={n.texto}>
                <Icono nombre={n.icono} className="size-4" />
                <span className="whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{n.texto}</span>
              </NavLink>
            ))}
          </nav>
          {/* Mismo formato que los ítems del menú: el ícono queda en la misma columna. */}
          <div className="mt-auto flex flex-col rounded-lg bg-superficie">
            <div className="hidden min-w-0 px-3 pt-2 leading-tight whitespace-nowrap group-hover:block group-focus-within:block">
              <p className="truncate text-sm">{usuario?.nombre}</p>
              <p className="truncate text-xs text-tenue">{usuario && NOMBRE_ROL[usuario.rol]}</p>
              {centro && <p className="truncate text-xs text-tenue">{centro.nombre}</p>}
            </div>
            <button onClick={cerrar} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-tenue transition hover:text-texto hover:bg-superficie-2 cursor-pointer" aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icono nombre="salir" className="size-4" />
              <span className="whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Cerrar sesión</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Móvil: barra superior con navegación deslizable */}
      <header className="sticky top-0 z-20 border-b border-borde bg-fondo md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Marca />
          <button onClick={cerrar} className="grid size-10 place-items-center rounded-lg text-tenue hover:text-texto hover:bg-superficie-2 cursor-pointer" aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icono nombre="salir" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto scroll-oculto px-4 pb-2" aria-label="Panel">
          {nav.map((n) => (
            <NavLink key={n.a} to={n.a} end={n.fin} className={enlace(false)}>
              <Icono nombre={n.icono} className="size-4" />{n.texto}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0 px-4 py-6 md:px-10 md:py-8 aparecer">
        <div className="mx-auto max-w-5xl"><Outlet /></div>
      </main>
    </div>
  );
}
