-- Esquema relacional basado en el DER (sección 10.4 de la tercera entrega).
-- Extensiones respecto del DER, marcadas con «ext»: sesion, columnas de detalle
-- cifrado en orientacion/estudio_medico y metadatos de notificacion.
-- Los datos de salud se guardan cifrados con AES-256-GCM (RNF01).

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario       INTEGER PRIMARY KEY,
  email            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  hash_contrasena  TEXT    NOT NULL,
  activo           INTEGER NOT NULL DEFAULT 1,
  creado_en        TEXT    NOT NULL
);

-- ext: sesiones de servidor (cookie httpOnly con token aleatorio; se guarda su hash)
CREATE TABLE IF NOT EXISTS sesion (
  token_hash  TEXT    PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuario(id_usuario),
  creada_en   TEXT    NOT NULL,
  expira_en   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS centro_hemoterapia (
  id_centro  INTEGER PRIMARY KEY,
  nombre     TEXT    NOT NULL,
  domicilio  TEXT    NOT NULL,
  localidad  TEXT    NOT NULL,
  telefono   TEXT,
  activo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS donante (
  id_donante        INTEGER PRIMARY KEY,
  id_usuario        INTEGER NOT NULL UNIQUE REFERENCES usuario(id_usuario),
  dni               TEXT    NOT NULL UNIQUE,
  nombres           TEXT    NOT NULL,
  apellidos         TEXT    NOT NULL,
  fecha_nacimiento  TEXT    NOT NULL,
  sexo_biologico    TEXT    NOT NULL CHECK (sexo_biologico IN ('M','F')),
  telefono          TEXT    NOT NULL,
  domicilio         TEXT,
  localidad         TEXT    NOT NULL,
  grupo_abo         TEXT    CHECK (grupo_abo IN ('A','B','AB','O')),
  factor_rh         TEXT    CHECK (factor_rh IN ('+','-')),
  creado_en         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS personal (
  id_personal  INTEGER PRIMARY KEY,
  id_usuario   INTEGER NOT NULL UNIQUE REFERENCES usuario(id_usuario),
  id_centro    INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  nombres      TEXT    NOT NULL,
  apellidos    TEXT    NOT NULL,
  rol          TEXT    NOT NULL CHECK (rol IN ('MEDICO','ADMINISTRATIVO','RESPONSABLE_INVENTARIO','ADMINISTRADOR')),
  matricula    TEXT,
  activo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS consentimiento (
  id_consentimiento  INTEGER PRIMARY KEY,
  id_donante         INTEGER NOT NULL REFERENCES donante(id_donante),
  tipo               TEXT    NOT NULL CHECK (tipo IN ('DATOS_SALUD','CONVOCATORIAS')),
  otorgado           INTEGER NOT NULL CHECK (otorgado IN (0,1)),
  version_documento  TEXT    NOT NULL,
  otorgado_en        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS cuestionario_salud (
  id_cuestionario      INTEGER PRIMARY KEY,
  id_donante           INTEGER NOT NULL REFERENCES donante(id_donante),
  version              TEXT    NOT NULL,
  respuestas_cifradas  TEXT    NOT NULL,
  declarado_en         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS estudio_medico (
  id_estudio_medico     INTEGER PRIMARY KEY,
  id_donante            INTEGER NOT NULL REFERENCES donante(id_donante),
  nombre_archivo        TEXT    NOT NULL,
  tipo_mime             TEXT    NOT NULL,
  ubicacion_cifrada     TEXT    NOT NULL,
  fecha_estudio         TEXT,
  estado_procesamiento  TEXT    NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado_procesamiento IN ('PENDIENTE','PROCESADO','REQUIERE_REVISION')),
  parametros_cifrados   TEXT,   -- ext: parámetros clínicos extraídos (JSON cifrado)
  observacion           TEXT,   -- ext: motivo de revisión (sin datos clínicos)
  cargado_en            TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS orientacion (
  id_orientacion               INTEGER PRIMARY KEY,
  id_donante                   INTEGER NOT NULL REFERENCES donante(id_donante),
  id_cuestionario              INTEGER NOT NULL REFERENCES cuestionario_salud(id_cuestionario),
  resultado                    TEXT    NOT NULL CHECK (resultado IN ('FAVORABLE','DIFERIMIENTO_TEMPORAL','REVISION_MEDICA')),
  fecha_habilitacion_estimada  TEXT,
  motor_version                TEXT    NOT NULL,
  detalle_cifrado              TEXT    NOT NULL,  -- ext: motivos y verificación de intervalos
  generada_en                  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_turno (
  id_agenda_turno  INTEGER PRIMARY KEY,
  id_centro        INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  inicio           TEXT    NOT NULL,  -- hora local 'YYYY-MM-DDTHH:MM'
  fin              TEXT    NOT NULL,
  cupo_maximo      INTEGER NOT NULL CHECK (cupo_maximo > 0),
  activa           INTEGER NOT NULL DEFAULT 1,
  UNIQUE (id_centro, inicio)
);

CREATE TABLE IF NOT EXISTS turno (
  id_turno         INTEGER PRIMARY KEY,
  id_donante       INTEGER NOT NULL REFERENCES donante(id_donante),
  id_agenda_turno  INTEGER NOT NULL REFERENCES agenda_turno(id_agenda_turno),
  estado           TEXT    NOT NULL CHECK (estado IN ('RESERVADO','CANCELADO','ASISTIO','AUSENTE')),
  reservado_en     TEXT    NOT NULL,
  id_convocatoria  INTEGER REFERENCES convocatoria(id_convocatoria)  -- ext: turno originado por una convocatoria
);
CREATE INDEX IF NOT EXISTS ix_turno_agenda ON turno(id_agenda_turno, estado);

CREATE TABLE IF NOT EXISTS evaluacion_presencial (
  id_evaluacion_presencial  INTEGER PRIMARY KEY,
  id_donante                INTEGER NOT NULL REFERENCES donante(id_donante),
  id_centro                 INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  id_personal               INTEGER NOT NULL REFERENCES personal(id_personal),
  id_turno                  INTEGER UNIQUE REFERENCES turno(id_turno),
  resultado                 TEXT    NOT NULL CHECK (resultado IN ('APTO','DIFERIDO')),
  fecha_habilitacion        TEXT,
  observacion_cifrada       TEXT,
  evaluada_en               TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS donacion (
  id_donacion               INTEGER PRIMARY KEY,
  id_donante                INTEGER NOT NULL REFERENCES donante(id_donante),
  id_centro                 INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  id_evaluacion_presencial  INTEGER UNIQUE REFERENCES evaluacion_presencial(id_evaluacion_presencial),
  fecha_hora                TEXT    NOT NULL,
  volumen_ml                INTEGER NOT NULL CHECK (volumen_ml > 0),
  registrada_en             TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS autoexclusion (
  id_autoexclusion  INTEGER PRIMARY KEY,
  id_donacion       INTEGER NOT NULL UNIQUE REFERENCES donacion(id_donacion),
  codigo_acuse      TEXT    NOT NULL,  -- ext: código de acuse de recibo para el donante
  confirmada_en     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS umbral_stock (
  id_umbral_stock  INTEGER PRIMARY KEY,
  id_centro        INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  componente       TEXT    NOT NULL CHECK (componente IN ('GLOBULOS_ROJOS','PLAQUETAS','PLASMA')),
  grupo_abo        TEXT    NOT NULL CHECK (grupo_abo IN ('A','B','AB','O')),
  factor_rh        TEXT    NOT NULL CHECK (factor_rh IN ('+','-')),
  minimo_unidades  INTEGER NOT NULL CHECK (minimo_unidades >= 0),
  activo           INTEGER NOT NULL DEFAULT 1,
  UNIQUE (id_centro, componente, grupo_abo, factor_rh)
);

CREATE TABLE IF NOT EXISTS existencia_hemocomponente (
  id_existencia      INTEGER PRIMARY KEY,
  id_centro          INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  componente         TEXT    NOT NULL CHECK (componente IN ('GLOBULOS_ROJOS','PLAQUETAS','PLASMA')),
  grupo_abo          TEXT    NOT NULL CHECK (grupo_abo IN ('A','B','AB','O')),
  factor_rh          TEXT    NOT NULL CHECK (factor_rh IN ('+','-')),
  fecha_vencimiento  TEXT    NOT NULL,
  cantidad_unidades  INTEGER NOT NULL CHECK (cantidad_unidades >= 0),  -- RNF08: nunca negativo
  actualizada_en     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS alerta_stock (
  id_alerta_stock     INTEGER PRIMARY KEY,
  id_umbral_stock     INTEGER NOT NULL REFERENCES umbral_stock(id_umbral_stock),
  cantidad_detectada  INTEGER NOT NULL,
  estado              TEXT    NOT NULL CHECK (estado IN ('ACTIVA','ATENDIDA')),
  detectada_en        TEXT    NOT NULL,
  atendida_en         TEXT
);

CREATE TABLE IF NOT EXISTS convocatoria (
  id_convocatoria  INTEGER PRIMARY KEY,
  id_alerta_stock  INTEGER NOT NULL REFERENCES alerta_stock(id_alerta_stock),
  id_centro        INTEGER NOT NULL REFERENCES centro_hemoterapia(id_centro),
  estado           TEXT    NOT NULL CHECK (estado IN ('ABIERTA','SIN_DESTINATARIOS','CERRADA')),
  creada_en        TEXT    NOT NULL,
  cerrada_en       TEXT
);

CREATE TABLE IF NOT EXISTS notificacion (
  id_notificacion  INTEGER PRIMARY KEY,
  id_convocatoria  INTEGER REFERENCES convocatoria(id_convocatoria),
  id_donante       INTEGER NOT NULL REFERENCES donante(id_donante),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('CONVOCATORIA','CONFIRMACION_TURNO','CANCELACION_TURNO')),  -- ext
  canal            TEXT    NOT NULL CHECK (canal IN ('EMAIL','SMS','WHATSAPP')),
  asunto           TEXT    NOT NULL,  -- ext
  cuerpo           TEXT    NOT NULL,  -- ext: nunca contiene datos clínicos (RNF03)
  enlace           TEXT,              -- ext
  estado           TEXT    NOT NULL CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO')),
  enviada_en       TEXT,
  creada_en        TEXT    NOT NULL,
  leida_en         TEXT               -- ext: bandeja de avisos dentro de la PWA
);

CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria     INTEGER PRIMARY KEY,
  id_usuario       INTEGER REFERENCES usuario(id_usuario),
  accion           TEXT    NOT NULL,
  entidad          TEXT    NOT NULL,
  id_registro      INTEGER,
  ejecutada_en     TEXT    NOT NULL,
  detalle_cifrado  TEXT
);
