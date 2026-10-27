import { NavLink, Outlet, useNavigate } from 'react-router';
import { useCarga, type Centro } from '../api';
import { NOMBRE_ROL } from '../formato';
import { useSesion } from '../sesion';
import { Icono, cx } from '../ui';
import { Marca, PieBarra } from './DonanteLayout';

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
        <aside className="group fixed inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden border-r border-borde bg-fondo p-3 transition-[width] duration-200 hover:w-72 focus-within:w-72">
          <div className="flex h-10 items-center pl-2 text-transparent transition-colors group-hover:text-texto group-focus-within:text-texto"><Marca /></div>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Panel">
            {nav.map((n) => (
              <NavLink key={n.a} to={n.a} end={n.fin} className={enlace(true)} title={n.texto}>
                <Icono nombre={n.icono} className="size-4" />
                <span className="whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{n.texto}</span>
              </NavLink>
            ))}
          </nav>
          <PieBarra nombre={usuario?.nombre ?? ''} onSalir={cerrar}
            detalle={[usuario ? NOMBRE_ROL[usuario.rol] : '', centro?.nombre ?? ''].filter(Boolean)} />
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
