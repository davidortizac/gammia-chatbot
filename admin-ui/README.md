# GammIA Admin UI

Panel de administración del framework multi-agente GammIA Platform.  
Construido con **React 18 + Vite + Tailwind CSS v4**.

> Servido desde la red local de Gamma Ingenieros. Se conecta al backend en Google Cloud Run vía proxy Vite (desarrollo) o proxy Nginx (producción).

---

## Requisitos

- Node.js 18+
- npm 9+
- Acceso a la red de Gamma (para conectar con el backend en GCP)

---

## Desarrollo local

```bash
cd admin-ui
npm install
npm run dev
```

Escucha en `http://localhost:5173`. Las llamadas a `/api/` y `/static/` se proxy automáticamente al backend en Cloud Run (configurado en `vite.config.js`).

---

## Build de producción

```bash
npm run build
# Genera admin-ui/dist/
```

Servir `dist/` con Nginx o cualquier servidor estático. Ver sección de despliegue en [docs/CLOUDBUILD_CICD_MANUAL.md](../docs/CLOUDBUILD_CICD_MANUAL.md).

---

## Estructura de vistas

```
src/
├── App.jsx                  # Router principal, manejo de sesión JWT
├── config.js                # BASE_URL y helper getHeaders()
├── index.css                # Variables de tema, clases globales (.input-dark)
├── components/
│   └── Sidebar.jsx          # Navegación lateral
└── views/
    ├── LoginView.jsx         # Autenticación JWT
    ├── DashboardView.jsx     # Métricas globales: vectores, interacciones, tokens
    ├── RagView.jsx           # Gestión de documentos y base de conocimiento
    ├── WidgetView.jsx        # Configuración del widget: colores, LLM, avatar
    ├── AgentsView.jsx        # Framework multi-agente: crear/editar agentes e Iris
    ├── ToolsView.jsx         # Integraciones: Drive, Google Workspace, Salesforce
    └── AdminUsersView.jsx    # Gestión de administradores (solo superadmin)
```

---

## Vistas disponibles

### Dashboard

Métricas en tiempo real del sistema: total de vectores indexados, interacciones acumuladas, tokens consumidos y latencia promedio. Incluye gráfica de interacciones por día (últimos 30 días).

### RAG Brain

Gestión completa del conocimiento que leen los agentes:

- **Documentos** — subir PDF, DOCX, XLSX, PPTX con tags de acceso
- **Drive Sync** — sincronizar carpeta de Google Drive al índice vectorial
- **Tags** — crear y gestionar tags para control de acceso por agente

### Widget Chat

Configuración del widget embebido global (GammIA):

- **Apariencia** — colores, fuentes, tema oscuro/claro, tamaño del chat
- **Identidad** — título, subtítulo, saludos por contexto, avatar
- **Modelo LLM** — selección de Gemini, temperatura, top-p, top-k, rag-top-k
- **Sesiones** — historial de conversaciones de los últimos 100 usuarios

### Agentes & Chatbots

Framework multi-agente. Cada agente tiene identidad, RAG y LLM propios:

- **Listar agentes** — tarjetas con avatar, área, tags RAG y estado activo
- **Crear agente** — slug único, system prompt, greeting, rag_tags, overrides LLM
- **Editar / toggle** — activar/desactivar sin eliminar
- **Avatar por agente** — clic en el avatar para subir PNG
- **Estadísticas** — interacciones, tokens in/out, latencia promedio por agente

Agentes del sistema (`gammia`, `iris`) no se pueden eliminar.

### Integraciones (Tools)

Habilitar y configurar las integraciones del agente:

- **RAG/Knowledge Base** — siempre activo
- **Google Drive Sync** — sincronización de carpetas con Service Account
- **Google Workspace** — Calendar, Gmail (pendiente OAuth)
- **Salesforce CRM** — consulta de clientes y proyectos (pendiente credenciales)
- **Vulnerability Scanner** — análisis de seguridad (roadmap)

### Administradores

Gestión de cuentas del panel admin. Solo visible para usuarios con rol `superadmin`.

---

## Autenticación

El panel usa JWT almacenado en `localStorage` bajo la clave `gammia_admin_token`.

- Token expira en **8 horas**
- Si el backend rota `JWT_SECRET_KEY`, el token queda inválido — hacer logout y volver a iniciar sesión
- El helper `API_CONFIG.getHeaders()` en `src/config.js` inyecta el header `Authorization: Bearer <token>` en todas las llamadas protegidas

---

## Paleta de colores (tema Gamma)

| Variable | Valor | Uso |
|---|---|---|
| `--color-brand-blue` | `#168bf2` | Primario: botones, activos, énfasis |
| `--color-brand-teal` | `#5bd893` | Éxito, tags, RAG indicators |
| `--color-brand-green` | `#3dc156` | Online status, confirmaciones |
| Surface | `#2d2d2d` | Sidebar, cards |
| Background | `#1a1a1a` | Fondo principal |
| Surface 2 | `#3d3d3d` | Inputs, bordes, hover states |

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `VITE_API_URL` | `` (vacío) | URL base del API. Vacío = usa proxy Vite |
| `VITE_BACKEND_URL` | URL de Cloud Run | Target del proxy Vite en desarrollo |

En producción estática, si no se usa Vite proxy, definir `VITE_API_URL` antes del build:

```bash
VITE_API_URL=https://gammia-api-1028680563477.us-central1.run.app npm run build
```
