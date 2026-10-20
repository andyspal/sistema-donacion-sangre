import { Link, Navigate } from 'react-router';
import { Marca } from '../../layouts/DonanteLayout';
import { rutaInicio, useSesion } from '../../sesion';
import { Icono } from '../../ui';

const PASOS = [
  { icono: 'lista', titulo: 'Contanos cómo estás', texto: 'Un cuestionario breve, en menos de 3 minutos.' },
  { icono: 'archivo', titulo: 'Sumá tus estudios', texto: 'Opcional: adjuntá un análisis reciente en PDF.' },
  { icono: 'estetoscopio', titulo: 'Recibí tu orientación', texto: 'Te decimos si es buen momento o desde cuándo podrías donar.' },
  { icono: 'calendario', titulo: 'Reservá tu turno', texto: 'Elegí centro, día y horario sin esperas.' },
];

export function Inicio() {
  const { usuario } = useSesion();
  if (usuario) return <Navigate to={rutaInicio(usuario)} replace />;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Marca />
        <Link to="/ingresar" className="rounded-lg px-3 py-1.5 text-sm text-tenue hover:text-texto">Ingresar</Link>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-12 sm:py-20 max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-borde px-3 py-1 text-xs text-tenue">
            <span className="size-1.5 rounded-full bg-lima" /> Donación voluntaria de sangre · Córdoba
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.05]">
            Sabé si podés donar <span className="text-lima">antes de ir.</span>
          </h1>
          <p className="mt-5 text-lg text-tenue text-pretty">
            Completá tu información desde el celular, recibí una orientación previa y reservá tu turno en el centro de hemoterapia
            más cercano. Sin viajes en vano.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/registro" className="inline-flex items-center gap-2 rounded-xl bg-lima px-5 py-3 font-semibold text-fondo hover:brightness-110">
              Quiero donar <Icono nombre="flecha" className="size-4" />
            </Link>
            <Link to="/ingresar" className="inline-flex items-center rounded-xl border border-borde px-5 py-3 hover:border-tenue/60">
              Ya tengo cuenta
            </Link>
          </div>
        </section>

        <section aria-labelledby="como" className="pb-14">
          <h2 id="como" className="text-sm uppercase tracking-wider text-tenue">Cómo funciona</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="rounded-2xl border border-borde bg-superficie p-4">
                <div className="flex items-center justify-between">
                  <Icono nombre={p.icono} className="size-5 text-lima" />
                  <span className="text-xs text-tenue tabular-nums">0{i + 1}</span>
                </div>
                <p className="mt-4 font-medium">{p.titulo}</p>
                <p className="mt-1 text-sm text-tenue">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-borde bg-superficie p-5">
            <h2 className="font-medium">Requisitos básicos para donar</h2>
            <ul className="mt-3 grid gap-2 text-sm text-tenue">
              {['Tener entre 16 y 65 años (menores de 18, con autorización).', 'Pesar 50 kg o más.', 'Sentirte bien de salud el día de la donación.',
                'Llevar tu DNI y haber desayunado liviano.'].map((r) => (
                <li key={r} className="flex gap-2"><Icono nombre="check" className="size-4 mt-0.5 text-lima" />{r}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-borde bg-superficie p-5 text-sm text-tenue">
            <h2 className="font-medium text-texto">Importante</h2>
            <p className="mt-3">
              La orientación es <strong className="text-texto">orientativa</strong>: no reemplaza la entrevista ni el control médico presencial,
              que es quien decide la aptitud para donar.
            </p>
            <p className="mt-3">Tus datos de salud se guardan cifrados y solo los ve el personal autorizado (Ley 25.326).</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-borde">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-tenue">
          <p>Ley Nacional de Sangre 22.990 · Res. 536/2026 · Ley 25.326 de Protección de Datos Personales</p>
          <Link to="/ingresar" className="hover:text-texto">Acceso para personal del centro</Link>
        </div>
      </footer>
    </div>
  );
}
