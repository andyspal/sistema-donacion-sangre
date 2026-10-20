import { useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, useCarga, type ResultadoOrientacion } from '../../api';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fechaLarga, hoy } from '../../formato';
import { useSesion } from '../../sesion';
import { Alerta, Boton, Campo, Cargando, Encabezado, Entrada, Icono, Insignia, Tarjeta, Vacio, cx } from '../../ui';

interface Franja {
  id: number; inicio: string; fin: string; cupoMaximo: number;
  turnos: { id: number; estado: string; idDonante: number; dni: string; nombre: string; ultimaOrientacion: ResultadoOrientacion | null }[];
}

const mover = (f: string, dias: number) => {
  const d = new Date(`${f}T00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function GenerarAgenda({ onCreada }: { onCreada: () => void }) {
  const [f, setF] = useState({ desde: mover(hoy(), 1), hasta: mover(hoy(), 14), horaInicio: '07:30', horaFin: '12:00', duracionMin: 30, cupo: 3, diasSemana: [1, 2, 3, 4, 5] });
  const [msg, setMsg] = useState<{ tono: 'lima' | 'sangre'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return (
    <details className="mt-6 rounded-2xl border border-borde bg-superficie p-4">
      <summary className="cursor-pointer font-medium">Configurar días, horarios y cupos</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Campo etiqueta="Desde" id="g-desde"><Entrada id="g-desde" type="date" min={hoy()} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta" id="g-hasta"><Entrada id="g-hasta" type="date" min={f.desde} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo etiqueta="Hora inicio" id="g-hi"><Entrada id="g-hi" type="time" value={f.horaInicio} onChange={(e) => setF({ ...f, horaInicio: e.target.value })} /></Campo>
        <Campo etiqueta="Hora fin" id="g-hf"><Entrada id="g-hf" type="time" value={f.horaFin} onChange={(e) => setF({ ...f, horaFin: e.target.value })} /></Campo>
        <Campo etiqueta="Duración (min)" id="g-dur"><Entrada id="g-dur" type="number" min={10} max={240} value={f.duracionMin} onChange={(e) => setF({ ...f, duracionMin: Number(e.target.value) })} /></Campo>
        <Campo etiqueta="Cupo por franja" id="g-cupo"><Entrada id="g-cupo" type="number" min={1} max={50} value={f.cupo} onChange={(e) => setF({ ...f, cupo: Number(e.target.value) })} /></Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {DIAS.map((d, i) => {
          const activo = f.diasSemana.includes(i);
          return (
            <button key={d} type="button" aria-pressed={activo} onClick={() => setF({ ...f, diasSemana: activo ? f.diasSemana.filter((x) => x !== i) : [...f.diasSemana, i] })}
              className={cx('rounded-lg border px-3 py-1.5 text-sm cursor-pointer', activo ? 'border-lima bg-lima-suave text-lima' : 'border-borde text-tenue')}>{d}</button>
          );
        })}
      </div>
      {msg && <Alerta tono={msg.tono} className="mt-3">{msg.texto}</Alerta>}
      <Boton className="mt-4" variante="secundario" cargando={enviando} onClick={async () => {
        setEnviando(true);
        try {
          const r = await api<{ creadas: number }>('/hospital/agenda/generar', 'POST', f);
          setMsg({ tono: 'lima', texto: `Se crearon ${r.creadas} franjas nuevas (las existentes se conservan).` });
          onCreada();
        } catch (e) {
          setMsg({ tono: 'sangre', texto: (e as ApiError).message });
        } finally {
          setEnviando(false);
        }
      }}>Generar franjas</Boton>
    </details>
  );
}

export function Agenda() {
  const { usuario } = useSesion();
  const [dia, setDia] = useState(hoy());
  const { datos, cargando, recargar } = useCarga<Franja[]>(`/hospital/agenda?fecha=${dia}`);
  const total = datos?.reduce((s, f) => s + f.turnos.length, 0) ?? 0;
  const capacidad = datos?.reduce((s, f) => s + f.cupoMaximo, 0) ?? 0;

  return (
    <>
      <Encabezado titulo="Agenda de turnos" bajada={`${fechaLarga(dia)} · ${total} de ${capacidad} lugares reservados`}
        acciones={
          <div className="flex items-center gap-1">
            <Boton variante="secundario" chico aria-label="Día anterior" onClick={() => setDia(mover(dia, -1))}><Icono nombre="atras" className="size-4" /></Boton>
            <Entrada type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="w-40 py-1.5" aria-label="Fecha" />
            <Boton variante="secundario" chico aria-label="Día siguiente" onClick={() => setDia(mover(dia, 1))}><Icono nombre="flecha" className="size-4" /></Boton>
          </div>
        } />

      {cargando && !datos ? <Cargando /> : !datos?.length ? (
        <Vacio icono="calendario" titulo="No hay franjas de atención este día">Podés configurarlas abajo.</Vacio>
      ) : (
        <div className="grid gap-2">
          {datos.map((f) => (
            <Tarjeta key={f.id} className="grid gap-3 py-3 sm:grid-cols-[7rem_1fr] sm:py-3">
              <div className="flex items-baseline justify-between sm:block">
                <p className="font-semibold tabular-nums">{f.inicio.slice(11)} h</p>
                <p className="text-xs text-tenue">{f.turnos.length}/{f.cupoMaximo} reservados</p>
              </div>
              {f.turnos.length ? (
                <ul className="grid gap-1.5">
                  {f.turnos.map((t) => (
                    <li key={t.id}>
                      <Link to={`/hospital/postulantes/${t.idDonante}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-superficie-2 px-3 py-2 hover:bg-borde/60">
                        <span><span className="font-medium">{t.nombre}</span> <span className="text-sm text-tenue">· DNI {t.dni}</span></span>
                        <span className="flex gap-1.5">
                          {t.ultimaOrientacion && <Insignia tono={TONO_RESULTADO[t.ultimaOrientacion]}>{ETIQUETA_RESULTADO[t.ultimaOrientacion]}</Insignia>}
                          <Insignia tono={t.estado === 'ASISTIO' ? 'cielo' : 'neutro'}>{t.estado === 'ASISTIO' ? 'Evaluado' : 'Reservado'}</Insignia>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="self-center text-sm text-tenue/70">Libre</p>}
            </Tarjeta>
          ))}
        </div>
      )}

      {(usuario?.rol === 'ADMINISTRATIVO' || usuario?.rol === 'ADMINISTRADOR') && <GenerarAgenda onCreada={recargar} />}
    </>
  );
}
