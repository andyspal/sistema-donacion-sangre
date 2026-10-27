import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CLAVE_DATOS, DIR_ESTUDIOS } from '../config.ts';
import { ejecutar, todos, uno } from '../db.ts';
import { cifrar, cifrarBuffer, cifrarJson, descifrar, descifrarBuffer, descifrarJson } from '../seguridad.ts';
import { ErrorHttp, ahoraIso, esFecha, fechaLocal, sumarMeses } from '../util.ts';
import { configReglas } from './configuracion.ts';

export const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_PAGINAS = 10;

export type EstadoSerologia = 'REACTIVO' | 'NO_REACTIVO';
export interface ParametrosClinicos {
  hemoglobina?: number;   // g/dL
  hematocrito?: number;   // %
  plaquetas?: number;     // /µL
  serologias?: Record<string, EstadoSerologia>;
}

export type EstadoEstudio = 'PENDIENTE' | 'PROCESADO' | 'REQUIERE_REVISION' | 'DETENIDO';
export type MetodoExtraccion = 'TEXTO' | 'NINGUNO';
/** Chequeos que frenan el análisis: el estudio no se interpreta ni se usa para orientar. */
export type MotivoDetencion = 'VENCIDO' | 'FECHA_FUTURA' | 'DNI_NO_COINCIDE';

interface FilaEstudio {
  id_estudio_medico: number;
  id_donante: number;
  nombre_archivo: string;
  tipo_mime: string;
  ubicacion_cifrada: string;
  fecha_estudio: string | null;
  estado_procesamiento: EstadoEstudio;
  parametros_cifrados: string | null;
  observacion: string | null;
  metodo_extraccion: MetodoExtraccion | null;
  motivo_detencion: MotivoDetencion | null;
  huella_archivo: string | null;
  cargado_en: string;
}

// ---------------------------------------------------------------------------
// Almacenamiento cifrado del archivo (RNF01)
// ---------------------------------------------------------------------------

/** Huella del archivo con la clave de datos: detecta duplicados sin guardar un hash reversible del contenido. */
const huella = (buffer: Buffer) => crypto.createHmac('sha256', CLAVE_DATOS).update(buffer).digest('base64url');

export function guardarEstudio(idDonante: number, archivo: { originalname: string; mimetype: string; buffer: Buffer }, fechaDeclarada?: string) {
  if (!TIPOS_PERMITIDOS.includes(archivo.mimetype)) {
    throw new ErrorHttp(422, 'TIPO_NO_PERMITIDO', 'Solo se aceptan archivos PDF, JPG o PNG.');
  }
  if (archivo.mimetype !== 'application/pdf' && !esFecha(fechaDeclarada)) {
    throw new ErrorHttp(422, 'VALIDACION', 'Para las fotos del estudio indicá la fecha: la necesitamos para verificar que esté vigente antes de analizarla.',
      { errores: { fechaEstudio: 'Indicá la fecha del estudio' } });
  }
  const h = huella(archivo.buffer);
  const previo = uno<{ cargado_en: string }>('SELECT cargado_en FROM estudio_medico WHERE id_donante = ? AND huella_archivo = ?', [idDonante, h]);
  if (previo) {
    const dia = fechaLocal(new Date(previo.cargado_en)).split('-').reverse().join('/');
    throw new ErrorHttp(409, 'ESTUDIO_DUPLICADO', `Este archivo ya lo cargaste el ${dia}. No hace falta volver a subirlo.`);
  }
  const nombreInterno = `${crypto.randomUUID()}.bin`;
  fs.writeFileSync(path.join(DIR_ESTUDIOS, nombreInterno), cifrarBuffer(archivo.buffer));
  const { id } = ejecutar(
    `INSERT INTO estudio_medico (id_donante, nombre_archivo, tipo_mime, ubicacion_cifrada, fecha_estudio, estado_procesamiento, huella_archivo, cargado_en)
     VALUES (?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
    [idDonante, archivo.originalname.slice(0, 200), archivo.mimetype, cifrar(nombreInterno),
      esFecha(fechaDeclarada) ? fechaDeclarada : null, h, ahoraIso()],
  );
  return id;
}

export function leerArchivoEstudio(fila: Pick<FilaEstudio, 'ubicacion_cifrada'>): Buffer {
  const nombre = descifrar(fila.ubicacion_cifrada);
  return descifrarBuffer(fs.readFileSync(path.join(DIR_ESTUDIOS, nombre)));
}

export function eliminarArchivoEstudio(fila: Pick<FilaEstudio, 'ubicacion_cifrada'>) {
  fs.rmSync(path.join(DIR_ESTUDIOS, descifrar(fila.ubicacion_cifrada)), { force: true });
}

// ---------------------------------------------------------------------------
// Lector local de PDF (RF06)
// Se extrae el texto embebido de los PDF con MuPDF y se interpretan los
// parámetros con patrones. También da la fecha y el DNI que se verifican
// antes de interpretar los valores.
// ---------------------------------------------------------------------------

interface LineaPdf { x: number; y: number; texto: string }

/**
 * Extrae el texto del PDF reconstruyendo las filas por geometría: las líneas
 * con la misma coordenada vertical se unen de izquierda a derecha. En los
 * informes de laboratorio esto vuelve a juntar «etiqueta  valor  unidad
 * referencia», que en el orden de lectura del PDF suelen quedar separados.
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<{ texto: string; paginas: number }> {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  if (doc.needsPassword()) throw new Error('PDF protegido con contraseña');
  const total = doc.countPages();
  const paginas = Math.min(total, MAX_PAGINAS);
  const filas: string[] = [];
  for (let i = 0; i < paginas; i++) {
    const json = JSON.parse(doc.loadPage(i).toStructuredText().asJSON()) as {
      blocks: { lines?: { bbox: { x: number; y: number }; text: string }[] }[];
    };
    const lineas: LineaPdf[] = json.blocks
      .flatMap((b) => b.lines ?? [])
      .map((l) => ({ x: l.bbox.x, y: l.bbox.y, texto: l.text.trim() }))
      .filter((l) => l.texto)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    let fila: LineaPdf[] = [];
    for (const l of lineas) {
      if (fila.length && Math.abs(l.y - fila[0].y) > 3) {
        filas.push(fila.sort((a, b) => a.x - b.x).map((x) => x.texto).join('  '));
        fila = [];
      }
      fila.push(l);
    }
    if (fila.length) filas.push(fila.sort((a, b) => a.x - b.x).map((x) => x.texto).join('  '));
  }
  return { texto: filas.join('\n'), paginas: total };
}

const numero = (s: string) => Number.parseFloat(s.replace(',', '.'));
const NUM = String.raw`(\d{1,3}(?:[.,]\d{1,3})?)`;

const SEROLOGIAS: [string, RegExp][] = [
  ['VIH', /\b(?:VIH|HIV)\b/i],
  ['Hepatitis B', /\b(?:HBs\s*Ag|hepatitis\s*B|anti[\s-]?HBc)\b/i],
  ['Hepatitis C', /\b(?:HCV|VHC|hepatitis\s*C)\b/i],
  ['Chagas', /\b(?:chagas|T\.?\s*cruzi)\b/i],
  ['Sífilis', /\b(?:s[ií]filis|VDRL|treponema)\b/i],
  ['HTLV', /\bHTLV\b/i],
];

/** Primer valor de una fila cuya etiqueta coincide, exigiendo la unidad y el rango esperados. */
function buscarValor(filas: string[], etiqueta: RegExp, unidad: RegExp, min: number, max: number) {
  for (const fila of filas) {
    const m = etiqueta.exec(fila);
    if (!m) continue;
    const resto = fila.slice(m.index + m[0].length);
    const v = new RegExp(`^[^\\d]{0,40}?${NUM}\\s*${unidad.source}`, 'i').exec(resto);
    if (v && numero(v[1]) >= min && numero(v[1]) <= max) return numero(v[1]);
  }
  return undefined;
}

function fechaIso(d: string, m: string, a: string) {
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a);
  const f = `${anio}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return esFecha(f) ? f : undefined;
}

export interface Interpretacion { parametros: ParametrosClinicos; fecha?: string; dni?: string }

export function interpretarTexto(texto: string): Interpretacion {
  const filas = texto.split('\n');
  const parametros: ParametrosClinicos = {};

  // Hemoglobina en g/dL (excluye glicosilada/HbA1c y la de orina, que no se informa en g/dL).
  parametros.hemoglobina = buscarValor(filas, /^\s*(?:hemoglobina|hb)\b(?![^\n]*(?:glicosilada|a1c))[\s.:]*/i,
    /(?<![a-zµ])gr?\s*(?:\/\s*dl|%)/, 4, 25);
  parametros.hematocrito = buscarValor(filas, /^\s*(?:hematocrito|hto)\b[\s.:]*/i, /%/, 15, 75);

  for (const fila of filas) {
    if (!/plaquetas/i.test(fila) || /volumen|vpm|plaquetario/i.test(fila)) continue;
    const m = /plaquetas[^\d]{0,40}?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*([^\s\d]*)/i.exec(fila);
    if (!m) continue;
    let valor = /\.\d{3}/.test(m[1]) ? Number(m[1].replace(/\./g, '')) : numero(m[1]);
    if (/mil|10\^?3|10³|x10/i.test(m[2]) || valor < 2000) valor *= 1000;
    if (valor >= 5_000 && valor <= 2_000_000) { parametros.plaquetas = Math.round(valor); break; }
  }

  for (const [nombre, patron] of SEROLOGIAS) {
    const fila = filas.find((f) => patron.test(f));
    if (!fila) continue;
    let estado: EstadoSerologia | undefined;
    if (/no\s*reactiv|negativ/i.test(fila)) estado = 'NO_REACTIVO';
    else if (/reactiv|positiv/i.test(fila)) estado = 'REACTIVO';
    if (estado) (parametros.serologias ??= {})[nombre] = estado;
  }

  for (const clave of Object.keys(parametros) as (keyof ParametrosClinicos)[]) {
    if (parametros[clave] === undefined) delete parametros[clave];
  }

  // Fecha del estudio: se prioriza la de análisis/extracción; nunca la de nacimiento.
  const FECHA = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})`;
  let fecha: string | undefined;
  const preferida = new RegExp(`fecha\\s+de\\s+(?:an[aá]lisis|extracci[oó]n|toma|muestra|ingreso|protocolo|emisi[oó]n|informe)[^\\d]{0,15}${FECHA}`, 'i');
  const generica = new RegExp(`fecha(?![^\\n]{0,6}nac)[^\\d]{0,20}${FECHA}`, 'i');
  const f = preferida.exec(texto) ?? generica.exec(texto);
  if (f) fecha = fechaIso(f[1], f[2], f[3]);

  const d = /\bD\.?\s?N\.?\s?I\.?\b[^\d\n]{0,12}(\d{1,2}\.?\d{3}\.?\d{3})/i.exec(texto);
  return { parametros, fecha, dni: d ? d[1].replace(/\./g, '') : undefined };
}

// ---------------------------------------------------------------------------
// Análisis del estudio: chequeos previos → lectura → validación
// ---------------------------------------------------------------------------

interface Resultado {
  estado: EstadoEstudio;
  metodo: MetodoExtraccion;
  fecha: string | null;
  parametros?: ParametrosClinicos;
  observacion?: string;
  motivo?: MotivoDetencion;
}

const fechaCorta = (f: string) => f.split('-').reverse().join('/');

function detener(motivo: MotivoDetencion, fecha: string | null, meses: number): Resultado {
  const observacion = {
    VENCIDO: `El estudio es del ${fechaCorta(fecha ?? '')} y supera los ${meses} meses de vigencia: se detuvo el análisis y no se usa para la orientación. Cargá un análisis más reciente.`,
    FECHA_FUTURA: 'La fecha del estudio es posterior a hoy: se detuvo el análisis. Revisá la fecha o el archivo.',
    DNI_NO_COINCIDE: 'El DNI que figura en el estudio no coincide con el de tu registro: se detuvo el análisis. El estudio debe ser tuyo.',
  }[motivo];
  return { estado: 'DETENIDO', metodo: 'NINGUNO', fecha, motivo, observacion };
}

const revisar = (observacion: string, metodo: MetodoExtraccion, fecha: string | null, parametros?: ParametrosClinicos): Resultado =>
  ({ estado: 'REQUIERE_REVISION', metodo, fecha, parametros, observacion });

function chequearFecha(fecha: string | null | undefined, limite: string): MotivoDetencion | null {
  if (!fecha) return null;
  if (fecha > fechaLocal()) return 'FECHA_FUTURA';
  if (fecha < limite) return 'VENCIDO';
  return null;
}

/** Analiza un estudio y deja registrado su estado, cómo se leyó y, si corresponde, por qué se detuvo. */
export async function procesarEstudio(idEstudio: number): Promise<void> {
  const fila = obtenerFilaEstudio(idEstudio);
  if (!fila) return;
  let r: Resultado;
  try {
    r = await analizar(fila);
  } catch {
    r = revisar('El archivo no pudo leerse. Lo revisará el personal del centro.', 'NINGUNO', fila.fecha_estudio);
  }
  ejecutar(
    `UPDATE estudio_medico SET estado_procesamiento = ?, parametros_cifrados = ?, observacion = ?, fecha_estudio = ?,
            metodo_extraccion = ?, motivo_detencion = ?
     WHERE id_estudio_medico = ?`,
    [r.estado, r.parametros && Object.keys(r.parametros).length ? cifrarJson(r.parametros) : null, r.observacion ?? null,
      r.fecha, r.metodo, r.motivo ?? null, idEstudio],
  );
}

async function analizar(fila: FilaEstudio): Promise<Resultado> {
  const meses = configReglas().parametros.vigencia_estudios_meses;
  const limite = sumarMeses(fechaLocal(), -meses);
  const dniDonante = uno<{ dni: string }>('SELECT dni FROM donante WHERE id_donante = ?', [fila.id_donante])!.dni.replace(/D/g, '');

  // 1) Chequeo previo con la fecha declarada por el donante: no hace falta abrir el archivo.
  const porFechaDeclarada = chequearFecha(fila.fecha_estudio, limite);
  if (porFechaDeclarada) return detener(porFechaDeclarada, fila.fecha_estudio, meses);

  // 2) Lectura del PDF: fecha y DNI para los chequeos y valores para la interpretación.
  if (fila.tipo_mime !== 'application/pdf') {
    return revisar('Las fotos de estudios todavía no se leen automáticamente. Lo revisará el personal del centro.', 'NINGUNO', fila.fecha_estudio);
  }
  let texto: string;
  let paginas: number;
  try {
    ({ texto, paginas } = await extraerTextoPdf(leerArchivoEstudio(fila)));
  } catch {
    return revisar('El PDF no pudo abrirse (puede estar dañado o protegido con contraseña): no se analizó. Lo revisará el personal del centro.',
      'NINGUNO', fila.fecha_estudio);
  }
  if (paginas > MAX_PAGINAS) {
    return revisar(`El PDF tiene más de ${MAX_PAGINAS} páginas: no se analizó. Adjuntá solo el informe del análisis.`, 'NINGUNO', fila.fecha_estudio);
  }
  if (!texto.trim()) {
    return revisar('El PDF no tiene texto legible (posiblemente escaneado). Lo revisará el personal del centro.', 'NINGUNO', fila.fecha_estudio);
  }
  const local = interpretarTexto(texto);
  const fecha = local.fecha ?? fila.fecha_estudio;
  const porFecha = chequearFecha(fecha, limite);
  if (porFecha) return detener(porFecha, fecha, meses);
  if (local.dni && local.dni !== dniDonante) return detener('DNI_NO_COINCIDE', fecha, meses);

  // 3) Validación de lo leído.
  if (!Object.keys(local.parametros).length) {
    return revisar('No se identificaron valores clínicos reconocibles. Lo revisará el personal del centro.', 'TEXTO', fecha);
  }
  if (!fecha) {
    return revisar('No se pudo determinar la fecha del estudio para validar su vigencia. Indicala al cargarlo.', 'TEXTO', null, local.parametros);
  }
  return { estado: 'PROCESADO', metodo: 'TEXTO', fecha, parametros: local.parametros };
}

export async function procesarPendientes(idDonante: number) {
  const pendientes = todos<{ id_estudio_medico: number }>(
    `SELECT id_estudio_medico FROM estudio_medico WHERE id_donante = ? AND estado_procesamiento = 'PENDIENTE'`, [idDonante],
  );
  for (const p of pendientes) await procesarEstudio(p.id_estudio_medico);
}

export interface EstudioVista {
  id: number;
  nombreArchivo: string;
  tipoMime: string;
  fechaEstudio: string | null;
  estado: EstadoEstudio;
  observacion: string | null;
  parametros: ParametrosClinicos | null;
  /** Dentro de la vigencia configurada en las reglas (solo esos se usan para orientar). */
  vigente: boolean;
  /** Último día de vigencia (fecha del estudio + vigencia configurada). */
  venceEl: string | null;
  /** Cómo se leyó: lector de texto del PDF o ninguno (análisis detenido o a revisar). */
  metodo: MetodoExtraccion | null;
  motivoDetencion: MotivoDetencion | null;
  cargadoEn: string;
}

export function listarEstudios(idDonante: number): EstudioVista[] {
  const meses = configReglas().parametros.vigencia_estudios_meses;
  const limite = sumarMeses(fechaLocal(), -meses);
  return todos<FilaEstudio>(
    'SELECT * FROM estudio_medico WHERE id_donante = ? ORDER BY cargado_en DESC', [idDonante],
  ).map((f) => ({
    id: f.id_estudio_medico,
    nombreArchivo: f.nombre_archivo,
    tipoMime: f.tipo_mime,
    fechaEstudio: f.fecha_estudio,
    estado: f.estado_procesamiento,
    observacion: f.observacion,
    parametros: f.parametros_cifrados ? descifrarJson<ParametrosClinicos>(f.parametros_cifrados) : null,
    vigente: !!f.fecha_estudio && f.fecha_estudio >= limite,
    venceEl: f.fecha_estudio ? sumarMeses(f.fecha_estudio, meses) : null,
    metodo: f.metodo_extraccion,
    motivoDetencion: f.motivo_detencion,
    cargadoEn: f.cargado_en,
  }));
}

export function obtenerFilaEstudio(idEstudio: number) {
  return uno<FilaEstudio>('SELECT * FROM estudio_medico WHERE id_estudio_medico = ?', [idEstudio]);
}
