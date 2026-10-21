import { Link, Navigate } from 'react-router';
import { Marca } from '../../layouts/DonanteLayout';
import { rutaInicio, useSesion } from '../../sesion';
import { Icono } from '../../ui';

const PASOS = [
  { titulo: 'Contanos cómo estás', texto: 'Un cuestionario breve, en menos de 3 minutos.' },
  { titulo: 'Sumá tus estudios', texto: 'Opcional: adjuntá un análisis reciente en PDF.' },
  { titulo: 'Recibí tu orientación', texto: 'Te decimos si es buen momento o desde cuándo podrías donar.' },
  { titulo: 'Reservá tu turno', texto: 'Elegí centro, día y horario sin esperas.' },
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
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-balance leading-[1.05]">
            Sabé si podés donar antes de ir.
          </h1>
          <p className="mt-5 text-lg text-tenue text-pretty">
            Donación voluntaria de sangre en Córdoba. Completá tu información desde el celular, recibí una orientación previa y reservá tu turno en el centro de hemoterapia
            más cercano. Sin viajes en vano.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/registro" className="inline-flex items-center gap-2 rounded-lg bg-texto px-5 py-3 font-medium text-fondo hover:bg-texto/85">
              Quiero donar <Icono nombre="flecha" className="size-4" />
            </Link>
            <Link to="/ingresar" className="inline-flex items-center rounded-lg border border-borde px-5 py-3 hover:border-tenue/60">
              Ya tengo cuenta
            </Link>
          </div>
        </section>

        <section aria-labelledby="como" className="pb-14">
          <h2 id="como" className="text-2xl font-semibold tracking-tight">Cómo funciona</h2>
          <ol className="mt-6 grid gap-8 rounded-xl bg-superficie p-6 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((p) => (
              <li key={p.titulo}>
                <p className="font-medium">{p.titulo}</p>
                <p className="mt-1.5 text-sm text-tenue">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl bg-superficie p-6">
            <h2 className="font-medium">Requisitos básicos para donar</h2>
            <ul className="mt-3 grid gap-2 text-sm text-tenue">
              {['Tener entre 16 y 65 años (menores de 18, con autorización).', 'Pesar 50 kg o más.', 'Sentirte bien de salud el día de la donación.',
                'Llevar tu DNI y haber desayunado liviano.'].map((r) => (
                <li key={r} className="flex gap-2"><Icono nombre="check" className="size-4 mt-0.5 text-lima" />{r}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-superficie p-6 text-sm text-tenue">
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
