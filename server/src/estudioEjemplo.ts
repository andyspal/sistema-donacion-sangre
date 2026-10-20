import fs from 'node:fs';

/**
 * Genera un informe de laboratorio FICTICIO en PDF (texto embebido) para
 * probar la carga y la interpretación automática de estudios (RF05/RF06).
 */
export function generarEstudioEjemplo(destino: string, datos: { paciente: string; dni: string; fecha: string }) {
  const [a, m, d] = datos.fecha.split('-');
  const lineas: [number, number, number, string][] = [
    // [x, y, tamaño, texto]
    [50, 790, 16, 'LABORATORIO DE DEMOSTRACION - HEMORED'],
    [50, 772, 9, 'Documento ficticio generado para pruebas. No tiene validez clinica.'],
    [50, 740, 10, `Paciente: ${datos.paciente}`],
    [330, 740, 10, `DNI ${datos.dni}`],
    [50, 724, 10, `Fecha de Analisis: ${d}/${m}/${a}`],
    [50, 690, 10, 'ANALISIS'],
    [230, 690, 10, 'VALOR HALLADO'],
    [380, 690, 10, 'VALOR DE REFERENCIA'],
    [50, 670, 10, 'HEMOGRAMA'],
    [50, 654, 10, 'Recuento de Eritrocitos:'], [230, 654, 10, '4.62   mill/mm3'], [380, 654, 10, 'H:4.29-5.93 M:3.97-5.33'],
    [50, 638, 10, 'Hemoglobina:'], [230, 638, 10, '13.6   g/dL'], [380, 638, 10, 'H:12.9-16.9 M:11.3-15.1'],
    [50, 622, 10, 'Hematocrito:'], [230, 622, 10, '41     %'], [380, 622, 10, 'H:40-52 M:36-47'],
    [50, 606, 10, 'Recuento de Plaquetas'], [230, 606, 10, '245    miles/mm3'], [380, 606, 10, '171-381'],
    [50, 576, 10, 'SEROLOGIA'],
    [50, 560, 10, 'VIH 1/2 (Ac + Ag p24):'], [230, 560, 10, 'No reactivo'],
    [50, 544, 10, 'HBsAg (Hepatitis B):'], [230, 544, 10, 'No reactivo'],
    [50, 528, 10, 'Anti HCV (Hepatitis C):'], [230, 528, 10, 'No reactivo'],
    [50, 512, 10, 'Chagas (ELISA):'], [230, 512, 10, 'No reactivo'],
    [50, 496, 10, 'VDRL (Sifilis):'], [230, 496, 10, 'No reactivo'],
  ];
  const escapar = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const contenido = lineas.map(([x, y, t, s]) => `BT /F1 ${t} Tf ${x} ${y} Td (${escapar(s)}) Tj ET`).join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(destino, Buffer.from(pdf, 'latin1'));
}
