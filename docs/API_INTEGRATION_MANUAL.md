# GammIA Platform — Manual de Integración API

> **Versión:** 2.0 · **Actualizado:** Abril 2026  
> **Backend:** FastAPI en Google Cloud Run  
> **URL producción:** `https://gammia-api-1028680563477.us-central1.run.app`

---

## 1. Arquitectura general

```
┌──────────────────────────────────────────────────────────────────┐
│  Red local Gamma Ingenieros                                      │
│                                                                  │
│  Admin UI (React + Vite)          Widget Intranet                │
│  admin-ui/ → puerto 5173          iframe en Google Sites         │
│       │                                  │                       │
│       └──────────── API (proxy Vite) ────┘                       │
└──────────────────────────────────┬───────────────────────────────┘
                                   │ HTTPS
                     ┌─────────────▼─────────────┐
                     │  Google Cloud Run          │
                     │  gammia-api (FastAPI)       │
                     │  Secrets via Secret Manager│
                     └──┬────────┬────────────────┘
                        │        │
               ┌────────▼─┐  ┌───▼──────────────┐
               │ Cloud SQL │  │  Gemini API       │
               │ PostgreSQL│  │  (LLM + Embed)    │
               │ pgvector  │  └──────────────────┘
               └──────────┘
```

**Componentes:**
- **Admin UI** — Panel React servido desde la red local. Se conecta al backend vía proxy Vite (`vite.config.js`) apuntando a la URL de Cloud Run.
- **Widget embebido** — JS embeddable en Google Sites (intranet) o cualquier web. Se autentica con un `widget_secret` para acceso interno.
- **API FastAPI** — Backend en Cloud Run. Gestiona chat, RAG, agentes, analytics y administración.

---

## 2. Autenticación

### 2.1 Panel Admin — JWT Bearer Token

Todos los endpoints `/admin/*` y `/api/v1/agents`, `/api/v1/rag`, `/api/v1/analytics` requieren un JWT de administrador.

```http
Authorization: Bearer <token_jwt>
```

**Obtener token:**
```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@gammaingenieros.com", "password": "tu-contraseña" }
```

Respuesta:
```json
{ "access_token": "eyJhbG...", "token_type": "bearer", "user": { "email": "...", "role": "superadmin" } }
```

El token expira en **8 horas** (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES=480`). Si el servidor rota la `JWT_SECRET_KEY` todos los tokens existentes quedan inválidos — el usuario debe volver a autenticarse.

### 2.2 Widget público — sin auth

El endpoint `POST /api/v1/widget/chat` es público. No requiere JWT.

### 2.3 Widget interno (intranet) — `widget_secret`

Para acceder al contexto interno (RAG completo + identidad del agente), el widget debe enviar el secret configurado en la variable de entorno `WIDGET_INTERNAL_SECRET`:

```json
{ "message": "...", "context": "internal", "widget_secret": "gamma-intranet-2026" }
```

Si el secret no coincide, el backend degrada automáticamente al contexto público (no rechaza la petición).

---

## 3. Endpoints del Widget

### `GET /api/v1/widget/config`

Retorna la configuración visual del widget (colores, fuente, título, avatar, parámetros LLM).  
**Uso:** El JS embeddable la carga al iniciar para aplicar el tema visual.

```json
{
  "primary_color": "#168bf2",
  "title": "GammIA",
  "model_id": "gemini-2.0-flash",
  "llm_temperature": 0.1,
  "rag_top_k": 15,
  ...
}
```

### `POST /api/v1/widget/chat`

Chat principal del widget. Gestiona sesiones, límites de interacción y RAG.

**Request:**
```json
{
  "message": "¿Cuáles son los servicios de ciberseguridad?",
  "context": "public",
  "session_id": "abc123",
  "widget_secret": "",
  "agent_id": "gammia",
  "lang": "es"
}
```

| Campo | Valores | Descripción |
|---|---|---|
| `context` | `public` / `internal` / `intranet` | Nivel de acceso al RAG |
| `session_id` | string | ID de sesión para límite de interacciones (se genera si vacío) |
| `widget_secret` | string | Requerido para `context=internal` |
| `agent_id` | `gammia` / `iris` / slug custom | Agente a usar. Determina identidad, RAG tags y parámetros LLM |

**Response:**
```json
{
  "reply": "Gamma Ingenieros ofrece...",
  "session_id": "abc123",
  "context": "public",
  "source": "rag_public",
  "latency_ms": 1240,
  "interaction_count": 3,
  "max_interactions": 10,
  "limit_reached": false
}
```

Cuando `limit_reached: true`, mostrar un mensaje invitando a recargar o contactar.

**Ejemplo JavaScript (widget embebido):**
```javascript
async function chatWithGammia(message, sessionId) {
  const res = await fetch('/api/v1/widget/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      context: 'internal',        // 'public' para web corporativa
      session_id: sessionId,
      widget_secret: 'gamma-intranet-2026',
      agent_id: 'iris',           // usar 'gammia' para web pública
    }),
  });
  return res.json();
}
```

---

## 4. Framework Multi-Agente — API de Agentes

Todos los endpoints requieren JWT de administrador.

### `GET /api/v1/agents`
Lista todos los agentes registrados.

```json
{
  "agents": [
    {
      "id": "gammia",
      "name": "GammIA",
      "area": "Corporativo",
      "rag_tags": null,
      "is_internal_only": false,
      "is_active": true,
      "avatar_url": "/static/gammia-avatar.png"
    },
    {
      "id": "iris",
      "name": "Iris",
      "area": "Intranet",
      "rag_tags": ["intranet", "general"],
      "is_internal_only": true,
      "is_active": true
    }
  ]
}
```

### `POST /api/v1/agents`
Crea un nuevo agente.

```json
{
  "id": "iris-rrhh",
  "name": "Iris RRHH",
  "area": "Recursos Humanos",
  "description": "Asistente de RRHH para consultas de nómina y políticas",
  "system_prompt": "Eres Iris, asistente de RRHH de Gamma Ingenieros...",
  "greeting": "¡Hola! Soy Iris de RRHH. ¿En qué te puedo ayudar?",
  "rag_tags": ["rrhh", "policies", "general"],
  "is_internal_only": true,
  "model_id": "gemini-2.0-flash",
  "llm_temperature": 0.1,
  "rag_top_k": 10,
  "max_interactions": 15,
  "is_active": true
}
```

> Los campos de LLM (`model_id`, `llm_temperature`, etc.) son opcionales. Si se omiten o son `null`, el agente hereda los valores de la configuración global del widget.

### `PUT /api/v1/agents/{id}`
Actualiza campos de un agente (enviar solo los campos a modificar).

### `DELETE /api/v1/agents/{id}`
Elimina un agente. Los agentes del sistema (`gammia`, `iris`) no pueden eliminarse.

### `POST /api/v1/agents/{id}/avatar`
Sube un archivo PNG como avatar del agente.

```bash
curl -X POST /api/v1/agents/iris-rrhh/avatar \
  -H "Authorization: Bearer <token>" \
  -F "file=@iris-avatar.png"
```

### `GET /api/v1/agents/{id}/stats`
Estadísticas de uso del agente para el dashboard de costos por área.

```json
{
  "agent_id": "iris",
  "total_interactions": 342,
  "total_tokens_in": 48200,
  "total_tokens_out": 127400,
  "avg_latency_ms": 1850.3
}
```

---

## 5. Administración del Widget

### `GET /api/v1/widget/admin/config` (admin)
Retorna la configuración completa del widget global.

### `PUT /api/v1/widget/admin/config` (admin)
Actualiza la configuración global del widget. Afecta a todos los agentes que no tengan sus propios overrides.

```json
{
  "model_id": "gemini-2.5-flash-preview-04-17",
  "llm_temperature": 0.15,
  "rag_top_k": 20,
  "max_interactions": 12,
  "primary_color": "#168bf2"
}
```

### `POST /api/v1/widget/admin/avatar` (admin)
Sube el avatar de GammIA (PNG). El archivo se guarda en `/static/`.

### `GET /api/v1/widget/admin/models` (admin)
Lista los modelos Gemini disponibles para `generateContent`. Útil para el selector de modelos en el panel.

### `GET /api/v1/widget/admin/sessions` (admin)
Lista las últimas 100 sesiones del widget con historial de mensajes completo.

---

## 6. RAG — Gestión del conocimiento

### `GET /api/v1/rag/tags`
Lista todos los tags disponibles (sistema + personalizados).

**Tags del sistema:**
| Tag | Uso |
|---|---|
| `public` | Visible en contexto público (web corporativa) |
| `general` | Conocimiento general Gamma |
| `internal` | Solo contexto interno |
| `portfolio`, `solutions`, `services` | Por tipo de contenido comercial |
| `policies` | Políticas y procedimientos |
| `csoc`, `cx`, `cux`, `marketing` | Por área |

### `POST /api/v1/rag/upload` (admin)
Sube un documento al RAG. Soporta PDF, DOCX, XLSX, PPTX.

```bash
curl -X POST /api/v1/rag/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@politica-rrhh.pdf" \
  -F 'tags=["rrhh","policies","internal"]' \
  -F "title=Política de RRHH 2026"
```

### `POST /api/v1/rag/sync-drive` (admin)
Sincroniza una carpeta de Google Drive al RAG.

```json
{ "folder_id": "1AbCdEfG...", "tags": ["internal", "general"] }
```

Requiere que el Service Account de GCP tenga acceso de lectura a la carpeta.

### `GET /api/v1/rag/nodes` (admin)
Lista los nodos vectorizados con sus tags, título y fecha.

### `DELETE /api/v1/rag/nodes/{doc_id}` (admin)
Elimina todos los chunks de un documento del índice vectorial.

---

## 7. Analytics

### `GET /api/v1/analytics/stats`
Métricas globales para el dashboard.

```json
{
  "total_vectors": 1842,
  "total_interactions": 4321,
  "total_tokens": 2840000,
  "avg_latency_ms": 1720
}
```

### `GET /api/v1/analytics/timeline`
Interacciones agrupadas por día (últimos 30 días). Útil para gráficas de tendencia.

### `GET /api/v1/analytics/export/csv`
Exporta el historial completo de interacciones en CSV (admin).

---

## 8. Integraciones

### `GET /api/v1/integrations`
Lista el estado de todas las integraciones (RAG, Google Workspace, Salesforce, etc.).

### `PUT /api/v1/integrations/{id}`
Habilita/deshabilita una integración y guarda su configuración.

```json
{ "enabled": true, "config_json": "{\"folder_id\": \"1AbC...\"}" }
```

### `POST /api/v1/integrations/{id}/test`
Prueba la conectividad de una integración. Retorna `ok: true/false` con un mensaje de diagnóstico.

---

## 9. Administración de usuarios

### `POST /api/v1/auth/login`
Login de administrador. Retorna JWT.

### `GET /api/v1/auth/me`
Retorna el perfil del usuario autenticado.

### `GET /api/v1/auth/users` (superadmin)
Lista todos los administradores.

### `POST /api/v1/auth/users` (superadmin)
Crea un nuevo administrador.

### `PUT /api/v1/auth/users/{id}` (superadmin)
Actualiza datos o contraseña de un administrador.

### `DELETE /api/v1/auth/users/{id}` (superadmin)
Elimina un administrador.

---

## 10. Códigos de estado HTTP

| Código | Significado | Acción en UI |
|---|---|---|
| `200` | Éxito | Mostrar respuesta |
| `400` | Guardrail activado / Parámetro inválido | Mostrar mensaje de política |
| `401` | Token inválido o ausente | Redirigir a login / pedir nuevo token |
| `403` | Sin permisos suficientes (admin vs superadmin) | Mostrar aviso de permisos |
| `404` | Recurso no encontrado | Mostrar error contextual |
| `409` | Conflicto (ej: ID de agente duplicado) | Notificar al usuario |
| `422` | Error de validación de parámetros | Mostrar detalle del campo inválido |
| `500` | Error interno del servidor | Mostrar mensaje genérico + intentar de nuevo |

---

## 11. Headers de seguridad

El backend incluye automáticamente estos headers en todas las respuestas:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
X-XSS-Protection: 1; mode=block
```

Los orígenes permitidos para CORS se configuran con la variable `ALLOWED_ORIGINS` (separados por coma). En producción nunca usar wildcard `*` con `credentials: true`.
