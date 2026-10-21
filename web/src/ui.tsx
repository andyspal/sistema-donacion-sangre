import { useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Íconos (trazo 2px, heredan el color del texto)
// ---------------------------------------------------------------------------

const RUTAS: Record<string, ReactNode> = {
  gota: <path d="M12 3c-3.5 5-7 9-7 12.5a7 7 0 0 0 14 0C19 12 15.5 8 12 3z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  archivo: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  escudo: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  campana: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  salir: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  flecha: <path d="M9 5l7 7-7 7" />,
  atras: <path d="M15 5l-7 7 7 7" />,
  alerta: <><path d="M12 4L2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></>,
  candado: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  caja: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
  megafono: <><path d="M4 10v4h3l8 5V5L7 10z" /><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  mas: <path d="M12 5v14M5 12h14" />,
  basura: <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  historial: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4M12 8v4.5l3 1.5" /></>,
  lista: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  inicio: <><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" /></>,
  estetoscopio: <><path d="M6 3v6a5 5 0 0 0 10 0V3" /><path d="M11 14v2a5 5 0 0 0 10 0v-2" /><circle cx="21" cy="12" r="1.5" /></>,
};

export function Icono({ nombre, className = '' }: { nombre: keyof typeof RUTAS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={cx('shrink-0', !/\bsize-/.test(className) && 'size-5', className)} aria-hidden="true">
      {RUTAS[nombre]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-texto text-fondo hover:bg-texto/85 font-medium',
  secundario: 'bg-superficie-2 text-texto border border-borde hover:border-tenue/60',
  fantasma: 'text-tenue hover:text-texto hover:bg-superficie-2',
  peligro: 'bg-sangre-suave text-sangre border border-sangre/40 hover:bg-sangre/25',
};

export function Boton({ variante = 'primario', cargando, chico, className, children, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; chico?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        chico ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-[15px]',
        VARIANTES[variante], className,
      )}
    >
      {cargando && <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Contenedores
// ---------------------------------------------------------------------------

export function Tarjeta({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx('rounded-xl border border-borde bg-superficie p-4 sm:p-5', className)}>{children}</div>;
}

export function Encabezado({ titulo, bajada, acciones, volver }: { titulo: string; bajada?: ReactNode; acciones?: ReactNode; volver?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {volver}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
        {bajada && <p className="mt-1 text-tenue text-pretty">{bajada}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </header>
  );
}

type Tono = 'lima' | 'ambar' | 'cielo' | 'sangre' | 'neutro';
const TONOS: Record<Tono, string> = {
  lima: 'bg-lima-suave text-lima border-lima/30',
  ambar: 'bg-ambar-suave text-ambar border-ambar/30',
  cielo: 'bg-cielo-suave text-cielo border-cielo/30',
  sangre: 'bg-sangre-suave text-sangre border-sangre/30',
  neutro: 'bg-superficie-2 text-tenue border-borde',
};

export function Insignia({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONOS[tono], className)}>
      {children}
    </span>
  );
}

export function Alerta({ tono = 'cielo', titulo, children, icono, className }: { tono?: Tono; titulo?: ReactNode; children?: ReactNode; icono?: string; className?: string }) {
  const ic = icono ?? (tono === 'sangre' || tono === 'ambar' ? 'alerta' : tono === 'lima' ? 'check' : 'info');
  return (
    <div role={tono === 'sangre' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-3.5 text-sm', TONOS[tono], className)}>
      <Icono nombre={ic} className="size-5 mt-px" />
      <div className="min-w-0 text-texto/90">
        {titulo && <p className="font-medium text-texto">{titulo}</p>}
        {children && <div className={titulo ? 'mt-0.5 text-tenue' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Cargando({ pantalla, texto = 'Cargando…' }: { pantalla?: boolean; texto?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-3 text-tenue', pantalla ? 'min-h-dvh' : 'py-12')} role="status">
      <span className="size-5 rounded-full border-2 border-lima border-t-transparent animate-spin" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Vacio({ icono = 'info', titulo, children }: { icono?: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde px-6 py-10 text-center">
      <Icono nombre={icono} className="size-8 text-tenue" />
      <p className="font-medium">{titulo}</p>
      {children && <div className="text-sm text-tenue max-w-sm">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

export function Campo({ etiqueta, error, ayuda, children, id }: { etiqueta: ReactNode; error?: string; ayuda?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto/90">{etiqueta}</label>
      {children}
      {error ? <p className="text-sm text-sangre" role="alert">{error}</p> : ayuda ? <p className="text-xs text-tenue">{ayuda}</p> : null}
    </div>
  );
}

const ESTILO_ENTRADA = 'w-full rounded-lg border bg-fondo px-3.5 py-2.5 text-[15px] text-texto placeholder:text-tenue/60 transition focus:outline-none focus:border-lima';

export function Entrada({ invalida, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalida?: boolean }) {
  return <input {...props} aria-invalid={invalida || undefined} className={cx(ESTILO_ENTRADA, invalida ? 'border-sangre' : 'border-borde', className)} />;
}

export function Selector({ invalida, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalida?: boolean }) {
  return (
    <select {...props} aria-invalid={invalida || undefined} className={cx(ESTILO_ENTRADA, 'appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', invalida ? 'border-sangre' : 'border-borde', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

/** Selector segmentado (Sí/No, opciones cortas). */
export function Segmentado<T extends string | boolean>({ opciones, valor, onChange, nombre, invalida }: {
  opciones: { valor: T; texto: string }[]; valor: T | undefined; onChange: (v: T) => void; nombre: string; invalida?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className={cx('inline-flex rounded-lg border p-1 gap-1', invalida ? 'border-sangre' : 'border-borde')}>
      {opciones.map((o) => {
        const activo = valor === o.valor;
        return (
          <button key={String(o.valor)} type="button" role="radio" aria-checked={activo} onClick={() => onChange(o.valor)}
            className={cx('min-w-16 rounded-md px-4 py-1.5 text-sm font-medium transition cursor-pointer',
              activo ? 'bg-lima text-fondo' : 'text-tenue hover:text-texto hover:bg-superficie-2')}>
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

export function Casilla({ marcada, onChange, children, deshabilitada }: { marcada: boolean; onChange: (v: boolean) => void; children: ReactNode; deshabilitada?: boolean }) {
  const id = useId();
  return (
    <label className={cx('flex items-start gap-3 rounded-lg border px-3.5 py-3 transition',
      deshabilitada ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      marcada ? 'border-lima/60 bg-lima-suave' : 'border-borde hover:border-tenue/50')}>
      <input type="checkbox" className="peer sr-only" aria-labelledby={id} checked={marcada} disabled={deshabilitada} onChange={(e) => onChange(e.target.checked)} />
      <span className={cx('mt-0.5 grid size-5 place-items-center rounded-md border transition peer-focus-visible:outline-2 peer-focus-visible:outline-lima',
        marcada ? 'bg-lima border-lima text-fondo' : 'border-tenue/60')}>
        {marcada && <Icono nombre="check" className="size-3.5" />}
      </span>
      <span id={id} className="text-sm leading-relaxed">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Diálogo modal accesible (usa <dialog>)
// ---------------------------------------------------------------------------

export function Dialogo({ abierto, onCerrar, titulo, children, acciones }: {
  abierto: boolean; onCerrar: () => void; titulo: string; children: ReactNode; acciones?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} onClose={onCerrar} onCancel={onCerrar}
      className="m-auto w-[min(92vw,30rem)] rounded-xl border border-borde bg-superficie p-0 text-texto backdrop:bg-black/70">
      <div className="p-5">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <div className="mt-2 text-tenue text-[15px] leading-relaxed">{children}</div>
        {acciones && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{acciones}</div>}
      </div>
    </dialog>
  );
}

export { cx };
