import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, useCarga, type Consentimientos, type DefinicionCuestionario, type Estudio, type Intervalo, type Orientacion } from '../../api';
import { ResultadoOrientacion, TarjetaEstudio, estudioVencido } from '../../componentes';
import { ETIQUETA_RESULTADO, TONO_RESULTADO, fecha, fechaHora, hoy, instante } from '../../formato';
import { useSesion } from '../../sesion';
import { Alerta, Boton, Campo, Cargando, Encabezado, Entrada, Icono, Insignia, Segmentado, Selector, Tarjeta } from '../../ui';

interface Legajo {
  alcance: 'COMPLETO' | 'ADMINISTRATIVO';
  perfil: {
    id: number; email: string; dni: string; nombres: string; apellidos: string; fechaNacimiento: string; edad: number;
    sexoBiologico: 'M' | 'F'; telefono: string; localidad: string; domicilio: string | null; grupoAbo: string | null; factorRh: string | null;
  };
  consentimientos: Consentimientos;
  intervalo: Intervalo;
  orientaciones: (Orientacion | Pick<Orientacion, 'id' | 'resultado' | 'fechaHabilitacionEstimada' | 'generadaEn'>)[];
  cuestionario?: { respuestas: Record<string, unknown>; declaradoEn: string; version: string };
  estudios?: Estudio[];
  evaluaciones: { id: number; resultado: 'APTO' | 'DIFERIDO'; fechaHabilitacion: string | null; evaluadaEn: string; centro: string; profesional: string; idDonacion: number | null; observacion?: string }[];
  donaciones: { id: number; fechaHora: string; volumenMl: number; centro: string }[];
  turnos: { id: number; estado: string; inicio: string; centro: string; idCentro: number }[];
}

function formatoRespuesta(v: unknown, opciones?: { valor: string; texto: string }[]) {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => opciones?.find((o) => o.valor === x)?.texto ?? x).join(', ');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
  return opciones?.find((o) => o.valor === v)?.texto ?? String(v);
}

function FormEvaluacion({ l, onListo }: { l: Legajo; onListo: () => void }) {
  const [resultado, setResultado] = useState<'APTO' | 'DIFERIDO' | undefined>();
  const [motivo, setMotivo] = useState('');
  const [fechaHab, setFechaHab] = useState('');
  const turnosHoy = l.turnos.filter((t) => t.estado === 'RESERVADO');
  const [idTurno, setIdTurno] = useState(turnosHoy[0]?.id ? String(turnosHoy[0].id) : '');
  const [error, setError] = useState<ApiError | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <Tarjeta className="flex flex-col gap-4">
      <h2 className="font-medium">Registrar evaluación presencial</h2>
      <Campo etiqueta="Decisión médica" error={error?.detalle?.errores?.resultado}>
        <div><Segmentado nombre="Decisión médica" valor={resultado} onChange={setResultado}
          opciones={[{ valor: 'APTO', texto: 'Apto' }, { valor: 'DIFERIDO', texto: 'Diferido' }]} /></div>
      </Campo>
      {resultado === 'DIFERIDO' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Motivo" id="ev-motivo" error={error?.detalle?.errores?.motivo} ayuda="Se guarda cifrado; no se comunica por mensajería.">
            <Entrada id="ev-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <Campo etiqueta="Habilitado desde (opcional)" id="ev-fecha" error={error?.detalle?.errores?.fechaHabilitacion}>
            <Entrada id="ev-fecha" type="date" min={hoy()} value={fechaHab} onChange={(e) => setFechaHab(e.target.value)} />
          </Campo>
        </div>
      )}
      {turnosHoy.length > 0 && (
        <Campo etiqueta="Turno asociado" id="ev-turno">
          <Selector id="ev-turno" value={idTurno} onChange={(e) => setIdTurno(e.target.value)}>
            <option value="">Sin turno (concurrencia espontánea)</option>
            {turnosHoy.map((t) => <option key={t.id} value={t.id}>{fechaHora(t.inicio)} · {t.centro}</option>)}
          </Selector>
        </Campo>
      )}
      {error && !error.detalle?.errores && <Alerta tono="sangre">{error.message}</Alerta>}
      <Boton className="self-start" disabled={!resultado} cargando={enviando} onClick={async () => {
        setEnviando(true);
        setError(null);
        try {
          await api(`/hospital/postulantes/${l.perfil.id}/evaluaciones`, 'POST', {
            resultado, motivo, fechaHabilitacion: fechaHab || undefined, idTurno: idTurno ? Number(idTurno) : undefined,
          });
          onListo();
        } catch (e) { setError(e as ApiError); } finally { setEnviando(false); }
      }}>Registrar evaluación</Boton>
    </Tarjeta>
  );
}

function FormDonacion({ l, onListo }: { l: Legajo; onListo: () => void }) {
  const pendientes = l.evaluaciones.filter((e) => e.resultado === 'APTO' && !e.idDonacion);
  const [idEvaluacion, setIdEvaluacion] = useState(pendientes[0] ? String(pendientes[0].id) : '');
  const [volumen, setVolumen] = useState(450);
  const [grupo, setGrupo] = useState(l.perfil.grupoAbo ? `${l.perfil.grupoAbo}${l.perfil.factorRh}` : '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  if (!pendientes.length) return null;
  return (
    <Tarjeta className="flex flex-col gap-4">
      <h2 className="font-medium">Registrar donación</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Evaluación APTO" id="do-ev">
          <Selector id="do-ev" value={idEvaluacion} onChange={(e) => setIdEvaluacion(e.target.value)}>
            {pendientes.map((e) => <option key={e.id} value={e.id}>{instante(e.evaluadaEn)}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Volumen (ml)" id="do-vol">
          <Entrada id="do-vol" type="number" min={200} max={600} value={volumen} onChange={(e) => setVolumen(Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Grupo y factor (laboratorio)" id="do-grupo">
          <Selector id="do-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Sin cambios</option>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((g) => <option key={g}>{g}</option>)}
          </Selector>
        </Campo>
      </div>
      {error && <Alerta tono="sangre">{error}</Alerta>}
      <Boton className="self-start" cargando={enviando} onClick={async () => {
        setEnviando(true);
        setError('');
        try {
          await api(`/hospital/postulantes/${l.perfil.id}/donaciones`, 'POST', {
            idEvaluacion: Number(idEvaluacion), volumenMl: volumen,
            grupoAbo: grupo ? grupo.slice(0, -1) : undefined, factorRh: grupo ? grupo.slice(-1) : undefined,
          });
          onListo();
        } catch (e) { setError((e as ApiError).message); } finally { setEnviando(false); }
      }}>Registrar donación</Boton>
    </Tarjeta>
  );
}

export function Legajo() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const { datos: l, cargando, error, recargar } = useCarga<Legajo>(`/hospital/postulantes/${id}`);
  const clinico = usuario?.rol === 'MEDICO' || usuario?.rol === 'ADMINISTRADOR';
  const { datos: def } = useCarga<DefinicionCuestionario>(clinico ? '/hospital/cuestionario/definicion' : null);
  const [aviso, setAviso] = useState('');

  if (cargando && !l) return <Cargando />;
  if (error || !l) return <Alerta tono="sangre">{error?.message ?? 'No se pudo cargar el legajo.'}</Alerta>;

  const p = l.perfil;
  const ultima = l.orientaciones[0];
  const listo = (texto: string) => async () => {
    setAviso(texto);
    await recargar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Encabezado
        volver={<Link to="/hospital/postulantes" className="mb-2 inline-flex items-center gap-1 text-sm text-tenue hover:text-texto"><Icono nombre="atras" className="size-4" />Postulantes</Link>}
        titulo={`${p.apellidos}, ${p.nombres}`}
        bajada={`DNI ${p.dni} · ${p.edad} años · ${p.sexoBiologico === 'F' ? 'Femenino' : 'Masculino'} · ${p.localidad}`}
        acciones={<>
          {p.grupoAbo && <Insignia tono="sangre"><Icono nombre="gota" className="size-3" />{p.grupoAbo}{p.factorRh}</Insignia>}
          <Insignia tono={l.alcance === 'COMPLETO' ? 'cielo' : 'neutro'}>{l.alcance === 'COMPLETO' ? 'Acceso clínico' : 'Acceso administrativo'}</Insignia>
        </>} />

      {aviso && <Alerta tono="lima" className="mb-4">{aviso}</Alerta>}

      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta>
          <p className="text-sm text-tenue">Intervalo entre donaciones</p>
          <p className={`mt-1 font-semibold ${l.intervalo.cumplido ? 'text-verde' : 'text-ambar'}`}>
            {l.intervalo.cumplido ? 'Cumplido' : `Habilitado desde el ${fecha(l.intervalo.fechaHabilitacion)}`}
          </p>
          <p className="mt-1 text-sm text-tenue">{l.intervalo.donacionesUltimoAnio}/{l.intervalo.maximoAnual} en 12 meses · última {fecha(l.intervalo.ultimaDonacion)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-sm text-tenue">Contacto</p>
          <p className="mt-1 break-all">{p.email}</p>
          <p className="text-sm text-tenue">{p.telefono}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-sm text-tenue">Consentimientos</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Insignia tono={l.consentimientos.DATOS_SALUD.otorgado ? 'lima' : 'neutro'}>Datos de salud: {l.consentimientos.DATOS_SALUD.otorgado ? 'sí' : 'no'}</Insignia>
            <Insignia tono={l.consentimientos.CONVOCATORIAS.otorgado ? 'lima' : 'neutro'}>Convocatorias: {l.consentimientos.CONVOCATORIAS.otorgado ? 'sí' : 'no'}</Insignia>
          </div>
        </Tarjeta>
      </div>

      <section className="mt-6 grid gap-4">
        {ultima ? ('motivos' in ultima ? <ResultadoOrientacion o={ultima} /> : (
          <Tarjeta className="flex flex-wrap items-center justify-between gap-2">
            <span><span className="text-sm text-tenue">Última orientación</span> · {instante(ultima.generadaEn)}</span>
            <Insignia tono={TONO_RESULTADO[ultima.resultado]}>{ETIQUETA_RESULTADO[ultima.resultado]}</Insignia>
          </Tarjeta>
        )) : <Alerta tono="neutro">El postulante todavía no solicitó una orientación previa.</Alerta>}

        {usuario?.rol === 'MEDICO' && <FormEvaluacion key={`ev-${l.evaluaciones.length}`} l={l} onListo={listo('Evaluación registrada en el historial del postulante.')} />}
        {usuario?.rol !== 'RESPONSABLE_INVENTARIO' && <FormDonacion key={`do-${l.donaciones.length}-${l.evaluaciones.length}`} l={l} onListo={listo('Donación registrada. El historial del donante quedó actualizado.')} />}

        {l.cuestionario && def && (
          <Tarjeta>
            <h2 className="font-medium">Cuestionario de salud <span className="text-sm font-normal text-tenue">· declarado el {instante(l.cuestionario.declaradoEn)}</span></h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {def.secciones.flatMap((s) => s.preguntas).filter((q) => q.id in l.cuestionario!.respuestas).map((q) => (
                <div key={q.id} className="flex justify-between gap-4 border-b border-borde/60 py-1.5">
                  <dt className="text-tenue">{q.texto}</dt>
                  <dd className="text-right font-medium">{formatoRespuesta(l.cuestionario!.respuestas[q.id], q.opciones)}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
        )}

        {l.estudios && l.estudios.length > 0 && (
          <Tarjeta>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Estudios adjuntos</h2>
              {l.estudios.some(estudioVencido) && <Insignia tono="sangre"><Icono nombre="alerta" className="size-3.5" />Hay informes vencidos</Insignia>}
            </div>
            <ul className="mt-3 grid gap-3">
              {l.estudios.map((e) => (
                <li key={e.id} className="rounded-lg border border-borde p-3">
                  <TarjetaEstudio e={e} profesional enlace={`/api/hospital/postulantes/${p.id}/estudios/${e.id}/archivo`} />
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta>
            <h2 className="font-medium">Evaluaciones presenciales</h2>
            {!l.evaluaciones.length ? <p className="mt-2 text-sm text-tenue">Sin evaluaciones.</p> : (
              <ul className="mt-2 divide-y divide-borde">
                {l.evaluaciones.map((e) => (
                  <li key={e.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{instante(e.evaluadaEn)}</span>
                      <Insignia tono={e.resultado === 'APTO' ? 'lima' : 'ambar'}>{e.resultado === 'APTO' ? 'Apto' : 'Diferido'}</Insignia>
                    </div>
                    <p className="text-tenue">{e.profesional} · {e.centro}{e.fechaHabilitacion ? ` · hasta ${fecha(e.fechaHabilitacion)}` : ''}</p>
                    {e.observacion && <p className="text-tenue">Motivo: {e.observacion}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta>
            <h2 className="font-medium">Donaciones</h2>
            {!l.donaciones.length ? <p className="mt-2 text-sm text-tenue">Sin donaciones registradas.</p> : (
              <ul className="mt-2 divide-y divide-borde">
                {l.donaciones.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{fechaHora(d.fechaHora)} <span className="text-tenue">· {d.centro}</span></span>
                    <span className="text-tenue">{d.volumenMl} ml</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </section>
    </>
  );
}
