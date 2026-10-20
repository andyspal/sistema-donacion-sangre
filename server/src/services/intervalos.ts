import { todos } from '../db.ts';
import { configReglas } from './configuracion.ts';
import { fechaLocal, maxFecha, sumarDias } from '../util.ts';

export interface VerificacionIntervalo {
  cumplido: boolean;
  fechaHabilitacion: string;
  ultimaDonacion: string | null;
  donacionesUltimoAnio: number;
  maximoAnual: number;
  diasMinimos: number;
}

/**
 * Verificación determinística de intervalos entre donaciones (RF07):
 * intervalo mínimo de 8 semanas (M) / 12 semanas (F) desde la última donación
 * y frecuencia anual máxima de 4 (M) / 3 (F) en una ventana móvil de 365 días.
 */
export function verificarIntervalos(fechasDonacion: string[], sexo: 'M' | 'F', hoy = fechaLocal()): VerificacionIntervalo {
  const { intervalos, ventana_anual_dias: ventana } = configReglas().parametros;
  const { dias_minimos: diasMinimos, maximo_anual: maximoAnual } = intervalos[sexo];

  const fechas = fechasDonacion.map((f) => f.slice(0, 10)).sort();
  const ultima = fechas.at(-1) ?? null;
  const enVentana = fechas.filter((f) => f > sumarDias(hoy, -ventana));

  const candidatas = [hoy];
  if (ultima) candidatas.push(sumarDias(ultima, diasMinimos));
  if (enVentana.length >= maximoAnual) {
    // Para poder donar, la cantidad en la ventana debe quedar en máximo-1:
    // hay que esperar a que salga la donación n-(máximo-1) más antigua.
    candidatas.push(sumarDias(enVentana[enVentana.length - maximoAnual], ventana));
  }
  const fechaHabilitacion = maxFecha(candidatas);

  return {
    cumplido: fechaHabilitacion <= hoy,
    fechaHabilitacion,
    ultimaDonacion: ultima,
    donacionesUltimoAnio: enVentana.length,
    maximoAnual,
    diasMinimos,
  };
}

export function verificarIntervalosDonante(idDonante: number, sexo: 'M' | 'F', hoy = fechaLocal()) {
  const fechas = todos<{ fecha_hora: string }>(
    'SELECT fecha_hora FROM donacion WHERE id_donante = ? ORDER BY fecha_hora', [idDonante],
  ).map((d) => d.fecha_hora);
  return verificarIntervalos(fechas, sexo, hoy);
}
