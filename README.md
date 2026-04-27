# GammIA — Centro de Comando

> Plataforma de IA conversacional y RAG para **Gamma Ingenieros**, con panel de administración, widget embebible y despliegue en contenedor.

---

## Tabla de Contenidos

1. [Descripción general](#1-descripción-general)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Estructura de archivos](#3-estructura-de-archivos)
4. [Configuración y variables de entorno](#4-configuración-y-variables-de-entorno)
5. [Despliegue con Docker Compose](#5-despliegue-con-docker-compose)
6. [Desarrollo local](#6-desarrollo-local)
7. [Panel de Administración](#7-panel-de-administración)
8. [Widget Embebible](#8-widget-embebible)
9. [API REST — Referencia completa](#9-api-rest--referencia-completa)
10. [Base de datos — Modelos](#10-base-de-datos--modelos)
11. [Descripción detallada de cada archivo](#11-descripción-detallada-de-cada-archivo)
12. [Seguridad](#12-seguridad)
13. [Preguntas frecuentes](#13-preguntas-frecuentes)

---

## 1. Descripción general

GammIA es un sistema completo de chatbot empresarial basado en **RAG (Retrieval-Augmented Generation)** con Google Gemini. Está compuesto por tres piezas principales:

| Componente | Tecnología | Puerto |
|---|---|---|
| **Backend API** | FastAPI + PostgreSQL + pgvector | `8000` |
| **Panel Admin** | React 18 + Vite + Tailwind CSS | `3000` |
| **Widget JS** | Vanilla JS IIFE embebible | servido por backend |

### Capacidades principales

- **Chat RAG** con búsqueda híbrida (vectorial HNSW + léxica GIN) sobre base de conocimiento interna
- **Gestión dinámica** de documentos en la base vectorial (carga, edición, eliminación, re-vectorización)
- **Widget embebible** configurable via API, con soporte para contexto público e intranet
- **Panel admin** con autenticación JWT, gestión de usuarios y personalización total del widget
- **Límite de sesión** configurable (máx. interacciones por sesión) con historial completo en base de datos
- **Renderizado Markdown** en las respuestas del bot (negrita, listas, código, encabezados)
- **Redimensión drag-and-drop** del panel de chat

---

## 2. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                     │
│                                                      │
│  ┌──────────────┐    ┌──────────────┐               │
│  │  admin-ui    │───▶│   backend    │               │
│  │  nginx:80    │    │  FastAPI:8000│               │
│  │  React SPA   │    │              │               │
│  └──────────────┘    │  /api/v1/    │               │
│       :3000           │  /static/   │               │
│                      └──────┬───────┘               │
│                             │                        │
│                      ┌──────▼───────┐               │
│                      │     db       │               │
│                      │ PostgreSQL16 │               │
│                      │  + pgvector  │               │
│                      └──────────────┘               │
└─────────────────────────────────────────────────────┘
         ▲
         │  HTTPS (proxy reverso externo: nginx/Caddy/Traefik)
         │
    Internet / Intranet
```

**Flujo de una consulta RAG:**
1. Widget (JS) → `POST /api/v1/widget/chat`
2. Backend verifica guardrails + límite de sesión
3. `search_tool()` ejecuta búsqueda híbrida (pgvector HNSW + GIN tsvector) con filtro RBAC por tags
4. Contexto recuperado + pregunta → Google Gemini API (`gemini-2.5-flash`)
5. Respuesta renderizada como Markdown en el widget
6. Interacción guardada en `interaction_logs` + sesión actualizada en `widget_sessions`

---

## 3. Estructura de archivos

```
CHATBOT/
├── app/                          # Backend FastAPI
│   ├── main.py                   # Punto de entrada, lifespan, migraciones, CORS
│   ├── core/
│   │   ├── config.py             # Variables de entorno con Pydantic Settings
│   │   ├── auth.py               # JWT utilities, hash de contraseña, dependencias FastAPI
│   │   └── security.py           # Guardrails del chatbot, OAuth2 placeholder
│   ├── db/
│   │   ├── database.py           # Motor SQLAlchemy async + Base declarativa
│   │   └── models.py             # Todos los modelos ORM (AdminUser, WidgetConfig, etc.)
│   ├── api/
│   │   └── endpoints/
│   │       ├── admin_auth.py     # Login JWT, CRUD de admins, cambio de contraseña
│   │       ├── widget.py         # Widget chat público + config admin
│   │       ├── rag.py            # Gestión de base vectorial (CRUD documentos)
│   │       ├── chat.py           # Chat principal del agente GammIA
│   │       └── analytics.py     # Métricas y logs de interacciones
│   ├── agents/
│   │   ├── gammia_agent.py       # Orquestador del agente con herramientas
│   │   └── tools/
│   │       └── gamma_tools.py    # search_tool: búsqueda híbrida RAG con RBAC
│   └── rag/
│       ├── pipeline.py           # Pipeline de ingestión de documentos
│       └── extractors.py        # Extractores de PDF, DOCX, PPTX, XLSX, HTML
│
├── admin-ui/                     # Frontend React
│   ├── src/
│   │   ├── App.jsx               # App root: auth state, protected routing, GlobalModal
│   │   ├── main.jsx              # Punto de entrada React
│   │   ├── components/
│   │   │   └── Sidebar.jsx       # Navegación lateral + perfil + logout
│   │   └── views/
│   │       ├── LoginView.jsx     # Pantalla de login con JWT
│   │       ├── DashboardView.jsx # Métricas y estado del sistema
│   │       ├── RagView.jsx       # Gestión de documentos RAG
│   │       ├── WidgetView.jsx    # Personalización del widget + sesiones
│   │       ├── ToolsView.jsx     # Integraciones y herramientas MCP
│   │       └── AdminUsersView.jsx # Gestión de usuarios administradores
│   ├── Dockerfile                # Build multistage: Node 20 → nginx 1.27
│   ├── nginx.conf                # Proxy /api/ → backend, SPA fallback
│   └── package.json
│
├── static/                       # Archivos estáticos servidos por el backend
│   ├── gammia-widget.js          # Widget JS IIFE embebible (zero-dependency)
│   ├── gammia-avatar.png         # Avatar por defecto del bot
│   ├── widget-demo.html          # Página de documentación del widget
│   └── widget-iframe.html        # Modo iframe para Google Sites
│
├── scripts/                      # Utilidades de desarrollo/testing
│   ├── test_chat.py              # Script de prueba del chat vía API
│   └── test_upload_rag.py        # Script de carga masiva de documentos
│
├── Dockerfile                    # Backend: Python 3.11-slim, non-root user
├── docker-compose.yml            # Orquestación: db + backend + admin-ui
├── .env.example                  # Plantilla de variables de entorno
├── requirements.txt              # Dependencias Python
└── README.md                     # Este archivo
```

---

## 4. Configuración y variables de entorno

Copia `.env.example` como `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo |
|---|---|---|
| `POSTGRES_USER` | Usuario de PostgreSQL | `gammia` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `secreto123` |
| `POSTGRES_DB` | Nombre de la base de datos | `gammiadb` |
| `GOOGLE_API_KEY` | Clave de la API de Google Gemini | `AIzaSy...` |
| `MODEL_ID` | Modelo Gemini a usar | `gemini-2.5-flash` |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Ruta al JSON de Service Account | `/app/service_account.json` |
| `WIDGET_INTERNAL_SECRET` | Secreto para widget de intranet | `secreto_interno` |
| `JWT_SECRET_KEY` | Clave secreta para firmar JWTs | cadena aleatoria larga |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del token en minutos | `480` (8h) |
| `ADMIN_DEFAULT_EMAIL` | Email del admin inicial | `admin@gammaingenieros.com` |
| `ADMIN_DEFAULT_PASSWORD` | Contraseña del admin inicial | `Gamma2024!` |

> **Seguridad:** Cambia `JWT_SECRET_KEY` y `ADMIN_DEFAULT_PASSWORD` antes de cualquier despliegue en producción. El `.env` está en `.gitignore` — nunca lo subas al repositorio.

---

## 5. Despliegue con Docker Compose

### Requisitos
- Docker Engine 24+
- Docker Compose v2
- Archivo `service_account.json` de Google Cloud (para Drive sync, opcional)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-org/gammia-chatbot.git
cd gammia-chatbot

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu editor favorito

# 3. (Opcional) Colocar service_account.json en la raíz del proyecto

# 4. Construir e iniciar todos los servicios
docker compose up -d --build

# 5. Verificar que todo esté en pie
docker compose ps
docker compose logs backend --tail=50
```

Una vez levantado:
- **Panel Admin:** http://localhost:3000
- **API Docs (Swagger):** http://localhost:8000/docs
- **Widget Demo:** http://localhost:8000/widget/demo

### Credenciales iniciales

El primer arranque crea automáticamente el admin inicial con las credenciales definidas en `.env`:

```
Email:     admin@gammaingenieros.com  (o el valor de ADMIN_DEFAULT_EMAIL)
Password:  Gamma2024!                  (o el valor de ADMIN_DEFAULT_PASSWORD)
Rol:       superadmin
```

> **Importante:** Cambia la contraseña del admin inmediatamente después del primer login desde el panel → Administradores → Mi Contraseña.

### Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Reiniciar solo el backend
docker compose restart backend

# Acceder a la base de datos
docker compose exec db psql -U gammia -d gammiadb

# Apagar y destruir volúmenes (¡borra todos los datos!)
docker compose down -v
```

---

## 6. Desarrollo local

### Backend

```bash
# Crear y activar entorno virtual
python -m venv venv
source venv/bin/activate   # Linux/Mac
venv\Scripts\activate      # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables (requiere PostgreSQL local con pgvector)
cp .env.example .env
# Ajustar DATABASE_URL en .env para apuntar a PostgreSQL local

# Iniciar servidor con recarga automática
uvicorn app.main:app --reload --port 8000
```

### Frontend Admin UI

```bash
cd admin-ui
npm install

# Variables de entorno para desarrollo
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Servidor de desarrollo con HMR
npm run dev      # http://localhost:5173

# Build de producción
npm run build
```

---

## 7. Panel de Administración

El panel admin es una SPA React accesible en `http://localhost:3000` (Docker) o `http://localhost:5173` (dev).

### Autenticación

- Login con email + contraseña
- Token JWT almacenado en `localStorage` con expiración configurable (default: 8h)
- Auto-logout al expirar el token
- Botón de cierre de sesión en la barra lateral

### Secciones

#### Dashboard
Métricas de uso: total de interacciones, latencia promedio, fuentes usadas, documentos en la base vectorial.

#### RAG Brain
Gestión completa de la base de conocimiento:
- **Carga:** PDF, DOCX, PPTX, XLSX, HTML, texto plano
- **Edición:** Cambiar tags de acceso (público/interno), re-vectorizar contenido
- **Eliminación:** Soft-delete (marca como inactivo) o hard-delete
- **Visualización:** Ver chunks, embeddings y metadatos de cada documento

#### Widget Chat
Personalización del chatbot embebible:
- **Diseño:** Paleta completa de colores (fondo, burbujas, texto, bordes, primario, secundario), tipografía, dimensiones
- **Contenido:** Título, subtítulo, mensajes de saludo (público/intranet)
- **Icono:** Avatar personalizable (URL) o letra inicial
- **Sesiones:** Historial completo de conversaciones con timestamps, contexto y latencia

#### Integraciones (Tools)
Configuración de herramientas MCP conectadas al agente (en desarrollo).

#### Administradores
Gestión del equipo de admins (solo superadmins):
- **Listar** todos los usuarios con su rol y estado
- **Crear** nuevos admins (admin o superadmin)
- **Cambiar rol** con un clic
- **Desactivar** usuarios sin eliminarlos
- **Cambiar mi contraseña** (disponible para todos los roles)

### Roles

| Rol | Capacidades |
|---|---|
| `admin` | Acceso a todas las vistas, solo lectura en gestión de usuarios |
| `superadmin` | Todas las capacidades + crear/editar/desactivar otros admins |

---

## 8. Widget Embebible

### Integración básica (sitio público)

```html
<script
  src="https://tu-dominio.com/static/gammia-widget.js"
  data-context="public"
  data-api="https://tu-dominio.com"
  data-theme="dark">
</script>
```

### Integración en intranet (Google Sites)

```html
<script
  src="https://tu-dominio.com/static/gammia-widget.js"
  data-context="internal"
  data-secret="TU_WIDGET_INTERNAL_SECRET"
  data-api="https://tu-dominio.com"
  data-theme="dark">
</script>
```

### Atributos del script

| Atributo | Valores | Descripción |
|---|---|---|
| `data-context` | `public` / `internal` / `intranet` | Contexto del widget |
| `data-api` | URL | Base URL del backend |
| `data-theme` | `dark` / `light` | Tema inicial (sobreescrito por config de la BD) |
| `data-secret` | string | Secreto para acceso a contexto interno |

### Modo iframe (Google Sites embed)

```
https://tu-dominio.com/widget?ctx=internal&secret=TU_SECRETO
```

### Características del widget

- **Zero dependencias** — vanilla JS IIFE, no requiere React ni ninguna librería
- **Configuración dinámica** — carga colores, tipografía y textos desde la API al iniciar
- **Renderizado Markdown** — negrita, cursiva, listas, código, encabezados, enlaces
- **Límite de sesión** — máximo configurable de interacciones (default: 10), enforced en cliente y servidor
- **Redimensionable** — drag handle en la parte superior del panel, rango 280–800px
- **Persistencia de sesión** — `sessionStorage` para session_id entre refrescos de página

---

## 9. API REST — Referencia completa

Base URL: `http://localhost:8000/api/v1`

### Autenticación Admin

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | — | Obtener token JWT |
| `GET` | `/auth/me` | JWT | Perfil del usuario actual |
| `PUT` | `/auth/me/password` | JWT | Cambiar contraseña propia |
| `GET` | `/auth/users` | JWT | Listar todos los admins |
| `POST` | `/auth/users` | JWT (superadmin) | Crear nuevo admin |
| `PUT` | `/auth/users/{id}` | JWT (superadmin) | Editar admin |
| `DELETE` | `/auth/users/{id}` | JWT (superadmin) | Desactivar admin |

### Widget (público)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/widget/config` | — | Configuración pública del widget |
| `POST` | `/widget/chat` | — | Enviar mensaje al bot |

### Widget (admin)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/widget/admin/config` | JWT | Config completa del widget |
| `PUT` | `/widget/admin/config` | JWT | Actualizar config del widget |
| `GET` | `/widget/admin/sessions` | JWT | Últimas 100 sesiones con historial |

### RAG / Base de Conocimiento

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/rag/upload` | JWT | Subir e ingestar documento |
| `GET` | `/rag/documents` | JWT | Listar documentos activos |
| `GET` | `/rag/documents/{doc_id}/chunks` | JWT | Ver chunks de un documento |
| `PUT` | `/rag/documents/{doc_id}/tags` | JWT | Editar tags de acceso |
| `POST` | `/rag/documents/{doc_id}/revectorize` | JWT | Re-generar embeddings |
| `DELETE` | `/rag/documents/{doc_id}` | JWT | Soft-delete de documento |
| `DELETE` | `/rag/documents/{doc_id}/hard` | JWT | Hard-delete permanente |

### Chat principal

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/chat` | JWT/Google OAuth | Chat con el agente GammIA |

### Analytics

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/analytics/summary` | JWT | Resumen de métricas |
| `GET` | `/analytics/logs` | JWT | Historial de interacciones |

---

## 10. Base de datos — Modelos

### `admin_users`
Usuarios del panel de administración.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | Identificador |
| `email` | VARCHAR UNIQUE | Email del admin |
| `full_name` | VARCHAR | Nombre completo |
| `hashed_password` | VARCHAR | Contraseña bcrypt |
| `role` | VARCHAR | `admin` o `superadmin` |
| `is_active` | BOOLEAN | Estado del usuario |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `created_by` | VARCHAR | Email del creador |

### `widget_config`
Configuración del widget chatbot (única fila, id=1).

| Columna | Tipo | Descripción |
|---|---|---|
| `primary_color` | VARCHAR | Color primario (botón flotante, encabezado) |
| `secondary_color` | VARCHAR | Color secundario |
| `background_color` | VARCHAR | Fondo del panel |
| `surface_color` | VARCHAR | Superficies elevadas |
| `user_bubble_color` | VARCHAR | Color burbuja usuario |
| `bot_bubble_color` | VARCHAR | Color burbuja bot |
| `text_color` | VARCHAR | Color de texto general |
| `font_family` | VARCHAR | Familia tipográfica CSS |
| `font_size` | VARCHAR | Tamaño base (ej: `13px`) |
| `title` | VARCHAR | Título del widget |
| `subtitle` | VARCHAR | Subtítulo |
| `greeting_public` | TEXT | Saludo contexto público |
| `greeting_internal` | TEXT | Saludo contexto intranet |
| `avatar_url` | VARCHAR | URL del avatar del bot |
| `max_interactions` | INTEGER | Máx. mensajes por sesión |
| `chat_width` | INTEGER | Ancho en píxeles |
| `chat_height` | INTEGER | Alto en píxeles |

### `widget_sessions`
Sesiones de chat del widget.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | VARCHAR PK | Hash MD5 de IP + User-Agent |
| `context` | VARCHAR | `public` / `internal` |
| `interaction_count` | INTEGER | Mensajes enviados en la sesión |
| `created_at` | TIMESTAMPTZ | Inicio de sesión |
| `last_interaction_at` | TIMESTAMPTZ | Último mensaje |

### `interaction_logs`
Historial completo de interacciones.

| Columna | Tipo | Descripción |
|---|---|---|
| `session_id` | VARCHAR | FK a `widget_sessions.id` |
| `user_query` | TEXT | Pregunta del usuario |
| `assistant_response` | TEXT | Respuesta del bot |
| `latency_ms` | INTEGER | Tiempo de respuesta |
| `tokens_in/out` | INTEGER | Estimación de tokens |
| `source_used` | VARCHAR | Fuente (`rag_public`, etc.) |

### `document_nodes`
Base vectorial de conocimiento.

| Columna | Tipo | Descripción |
|---|---|---|
| `doc_id` | VARCHAR | Identificador del documento |
| `title` | VARCHAR | Título |
| `tags` | VARCHAR[] | Tags de acceso RBAC |
| `content` | TEXT | Contenido del chunk |
| `embedding` | VECTOR(3072) | Embedding de Gemini |
| `active` | INTEGER | 1=activo, 0=eliminado |
| `content_tsv` | TSVECTOR | Índice léxico GIN |

---

## 11. Descripción detallada de cada archivo

### `app/main.py`
Punto de entrada de la aplicación FastAPI. El hook `lifespan` ejecuta al arrancar:
1. Crea la extensión `pgvector` si no existe
2. Aplica migraciones no-destructivas (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) para columnas nuevas
3. Crea todas las tablas con `Base.metadata.create_all`
4. Siembra la `WidgetConfig` inicial y el admin por defecto si no existen
5. Crea índices HNSW (vectorial) y GIN (léxico) para búsqueda híbrida

También configura CORS, monta los archivos estáticos y registra todos los routers.

### `app/core/config.py`
Configuración centralizada con `pydantic-settings`. Lee variables desde `.env` y expone un singleton `settings` usado en todo el backend.

### `app/core/auth.py`
Sistema de autenticación JWT completo:
- `hash_password()` / `verify_password()` — bcrypt via passlib
- `create_access_token()` — genera JWT con expiración configurable
- `decode_token()` — verifica y decodifica JWT
- `get_current_admin` — dependencia FastAPI que extrae el usuario del token
- `require_superadmin` — dependencia que fuerza rol superadmin

### `app/core/security.py`
Módulo de guardrails: `enforce_guardrails()` valida que las consultas no intenten evadir las instrucciones del sistema ni extraer información sensible.

### `app/db/database.py`
Motor SQLAlchemy asíncrono (`asyncpg`) y clase `Base` declarativa compartida por todos los modelos.

### `app/db/models.py`
Define todos los modelos ORM:
- `AdminUser` — usuarios del panel
- `WidgetConfig` — configuración del chatbot (singleton)
- `WidgetSession` — sesiones del widget con contador
- `InteractionLog` — historial de mensajes
- `DocumentNode` — chunks vectorizados con metadatos
- `DocumentDeletionRequest` — solicitudes de eliminación auditadas
- `Tag` — tags del sistema para RBAC

### `app/api/endpoints/admin_auth.py`
Router `/api/v1/auth/`. Login JWT, perfil propio, cambio de contraseña y CRUD completo de administradores con control de roles.

### `app/api/endpoints/widget.py`
Router `/api/v1/widget/`. Endpoints públicos (config, chat) y de admin (actualizar config, ver sesiones). El chat implementa: verificación de guardrails → límite de sesión → búsqueda RAG → llamada a Gemini → persistencia en BD.

### `app/api/endpoints/rag.py`
Router `/api/v1/rag/`. Gestión completa del RAG: carga de documentos (extracción + chunking + embedding), edición de tags, eliminación soft/hard, re-vectorización y visualización de chunks.

### `app/api/endpoints/chat.py`
Router `/api/v1/chat`. Chat principal del agente GammIA para uso interno/integrado (vs. el widget que usa su propio endpoint).

### `app/api/endpoints/analytics.py`
Router `/api/v1/analytics`. Agrega métricas de `interaction_logs` para el dashboard: totales, latencia, distribución de fuentes, actividad por día.

### `app/agents/gammia_agent.py`
Orquestador del agente GammIA con herramientas. Construye el prompt de sistema, inyecta el contexto RAG y llama a Gemini con las herramientas disponibles.

### `app/agents/tools/gamma_tools.py`
`search_tool()` — función de búsqueda híbrida que combina:
- Búsqueda semántica vectorial (HNSW coseno) con `pgvector`
- Búsqueda léxica full-text (GIN tsvector) con ranking BM25-like
- Fusión de resultados con Reciprocal Rank Fusion (RRF)
- Filtrado RBAC: documentos públicos o internos según `is_internal`

### `app/rag/pipeline.py`
Pipeline de ingestión: recibe archivo → extrae texto → divide en chunks → genera embeddings con `gemini-embedding-001` (3072 dimensiones) → guarda en `document_nodes`.

### `app/rag/extractors.py`
Extractores por tipo de archivo: PDF (pdfplumber), DOCX (python-docx), PPTX (python-pptx), XLSX (openpyxl), HTML (BeautifulSoup), TXT plano.

### `static/gammia-widget.js`
Widget JavaScript IIFE (Immediately Invoked Function Expression) — **zero dependencias externas**:
- `applyConfig(cfg)` — aplica CSS custom properties desde la configuración de la API
- `renderMarkdown(text)` — convierte markdown a HTML (puro JS, regex)
- `buildPanel()` / `buildButton()` — construye el DOM del chat y el botón flotante
- `initResize(panel)` — drag-to-resize con mouse y touch
- `sendMessage(text)` — envía mensaje, maneja límite de sesión, renderiza respuesta
- `updateCounter()` — indicador visual de mensajes restantes

### `admin-ui/src/App.jsx`
Componente raíz de la SPA React:
- Maneja el estado de autenticación (JWT en `localStorage`)
- Renderiza `LoginView` si no hay token válido
- Renderiza el layout con `Sidebar` + vista activa si está autenticado
- Exporta `GlobalModal` — portal React en `document.body` para modales sin z-index issues

### `admin-ui/src/components/Sidebar.jsx`
Barra lateral de navegación:
- Links a Dashboard, RAG Brain, Widget Chat, Integraciones, Administradores
- Muestra perfil del usuario (nombre, email, rol con ícono)
- Botón de Cerrar Sesión

### `admin-ui/src/views/LoginView.jsx`
Formulario de inicio de sesión con:
- Email + contraseña con toggle de visibilidad
- Llamada a `POST /api/v1/auth/login`
- Manejo de errores del servidor
- Redirección automática al panel tras login exitoso

### `admin-ui/src/views/AdminUsersView.jsx`
Gestión del equipo admin:
- Tabla de todos los usuarios con rol, estado y fecha
- Modal para crear nuevo admin (solo superadmin)
- Toggle de rol admin ↔ superadmin
- Desactivación de usuarios (sin borrado permanente)
- Modal para cambiar contraseña propia

### `admin-ui/src/views/WidgetView.jsx`
Control total del widget embebible:
- **Tab Diseño:** Paleta de colores con color pickers + preview en vivo del panel
- **Tab Contenido:** Título, subtítulo, mensajes de saludo con soporte markdown
- **Tab Sesiones:** Historial de todas las sesiones con conversación completa

### `admin-ui/src/views/DashboardView.jsx`
Vista de métricas del sistema: interacciones totales, latencia P50/P95, documentos en RAG, sesiones activas.

### `admin-ui/src/views/RagView.jsx`
Interfaz de gestión de la base de conocimiento: carga de archivos, lista de documentos con tags, acciones de edición y eliminación.

### `Dockerfile` (backend)
Build multi-etapa: Python 3.11-slim, instala dependencias de sistema (libpq), instala paquetes Python, copia código fuente, crea usuario no-root `appuser`.

### `admin-ui/Dockerfile`
Build multi-etapa: Node 20-alpine para compilar con Vite, nginx 1.27-alpine para servir. El build de React se ejecuta con `VITE_API_URL=""` para que nginx proxy las llamadas a la API.

### `admin-ui/nginx.conf`
Configuración nginx: proxy `/api/` → `backend:8000`, proxy `/static/` → backend, SPA fallback `try_files $uri /index.html`, cache headers para assets estáticos.

### `docker-compose.yml`
Orquestación de tres servicios: `db` (pgvector/pgvector:pg16), `backend` (FastAPI), `admin-ui` (React+nginx). Healthcheck en la BD antes de arrancar el backend. Red interna `gammia_net`, volumen persistente `pgdata`.

### `.env.example`
Plantilla documentada de todas las variables de entorno requeridas. Copiar como `.env` antes del despliegue.

---

## 12. Seguridad

### Autenticación
- Contraseñas hasheadas con **bcrypt** (factor de costo adaptativo)
- Tokens JWT firmados con HMAC-SHA256 (`HS256`)
- Expiración configurable (default 8h), verificación en cada request
- Auto-logout en el frontend al detectar token expirado

### Autorización
- Separación de roles: `admin` y `superadmin`
- Todas las rutas admin requieren JWT válido
- Operaciones destructivas sobre usuarios requieren `superadmin`

### Guardrails del chatbot
- Lista de tópicos prohibidos (evasión de instrucciones, solicitudes maliciosas)
- Validación antes de enviar a Gemini — respuesta de rechazo sin llamada al LLM

### Contenedor
- Backend corre como usuario no-root (`appuser`)
- Volumen de `service_account.json` montado como `:ro` (read-only)

### Recomendaciones para producción
1. Poner un proxy reverso (nginx/Caddy) con TLS terminando antes de los contenedores
2. Reemplazar `allow_origins=["*"]` en CORS con el dominio exacto del admin
3. Usar secrets de Docker o un vault para `JWT_SECRET_KEY` y `GOOGLE_API_KEY`
4. Habilitar `pgaudit` en PostgreSQL para auditoría de queries
5. Rotar el `JWT_SECRET_KEY` periódicamente (invalida todos los tokens activos)

---

## 13. Preguntas frecuentes

**¿Cómo cambio el avatar del bot?**
Panel Admin → Widget Chat → Tab Diseño → sección Icono → introduce la URL de la imagen.

**¿Puedo subir documentos en lote?**
Sí, usando el script `scripts/test_upload_rag.py` o la API `POST /api/v1/rag/upload`.

**¿El widget funciona sin conexión a internet?**
No — necesita acceso a la API del backend para responder. El JS del widget sí puede cargarse desde servidor interno.

**¿Cómo conecto el widget a Google Sites?**
Usa un embed de HTML en Google Sites con el script configurado con `data-context="internal"` y `data-secret` igual a tu `WIDGET_INTERNAL_SECRET`.

**¿Cómo aumento el límite de interacciones por sesión?**
Panel Admin → Widget Chat → Tab Diseño → sección Dimensiones → campo "Máx. interacciones". También editable directamente en la BD o via `PUT /api/v1/widget/admin/config`.

**¿Qué pasa si olvido la contraseña del admin inicial?**
1. Conéctate a la BD: `docker compose exec db psql -U gammia -d gammiadb`
2. Actualiza el hash: primero genera uno nuevo con Python: `python -c "from passlib.context import CryptContext; print(CryptContext(['bcrypt']).hash('NuevaContraseña'))"`
3. `UPDATE admin_users SET hashed_password='$2b$...' WHERE email='admin@...';`

---

*Desarrollado por Gamma Ingenieros — GammIA v1.0*
