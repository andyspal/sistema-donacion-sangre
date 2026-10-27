# HemoRed — MVP del Sistema Web Inteligente para la Gestión Digital de Donantes de Sangre

MVP funcional basado en la tercera entrega (requerimientos RF01–RF23, casos de uso CU01–CU06, DER de la sección 10.4)
y en los diagramas de secuencia de los casos de uso. Cubre **el camino completo del donante** y un **panel hospitalario
mínimo** para cerrar el circuito (evaluación, donación, inventario y convocatorias).

> El resultado de la orientación es **orientativo** y no reemplaza la entrevista ni el control médico presencial.

## Cómo ejecutarlo

Requisitos: **Node.js 24 o superior** (probado con 26). No necesita base de datos externa ni Python: usa el SQLite
embebido de Node (`node:sqlite`).

```bash
npm install
npm run dev
```

- PWA: <http://localhost:5173> (Vite, con proxy a la API)
- API: <http://localhost:3001/api>

La primera vez se siembran datos de demostración automáticamente. Para reiniciar la base (borra todo, incluidos
los estudios cargados): `npm run seed`.

Modo producción (un solo servidor que sirve API + PWA): `npm run build && npm start` → <http://localhost:3001>.

Pruebas de la lógica crítica (intervalos, motor de reglas, interpretación de estudios, cifrado): `npm test`.

### Cuentas de demostración (datos ficticios)

| Usuario | Contraseña | Rol / situación |
|---|---|---|
| `lucia@hemored.test` | `Donante2026` | Donante O−, orientación favorable, 2 donaciones (sirve para autoexclusión) |
| `martin@hemored.test` | `Donante2026` | Donante A+, donó hace 30 días (intervalo no cumplido) |
| `medico@hemored.test` | `Hemored2026` | Profesional médico (evaluación, acceso clínico, autoexclusiones) |
| `admision@hemored.test` | `Hemored2026` | Administración (agenda, donaciones; sin datos clínicos) |
| `inventario@hemored.test` | `Hemored2026` | Responsable de inventario (stock, mínimos, convocatorias) |
| `direccion@hemored.test` | `Hemored2026` | Administrador |

También podés registrarte como donante nuevo desde la página de inicio. La pantalla de ingreso tiene un atajo con
estas cuentas.

### Probar la interpretación de estudios

- `server/data/estudio-ejemplo-lucia.pdf` es un informe ficticio (se regenera con fecha reciente en cada `npm run seed`).
  Subilo con la cuenta de Lucía: se extraen hemoglobina, hematocrito, plaquetas y serologías.
- Lucía ya tiene cargado un análisis de hace 8 meses (`estudio-ejemplo-vencido.pdf`): aparece como **«Informe
  vencido — análisis detenido»** en su panel y en el legajo que ve el médico.
- Con un análisis propio: registrate con **tu DNI** (el sistema verifica que el DNI del informe coincida con el del
  donante). Solo se usan para orientar los estudios de los **últimos 6 meses**; los vencidos no se analizan.

### Correo (opcional)

Copiá `.env.example` como `.env` en la raíz y completá el servidor de correo. Con `SMTP_HOST` y sus credenciales,
las confirmaciones, recordatorios y cancelaciones de turnos y las convocatorias salen por ese servidor. Sin SMTP,
cada correo se guarda como `.eml` en `server/data/correos/` (se abre con cualquier cliente de correo).

Con una cuenta de Gmail: activá la verificación en dos pasos, creá una **contraseña de aplicación** en la cuenta de
Google y usá `smtp.gmail.com`, puerto `465`, `SMTP_SECURE=true`, la cuenta como usuario y como remitente. Conviene
una cuenta creada para el proyecto, no una personal.

## Qué incluye

### Camino del donante (PWA)

| Paso | Requerimientos | Dónde |
|---|---|---|
| Registro con datos personales y de contacto | RF01 | `/registro` |
| Consentimiento de datos de salud y, por separado, de convocatorias | RF02 | Registro y `/app/perfil` |
| Inicio de sesión | RF03 | `/ingresar` |
| Tablero «tu camino para donar» con el siguiente paso | — | `/app` |
| Cuestionario de salud (< 3 min, preguntas condicionales, versionado) | RF04 | `/app/cuestionario` |
| Sugerencia de cargar el análisis clínico al terminar el cuestionario | RF05 | `/app/cuestionario/estudio` |
| Carga de estudios PDF/JPG/PNG, cifrados en disco | RF05 | `/app/estudios` |
| Interpretación de estudios PDF con texto; chequeos previos que detienen el análisis | RF06 | `/app/estudios` |
| Preferencias de correo de turnos (confirmación/cancelación y recordatorio 24 o 48 h antes) | RF12 | `/app/perfil` |
| Verificación de intervalos (8/12 semanas, máx. 4/3 por año) | RF07 | Orientación, turnos, historial |
| Orientación con motor de reglas configurable | RF08, RNF11 | `/app/orientacion` (CU01) |
| Resultado favorable / diferimiento temporal (con fecha si es calculable) / revisión médica + aclaración legal | RF09 | `/app/orientacion` |
| Historial de donaciones y evaluaciones | RF10 | `/app/historial` |
| Consulta de centros, fechas y horarios con cupo | RF11 | `/app/turnos` (CU02) |
| Reserva transaccional del cupo (409 si se ocupó) y confirmación por correo | RF12, RNF08 | `/app/turnos` |
| Autoexclusión confidencial con acuse (sin duplicados) | RF14 | `/app/autoexclusion` (CU06) |
| Bandeja de avisos (convocatorias, confirmaciones y recordatorios; también por correo) | RF23 | `/app/avisos` |

### Panel hospitalario mínimo

| Función | Requerimientos | Dónde |
|---|---|---|
| Agenda del día y generación de franjas/cupos | RF13 | `/hospital` |
| Búsqueda de postulantes y legajo filtrado por rol, con marca de estudios vencidos o a revisar | RF15, RNF02 | `/hospital/postulantes` |
| Estudios del postulante con las mismas leyendas que ve el donante (vencido, detenido, a revisar) | RF06 | Legajo |
| Registro de evaluación presencial (APTO / DIFERIDO con motivo y plazo) | RF16 | Legajo (CU03) |
| Registro de donación | RF17 | Legajo |
| Inventario por componente, grupo y Rh, lotes y vencimientos, sin negativos | RF18, RF19, RNF08 | `/hospital/inventario` (CU04) |
| Niveles mínimos y alertas | RF20, RF21 | `/hospital/inventario` |
| Convocatoria segmentada automática con estado de envíos y reintentos | RF22, RF23 | `/hospital/convocatorias` (CU05) |
| Autoexclusiones (solo personal clínico) | RF14, RNF02 | `/hospital/autoexclusiones` |

La convocatoria (CU05) selecciona donantes con el **mismo grupo y Rh**, que **autorizaron** recibir convocatorias,
con **intervalo cumplido**, **última orientación favorable**, **misma localidad** que el centro, datos de contacto
completos y **sin turno ya reservado**. Se dispara al actualizar el stock y con un chequeo programado cada hora, y
llega **por correo y a la bandeja de avisos**.

### Análisis de estudios: cuándo se detiene

Antes de interpretar un estudio se hacen chequeos. Si alguno falla, el estudio queda **«Análisis detenido»** con el motivo, y el donante y el médico ven la misma leyenda:

| Caso | Resultado |
|---|---|
| Fecha declarada o fecha del PDF con más de 6 meses | Detenido: **vencido** (no se interpreta) |
| Fecha posterior a hoy | Detenido |
| DNI del estudio distinto al del donante | Detenido |
| Archivo ya cargado por el donante | Se rechaza la carga |
| Foto sin fecha declarada | Se pide la fecha (sin ella no se puede verificar la vigencia) |
| PDF protegido, dañado, escaneado o de más de 10 páginas, y fotos | Requiere revisión del personal |

## Arquitectura

```
web/      PWA React + TypeScript + Tailwind (Vite)        ← Frontend: no contiene lógica de negocio
server/   API REST Node + Express (TypeScript nativo)     ← Backend en capas
  src/routes/      auth, donante, hospital               (API REST)
  src/services/    orientación (CU01), turnos (CU02), hospital (CU03), inventario y convocatorias (CU04/CU05),
                   autoexclusión (CU06), motor de reglas, intervalos, procesador de estudios, mensajería,
                   correo y recordatorios de turno
  src/schema.sql   modelo relacional del DER
  config/          cuestionario.json y reglas-orientacion.json (RNF11)
  data/            base SQLite, clave de cifrado, estudios cifrados y bandeja de mensajería (no versionar)
```

### Configurar los criterios de orientación (RNF11)

Las reglas están en `server/config/reglas-orientacion.json`: condiciones declarativas (`=`, `<`, `incluye`,
`hace_menos_de`, combinables con `todas`/`alguna`/`no`), resultado (`DIFERIMIENTO_TEMPORAL`, `REVISION_MEDICA` o
`AVISO`), cálculo de la fecha de habilitación y mensaje al donante. También los parámetros de intervalos y la vigencia
de los estudios. Las preguntas viven en `server/config/cuestionario.json`. **Ambos archivos se recargan en caliente**,
sin reiniciar ni tocar otros módulos.

> Los plazos cargados son valores de referencia para el MVP y deben ser validados por el equipo médico contra la
> Res. 536/2026 antes de cualquier uso real.

### Seguridad y privacidad

- Datos de salud cifrados con **AES-256-GCM** (respuestas, parámetros de estudios, motivos, observaciones médicas,
  detalle de auditoría y los propios archivos adjuntos) — RNF01.
- Contraseñas con **scrypt**; sesiones en cookie `httpOnly` + `SameSite=Lax`; límite de intentos de login.
- Control de acceso por rol en la API (RNF02): el donante solo ve lo suyo; administración no ve datos clínicos;
  las autoexclusiones solo las ve el personal clínico.
- Protección CSRF por verificación de `Origin`; cabeceras de seguridad básicas.
- Las notificaciones nunca incluyen información clínica (RNF03).
- Auditoría de operaciones con usuario, acción, entidad y fecha/hora (RNF09).
- Transacciones `BEGIN IMMEDIATE` para cupos e inventario, equivalentes al `SELECT … FOR UPDATE` de los diagramas (RNF08).

### Variables de entorno (opcionales)

| Variable | Uso | Valor por defecto |
|---|---|---|
| `API_PORT` | Puerto de la API | `3001` |
| `DATA_DIR` | Carpeta de datos (base, estudios, clave) | `server/data` |
| `DATA_KEY` | Clave AES de 32 bytes en base64 (en producción, desde un gestor de secretos) | se genera en `data/` |
| `PUBLIC_URL` | URL de la PWA para los enlaces de las notificaciones | `http://localhost:5173` |
| `MENSAJERIA_FALLA` | `1` simula la caída del proveedor de mensajería (flujo alternativo de CU05) | — |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Servidor de correo saliente | sin SMTP: `.eml` en `data/correos/` |
| `CORREO_REMITENTE` | Remitente de los correos | `HemoRed <no-responder@hemored.test>` |

Las variables se pueden poner en un archivo `.env` en la raíz (ver `.env.example`); nunca se versiona.

## Decisiones y simplificaciones del MVP

| Documento | MVP | Motivo |
|---|---|---|
| PostgreSQL | SQLite embebido (`node:sqlite`), mismo esquema relacional del DER | Cero instalación; el esquema es portable |
| FastAPI o Node.js | Node.js + Express con TypeScript nativo | Un solo lenguaje en front y back |
| OCR/IA de estudios | Extracción del texto de PDFs (MuPDF) reconstruyendo las filas por posición + patrones por unidad | Funciona sin servicios externos; las fotos y PDFs escaneados quedan «requiere revisión». La lectura con IA se trabaja por separado |
| Correo | SMTP configurable (nodemailer); sin SMTP, archivos `.eml` | Funciona sin credenciales en desarrollo |
| SMS / WhatsApp | Adaptador simulado: `server/data/bandeja-salida.log` | Sin credenciales de proveedores |
| Cercanía geográfica | Misma localidad que el centro | Sin geocodificación |

Pendiente para próximas iteraciones: pasarelas reales de SMS/WhatsApp, respaldo
automático cada 24 h (RNF10), HL7/FHIR y REDOS, geolocalización, despliegue con Docker y PostgreSQL, HTTPS detrás de
proxy, y pruebas de carga (RNF04/RNF05) y de usabilidad (RNF06).
