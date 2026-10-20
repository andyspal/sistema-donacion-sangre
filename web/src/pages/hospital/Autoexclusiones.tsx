import { useCarga } from '../../api';
import { fechaHora, instante } from '../../formato';
import { Alerta, Cargando, Encabezado, Icono, Insignia, Tarjeta, Vacio } from '../../ui';

interface Autoexclusion {
  id: number; codigoAcuse: string; confirmadaEn: string;
  donacion: { id: number; fechaHora: string };
  donante: { dni: string; nombre: string; grupo: string | null };
}

export function Autoexclusiones() {
  const { datos, cargando, error } = useCarga<Autoexclusion[]>('/hospital/autoexclusiones');
  return (
    <>
      <Encabezado titulo="Autoexclusiones confidenciales"
        bajada="Unidades que sus donantes pidieron no utilizar (Res. 536/2026). Información restringida: cada consulta queda auditada." />
      {error ? <Alerta tono="sangre">{error.message}</Alerta> : cargando && !datos ? <Cargando /> : !datos?.length ? (
        <Vacio icono="candado" titulo="No hay solicitudes de autoexclusión" />
      ) : (
        <Tarjeta className="p-0 sm:p-0 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-tenue">
              <tr className="border-b border-borde">
                <th className="px-4 py-3 font-medium">Recibida</th>
                <th className="px-4 py-3 font-medium">Donación</th>
                <th className="px-4 py-3 font-medium">Donante</th>
                <th className="px-4 py-3 font-medium">Acuse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {datos.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">{instante(a.confirmadaEn)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Icono nombre="gota" className="size-4 text-sangre" />#{a.donacion.id} · {fechaHora(a.donacion.fechaHora)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{a.donante.nombre} <span className="text-tenue">· DNI {a.donante.dni}</span> {a.donante.grupo && <Insignia tono="sangre">{a.donante.grupo}</Insignia>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.codigoAcuse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      )}
    </>
  );
}
