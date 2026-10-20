import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError, type ResultadoOrientacion } from '../../api';
import { ETIQUETA_RESULTADO, TONO_RESULTADO } from '../../formato';
import { Alerta, Boton, Encabezado, Entrada, Icono, Insignia, Tarjeta } from '../../ui';

interface Resultado { id: number; dni: string; nombre: string; grupo: string | null; localidad: string; ultimaOrientacion: ResultadoOrientacion | null }

export function Postulantes() {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setError('');
    try {
      setResultados(await api<Resultado[]>(`/hospital/postulantes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setResultados(null);
      setError((err as ApiError).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <>
      <Encabezado titulo="Postulantes" bajada="Buscá por DNI o por nombre para consultar el legajo y registrar la evaluación." />
      <form onSubmit={buscar} className="flex gap-2">
        <div className="relative flex-1">
          <Icono nombre="lupa" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="DNI, nombre o apellido" className="pl-9" aria-label="Buscar postulante" autoFocus />
        </div>
        <Boton type="submit" cargando={buscando} disabled={q.trim().length < 2}>Buscar</Boton>
      </form>

      {error && <Alerta tono="ambar" className="mt-4">{error}</Alerta>}
      {resultados && (
        <Tarjeta className="mt-4 p-0 sm:p-0 overflow-hidden">
          <ul className="divide-y divide-borde">
            {resultados.map((r) => (
              <li key={r.id}>
                <Link to={`/hospital/postulantes/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-superficie-2">
                  <span>
                    <span className="font-medium">{r.nombre}</span>
                    <span className="block text-sm text-tenue">DNI {r.dni} · {r.localidad}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {r.grupo && <Insignia tono="sangre">{r.grupo}</Insignia>}
                    {r.ultimaOrientacion && <Insignia tono={TONO_RESULTADO[r.ultimaOrientacion]}>{ETIQUETA_RESULTADO[r.ultimaOrientacion]}</Insignia>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  );
}
