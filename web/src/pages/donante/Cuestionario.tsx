import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError, useCarga, type Consentimientos, type DefinicionCuestionario, type Pregunta } from '../../api';
import { hoy, instante } from '../../formato';
import { Alerta, Boton, Cargando, Casilla, Encabezado, Entrada, Segmentado, Tarjeta, cx } from '../../ui';

type Respuestas = Record<string, unknown>;

const visible = (p: Pregunta, r: Respuestas) => !p.mostrarSi || r[p.mostrarSi.pregunta] === p.mostrarSi.igual;
const respondida = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

function ConsentimientoRequerido({ onOtorgado }: { onOtorgado: () => void }) {
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  return (
    <Tarjeta className="flex flex-col gap-3">
      <h2 className="font-medium">Antes de empezar</h2>
      <p className="text-sm text-tenue">Para guardar tus respuestas sobre salud necesitamos tu consentimiento explícito.</p>
      <Casilla marcada={acepta} onChange={setAcepta}>
        Acepto el tratamiento de mis datos de salud para recibir una orientación previa. Se guardan cifrados y solo accede el personal
        sanitario autorizado (Ley 25.326).
      </Casilla>
      <Boton disabled={!acepta} cargando={enviando} className="self-start" onClick={async () => {
        setEnviando(true);
        await api('/donante/consentimientos', 'PUT', { datosSalud: true }).finally(() => setEnviando(false));
        onOtorgado();
      }}>Continuar</Boton>
    </Tarjeta>
  );
}

function CampoPregunta({ p, valor, onChange, error }: { p: Pregunta; valor: unknown; onChange: (v: unknown) => void; error?: string }) {
  switch (p.tipo) {
    case 'si_no':
      return <Segmentado nombre={p.texto} invalida={!!error} valor={valor as boolean | undefined}
        opciones={[{ valor: true, texto: 'Sí' }, { valor: false, texto: 'No' }]} onChange={onChange} />;
    case 'numero':
      return (
        <div className="flex items-center gap-2 max-w-48">
          <Entrada type="number" inputMode="decimal" min={p.min} max={p.max} aria-label={p.texto} invalida={!!error}
            value={(valor as number | undefined) ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
          {p.unidad && <span className="text-tenue">{p.unidad}</span>}
        </div>
      );
    case 'fecha':
      return <Entrada type="date" className="max-w-56" aria-label={p.texto} max={p.noFutura ? hoy() : undefined} invalida={!!error}
        value={(valor as string | undefined) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'opcion':
      return (
        <div className="grid gap-2" role="radiogroup" aria-label={p.texto}>
          {p.opciones!.map((o) => {
            const activa = valor === o.valor;
            return (
              <button key={o.valor} type="button" role="radio" aria-checked={activa} onClick={() => onChange(o.valor)}
                className={cx('flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition cursor-pointer',
                  activa ? 'border-primario/60 bg-primario-suave' : error ? 'border-sangre' : 'border-borde hover:border-tenue/50')}>
                <span className={cx('grid size-4 place-items-center rounded-full border', activa ? 'border-primario' : 'border-tenue/60')}>
                  {activa && <span className="size-2 rounded-full bg-primario" />}
                </span>
                {o.texto}
              </button>
            );
          })}
        </div>
      );
    case 'multiple': {
      const lista = (valor as string[] | undefined) ?? [];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {p.opciones!.map((o) => (
            <Casilla key={o.valor} marcada={lista.includes(o.valor)} onChange={(m) => {
              if (!m) return onChange(lista.filter((x) => x !== o.valor));
              // La opción exclusiva («ninguna») limpia las demás y viceversa.
              onChange(o.valor === p.exclusiva ? [o.valor] : [...lista.filter((x) => x !== p.exclusiva), o.valor]);
            }}>{o.texto}</Casilla>
          ))}
        </div>
      );
    }
  }
}

export function Cuestionario() {
  const navegar = useNavigate();
  const { datos: def, cargando: c1 } = useCarga<DefinicionCuestionario>('/cuestionario/definicion');
  const { datos: previo, cargando: c2 } = useCarga<{ respuestas: Respuestas; declaradoEn: string } | null>('/donante/cuestionario');
  const { datos: perfil, cargando: c3, recargar } = useCarga<{ consentimientos: Consentimientos }>('/donante/perfil');
  const [r, setR] = useState<Respuestas>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (previo) setR(previo.respuestas); }, [previo]);

  const visibles = useMemo(() => def?.secciones.flatMap((s) => s.preguntas).filter((p) => visible(p, r)) ?? [], [def, r]);
  const completas = visibles.filter((p) => respondida(r[p.id])).length;

  if (c1 || c2 || c3) return <Cargando />;
  if (!def || !perfil) return <Alerta tono="sangre">No se pudo cargar el cuestionario.</Alerta>;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    try {
      const limpias = Object.fromEntries(visibles.map((p) => [p.id, r[p.id]]));
      await api('/donante/cuestionario', 'POST', { respuestas: limpias });
      navegar('/app/orientacion', { state: { solicitar: true } });
    } catch (err) {
      const ae = err as ApiError;
      const errs = ae.detalle?.errores ?? {};
      setErrores(errs);
      setMensaje(ae.message);
      const primero = Object.keys(errs)[0];
      document.getElementById(`p-${primero}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Encabezado titulo={def.titulo}
        bajada={previo ? `Última declaración: ${instante(previo.declaradoEn)} — revisá y actualizá lo que haya cambiado.` : def.descripcion} />

      {!perfil.consentimientos.DATOS_SALUD.otorgado ? <ConsentimientoRequerido onOtorgado={recargar} /> : (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="sticky top-14 z-10 -mx-4 bg-fondo px-4 py-2">
            <div className="flex items-center justify-between text-xs text-tenue">
              <span>{completas} de {visibles.length} respondidas</span>
              <span>Declaración jurada</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-superficie-2" role="progressbar" aria-valuemin={0} aria-valuemax={visibles.length} aria-valuenow={completas}>
              <div className="h-full rounded-full bg-primario transition-all" style={{ width: `${(completas / Math.max(visibles.length, 1)) * 100}%` }} />
            </div>
          </div>

          {def.secciones.map((s) => (
            <Tarjeta key={s.id} className="flex flex-col gap-5">
              <h2 className="text-sm font-medium text-tenue">{s.titulo}</h2>
              {s.preguntas.filter((p) => visible(p, r)).map((p) => (
                <fieldset key={p.id} id={`p-${p.id}`} className={cx('flex flex-col gap-2.5 aparecer', p.mostrarSi && 'border-l-2 border-borde pl-4')}>
                  <legend className="font-medium leading-snug mb-2.5">{p.texto}</legend>
                  {p.ayuda && <p className="-mt-1.5 text-sm text-tenue">{p.ayuda}</p>}
                  <CampoPregunta p={p} valor={r[p.id]} error={errores[p.id]} onChange={(v) => {
                    setR((x) => ({ ...x, [p.id]: v }));
                    setErrores((x) => ({ ...x, [p.id]: '' }));
                  }} />
                  {errores[p.id] && <p className="text-sm text-sangre" role="alert">{errores[p.id]}</p>}
                </fieldset>
              ))}
            </Tarjeta>
          ))}

          {mensaje && <Alerta tono="sangre">{mensaje}</Alerta>}
          <p className="text-xs text-tenue">{def.descripcion}</p>
          <Boton type="submit" cargando={enviando} className="sm:self-end">Guardar y obtener mi orientación</Boton>
        </form>
      )}
    </>
  );
}
