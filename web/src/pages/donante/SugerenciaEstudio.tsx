import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCarga, type Estudio, type Resumen } from '../../api';
import { CargaEstudio } from '../../componentes';
import { instante } from '../../formato';
import { Alerta, Boton, Cargando, Encabezado, Icono, Tarjeta } from '../../ui';

/** Paso entre el cuestionario y la orientación: sugiere sumar un análisis clínico, con el consentimiento del donante. */
export function SugerenciaEstudio() {
  const navegar = useNavigate();
  const { datos: r, cargando } = useCarga<Resumen>('/donante/resumen');
  const [cargado, setCargado] = useState<Estudio | null>(null);
  const [cargarOtro, setCargarOtro] = useState(false);
  const verOrientacion = () => navegar('/app/orientacion', { state: { solicitar: true } });

  if (cargando && !r) return <Cargando />;
  const tieneVigente = !!r?.estudios.vigentes;
  const salud = r?.consentimientos.DATOS_SALUD;

  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-sm text-tenue">
        <span className="grid size-6 place-items-center rounded-full bg-verde text-white"><Icono nombre="check" className="size-3.5" /></span>
        Cuestionario guardado
      </p>
      <Encabezado titulo="¿Sumamos tu análisis clínico?"
        bajada="Con un análisis de sangre de los últimos 6 meses, la orientación tiene en cuenta tu hemoglobina, hematocrito, plaquetas y serologías. Es opcional." />

      <div className="grid gap-4">
        <Tarjeta>
          <h2 className="font-medium">Antes de cargarlo</h2>
          <ul className="mt-3 grid gap-2.5 text-sm">
            <li className="flex gap-2.5">
              <Icono nombre="escudo" className="mt-0.5 size-4 text-verde" />
              <span>
                <strong>Datos de salud: autorizado</strong>{salud?.fecha && ` el ${instante(salud.fecha)}`}. Tus estudios se guardan cifrados y
                solo los ve el personal médico autorizado (Ley 25.326). Podés revocarlo desde tu perfil.
              </span>
            </li>
          </ul>
        </Tarjeta>

        {tieneVigente && !cargarOtro && !cargado ? (
          <Alerta tono="lima" titulo="Ya tenés un análisis vigente">
            Lo vamos a tener en cuenta en tu orientación.{' '}
            <button type="button" onClick={() => setCargarOtro(true)} className="font-medium text-primario hover:underline cursor-pointer">
              Cargar otro análisis
            </button>
          </Alerta>
        ) : (
          <Tarjeta>
            <CargaEstudio onCargado={setCargado} />
          </Tarjeta>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!cargado && !tieneVigente && <Boton variante="secundario" onClick={verOrientacion}>Ahora no, ver mi orientación</Boton>}
          {(cargado || tieneVigente) && (
            <Boton onClick={verOrientacion}>Ver mi orientación <Icono nombre="flecha" className="size-4" /></Boton>
          )}
        </div>
      </div>
    </>
  );
}
