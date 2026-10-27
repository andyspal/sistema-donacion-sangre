import { useState } from 'react';
import { Link } from 'react-router';
import { api, useCarga, type Estudio } from '../../api';
import { CargaEstudio, TarjetaEstudio } from '../../componentes';
import { Boton, Cargando, Dialogo, Encabezado, Icono, Tarjeta, Vacio } from '../../ui';

export function Estudios() {
  const { datos: estudios, cargando, recargar } = useCarga<Estudio[]>('/donante/estudios');
  const [aEliminar, setAEliminar] = useState<Estudio | null>(null);

  return (
    <>
      <Encabezado titulo="Estudios médicos"
        bajada="Adjuntá un análisis de sangre reciente (hemograma, serologías). Es opcional, pero mejora tu orientación." />

      <Tarjeta>
        <CargaEstudio onCargado={() => void recargar()} />
      </Tarjeta>

      <h2 className="mt-8 mb-3 text-sm font-medium text-tenue">Tus estudios</h2>
      {cargando && !estudios ? <Cargando /> : !estudios?.length ? (
        <Vacio icono="archivo" titulo="Todavía no adjuntaste estudios">Podés pedir tu orientación igual: la hemoglobina se mide en el centro.</Vacio>
      ) : (
        <ul className="grid gap-3">
          {estudios.map((e) => (
            <li key={e.id}>
              <Tarjeta>
                <TarjetaEstudio e={e} enlace={`/api/donante/estudios/${e.id}/archivo`} acciones={
                  <button onClick={() => setAEliminar(e)} aria-label={`Eliminar ${e.nombreArchivo}`}
                    className="grid size-9 place-items-center rounded-lg text-tenue hover:text-sangre hover:bg-superficie-2 cursor-pointer">
                    <Icono nombre="basura" className="size-4" />
                  </button>
                } />
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      {!!estudios?.length && (
        <Link to="/app/orientacion" state={{ solicitar: true }} className="mt-5 inline-flex items-center gap-2 font-medium text-primario hover:underline">
          Actualizar mi orientación con estos estudios <Icono nombre="flecha" className="size-4" />
        </Link>
      )}

      <Dialogo abierto={!!aEliminar} onCerrar={() => setAEliminar(null)} titulo="¿Eliminar este estudio?"
        acciones={<>
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={async () => {
            await api(`/donante/estudios/${aEliminar!.id}`, 'DELETE');
            setAEliminar(null);
            await recargar();
          }}>Eliminar</Boton>
        </>}>
        Se borrará «{aEliminar?.nombreArchivo}» de forma definitiva y dejará de considerarse en próximas orientaciones.
      </Dialogo>
    </>
  );
}
