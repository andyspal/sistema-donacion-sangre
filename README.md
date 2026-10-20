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
- Con un análisis propio: registrate con **tu DNI** (el sistema verifica que el DNI del informe coincida con el del
  donante). Solo se usan para orientar los estudios de los **últimos 6 meses**; los más viejos se muestran pero no se
  consideran.

## Qué incluye

### Camino del donante (PWA)

| Paso | Requerimientos | Dónde |
|---|---|---|
| Registro con datos personales y de contacto | RF01 | `/registro` |
| Consentimiento de datos de salud y, por separado, de convocatorias | RF02 | Registro y `/app/perfil` |
| Inicio de sesión | RF03 | `/ingresar` |
| Tablero «tu camino para donar» con el siguiente paso | — | `/app` |
| Cuestionario de salud (< 3 min, preguntas condicionales, versionado) | RF04 | `/app/cuestionario` |
| Carga de estudios PDF/JPG/PNG, cifrados en disco | RF05 | `/app/estudios` |
| Interpretación de estudios; si no se puede, «requiere revisión» | RF06 | `/app/estudios` |
| Verificación de intervalos (8/12 semanas, máx. 4/3 por año) | RF07 | Orientación, turnos, historial |
| Orientación con motor de reglas configurable | RF08, RNF11 | `/app/orientacion` (CU01) |
| Resultado favorable / diferimiento temporal (con fecha si es calculable) / revisión médica + aclaración legal | RF09 | `/app/orientacion` |
| Historial de donaciones y evaluaciones | RF10 | `/app/historial` |
| Consulta de centros, fechas y horarios con cupo | RF11 | `/app/turnos` (CU02) |
| Reserva transaccional del cupo (409 si se ocupó) y confirmación por mensajería | RF12, RNF08 | `/app/turnos` |
| Autoexclusión confidencial con acuse (sin duplicados) | RF14 | `/app/autoexclusion` (CU06) |
| Bandeja de avisos (convocatorias y confirmaciones) | RF23 | `/app/avisos` |

### Panel hospitalario mínimo

| Función | Requerimientos | Dónde |
|---|---|---|
| Agenda del día y generación de franjas/cupos | RF13 | `/hospital` |
| Búsqueda de postulantes y legajo filtrado por rol | RF15, RNF02 | `/hospital/postulantes` |
| Registro de evaluación presencial (APTO / DIFERIDO con motivo y plazo) | RF16 | Legajo (CU03) |
| Registro de donación | RF17 | Legajo |
| Inventario por componente, grupo y Rh, lotes y vencimientos, sin negativos | RF18, RF19, RNF08 | `/hospital/inventario` (CU04) |
| Niveles mínimos y alertas | RF20, RF21 | `/hospital/inventario` |
| Convocatoria segmentada automática con estado de envíos y reintentos | RF22, RF23 | `/hospital/convocatorias` (CU05) |
| Autoexclusiones (solo personal clínico) | RF14, RNF02 | `/hospital/autoexclusiones` |

La convocatoria (CU05) selecciona donantes con el **mismo grupo y Rh**, que **autorizaron** recibir convocatorias,
con **intervalo cumplido**, **última orientación favorable**, **misma localidad** que el centro, datos de contacto
completos y **sin turno ya reservado**. Se dispara al actualizar el stock y con un chequeo programado cada hora.

## Arquitectura

```
web/      PWA React + TypeScript + Tailwind (Vite)        ← Frontend: no contiene lógica de negocio
server/   API REST Node + Express (TypeScript nativo)     ← Backend en capas
  src/routes/      auth, donante, hospital               (API REST)
  src/services/    orientación (CU01), turnos (CU02), hospital (CU03), inventario y convocatorias (CU04/CU05),
                   autoexclusión (CU06), motor de reglas, intervalos, procesador de estudios, mensajería
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

## Decisiones y simplificaciones del MVP

| Documento | MVP | Motivo |
|---|---|---|
| PostgreSQL | SQLite embebido (`node:sqlite`), mismo esquema relacional del DER | Cero instalación; el esquema es portable |
| FastAPI o Node.js | Node.js + Express con TypeScript nativo | Un solo lenguaje en front y back |
| OCR/IA de estudios | Extracción del texto de PDFs (MuPDF) reconstruyendo las filas por posición + patrones por unidad | Funciona sin servicios externos; las imágenes y PDFs escaneados quedan «requiere revisión» |
| SMS / WhatsApp / correo | Adaptador simulado: `server/data/bandeja-salida.log` + bandeja de avisos en la PWA | Sin credenciales de proveedores |
| Cercanía geográfica | Misma localidad que el centro | Sin geocodificación |

Pendiente para próximas iteraciones: OCR de imágenes / modelo de IA, pasarelas de mensajería reales, respaldo
automático cada 24 h (RNF10), HL7/FHIR y REDOS, geolocalización, despliegue con Docker y PostgreSQL, HTTPS detrás de
proxy, y pruebas de carga (RNF04/RNF05) y de usabilidad (RNF06).
