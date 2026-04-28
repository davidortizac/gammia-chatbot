# GammIA Platform — Manual CI/CD y Despliegue en GCP

> **Versión:** 2.0 · **Actualizado:** Abril 2026  
> **Proyecto GCP:** `automatizaciones-n8n-ia`  
> **Servicio Cloud Run:** `gammia-api` · Región: `us-central1`  
> **Imagen Docker:** `us-central1-docker.pkg.dev/automatizaciones-n8n-ia/mcp-cloud-run-deployments/gammia-api`

---

## 1. Arquitectura de despliegue actual

```
GitHub (master)
      │
      │  git push
      ▼
  [Manual]  gcloud builds submit
      │
      ▼
Cloud Build (proyecto: automatizaciones-n8n-ia)
  ├─ Instala dependencias Python
  ├─ Build imagen Docker
  └─ Push → Artifact Registry
                │
                ▼
         Cloud Run deploy
         gammia-api (revision gammia-api-00026-6jm)
         https://gammia-api-1028680563477.us-central1.run.app
```

> **Estado actual:** El build se lanza **manualmente** con `gcloud builds submit`. No hay trigger automático de GitHub configurado aún. Ver Sección 5 para configurarlo.

---

## 2. Variables de entorno y secretos

### 2.1 Secret Manager (producción)

Los secretos sensibles se almacenan en **GCP Secret Manager** y se inyectan automáticamente en Cloud Run al desplegar. **Nunca** se ponen en variables de entorno planas en el deploy command.

| Nombre del Secret | Variable en el contenedor | Descripción |
|---|---|---|
| `gammia-jwt-secret` | `JWT_SECRET_KEY` | Clave de firma de tokens JWT de administrador |
| `gammia-google-api-key` | `GOOGLE_API_KEY` | API Key de Google AI Studio (Gemini) |
| `gammia-db-url` | `DATABASE_URL` | URL completa de conexión PostgreSQL en Cloud SQL |
| `gammia-widget-secret` | `WIDGET_INTERNAL_SECRET` | Secret del widget embebido en Google Sites |

**Crear o actualizar un secreto:**

```bash
# Crear nuevo secreto
printf 'VALOR_DEL_SECRETO' | gcloud secrets create NOMBRE_SECRETO \
  --data-file=- --project automatizaciones-n8n-ia

# Actualizar versión existente
printf 'NUEVO_VALOR' | gcloud secrets versions add NOMBRE_SECRETO \
  --data-file=- --project automatizaciones-n8n-ia
```

**Dar acceso al SA de Cloud Run a los secretos (ejecutar una sola vez por secreto):**

```bash
gcloud secrets add-iam-policy-binding NOMBRE_SECRETO \
  --member="serviceAccount:1028680563477-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project automatizaciones-n8n-ia
```

### 2.2 Variables de entorno no sensibles

Se pasan con `--set-env-vars` o `--env-vars-file` en el deploy:

| Variable | Ejemplo | Descripción |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://admin.gammaingenieros.com` | CORS — orígenes permitidos (coma separados) |
| `MCP_CERTIFICATIONS_URL` | `http://10.x.x.x:8001/sse` | URL del servidor MCP en red local de Gamma |
| `MODEL_ID` | `gemini-2.0-flash` | Modelo Gemini por defecto |

---

## 3. Proceso de build y despliegue manual

### 3.1 Prerrequisitos

```bash
# Autenticarse con GCP
gcloud auth login

# Configurar el proyecto
gcloud config set project automatizaciones-n8n-ia

# Configurar Docker para Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 3.2 Build y push de imagen

Desde la raíz del repositorio (`e:\IA\GAMMA\GAMMIA-MCP\CHATBOT`):

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/automatizaciones-n8n-ia/mcp-cloud-run-deployments/gammia-api:latest \
  --project automatizaciones-n8n-ia
```

El build tarda ~2-3 minutos. El `cloudbuild.yaml` en la raíz del repo define los pasos.

### 3.3 Deploy a Cloud Run

```bash
gcloud run deploy gammia-api \
  --image us-central1-docker.pkg.dev/automatizaciones-n8n-ia/mcp-cloud-run-deployments/gammia-api:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --update-secrets=JWT_SECRET_KEY=gammia-jwt-secret:latest,GOOGLE_API_KEY=gammia-google-api-key:latest,DATABASE_URL=gammia-db-url:latest,WIDGET_INTERNAL_SECRET=gammia-widget-secret:latest \
  --cpu=1 --memory=512Mi \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=4 \
  --project automatizaciones-n8n-ia
```

> Si necesitas cambiar `ALLOWED_ORIGINS` (contiene comas), usa un archivo YAML:
>
> ```bash
> # Crear archivo temporal
> cat > /tmp/gammia-env.yaml << 'EOF'
> ALLOWED_ORIGINS: "https://admin.gammaingenieros.com,https://gammaingenieros.com"
> EOF
>
> # Agregar al deploy
> gcloud run deploy gammia-api ... --env-vars-file=/tmp/gammia-env.yaml
> ```

### 3.4 Verificar el despliegue

```bash
# Ver la revisión activa
gcloud run revisions list --service gammia-api --region us-central1 --project automatizaciones-n8n-ia

# Health check
curl https://gammia-api-1028680563477.us-central1.run.app/
# Respuesta esperada: {"message":"Bienvenido a la API del orquestador GammIA - Gamma Ingenieros"}

# Verificar que los endpoints protegidos responden 401
curl -o /dev/null -w "%{http_code}" https://gammia-api-1028680563477.us-central1.run.app/api/v1/agents
# 401
```

---

## 4. Rollback de emergencia

Si una revisión introduce un error crítico:

```bash
# Listar revisiones disponibles
gcloud run revisions list --service gammia-api --region us-central1 --project automatizaciones-n8n-ia

# Devolver tráfico a una revisión anterior
gcloud run services update-traffic gammia-api \
  --to-revisions gammia-api-00025-svw=100 \
  --region us-central1 \
  --project automatizaciones-n8n-ia
```

El cambio de tráfico es instantáneo (< 5 segundos). También se puede hacer desde la consola de GCP: **Cloud Run → gammia-api → Revisiones → Gestionar tráfico**.

---

## 5. Configurar trigger automático de GitHub (pendiente)

Actualmente el build es manual. Para automatizarlo al hacer push a `master`:

### Paso 1 — Conectar el repositorio

1. Ir a **GCP Console → Cloud Build → Triggers**
2. Clic en **"Connect Repository"**
3. Seleccionar **GitHub** y autenticar
4. Buscar y seleccionar `davidortizac/gammia-chatbot`

### Paso 2 — Crear el trigger

```bash
gcloud builds triggers create github \
  --name="gammia-deploy-master" \
  --repo-name="gammia-chatbot" \
  --repo-owner="davidortizac" \
  --branch-pattern="^master$" \
  --build-config="cloudbuild.yaml" \
  --project automatizaciones-n8n-ia
```

### Paso 3 — Actualizar `cloudbuild.yaml`

El archivo actual tiene pasos de Terraform que no están implementados. Para habilitar el trigger automático, simplificar `cloudbuild.yaml` a:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/$PROJECT_ID/mcp-cloud-run-deployments/gammia-api:$COMMIT_SHA', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/$PROJECT_ID/mcp-cloud-run-deployments/gammia-api:$COMMIT_SHA']

  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - gammia-api
      - --image
      - us-central1-docker.pkg.dev/$PROJECT_ID/mcp-cloud-run-deployments/gammia-api:$COMMIT_SHA
      - --region=us-central1
      - --platform=managed
      - --allow-unauthenticated
      - --update-secrets=JWT_SECRET_KEY=gammia-jwt-secret:latest,GOOGLE_API_KEY=gammia-google-api-key:latest,DATABASE_URL=gammia-db-url:latest,WIDGET_INTERNAL_SECRET=gammia-widget-secret:latest
      - --cpu=1
      - --memory=512Mi
      - --concurrency=80
      - --min-instances=0
      - --max-instances=4
```

### Paso 4 — Dar permisos al SA de Cloud Build

```bash
# El SA de Cloud Build necesita poder desplegar en Cloud Run
PROJECT_NUMBER=1028680563477

gcloud projects add-iam-policy-binding automatizaciones-n8n-ia \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding automatizaciones-n8n-ia \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## 6. Admin UI — Despliegue en red local Gamma

El panel de administración es una app React/Vite que se sirve desde un equipo en la red local de Gamma. No se despliega en GCP.

### Instalar dependencias y correr en desarrollo

```bash
cd admin-ui
npm install
npm run dev
# Escucha en http://localhost:5173
```

### Build de producción

```bash
cd admin-ui
npm run build
# Genera admin-ui/dist/
```

Servir `dist/` con cualquier servidor web estático (Nginx, IIS, etc.) en la máquina de la red local.

**Proxy de API:** El archivo `vite.config.js` ya está configurado para proxy al backend en Cloud Run:

```javascript
target: process.env.VITE_BACKEND_URL || 'https://gammia-api-1028680563477.us-central1.run.app'
```

En producción estática, configurar `VITE_BACKEND_URL` antes del build, o configurar el proxy en Nginx apuntando a la URL de Cloud Run.

### Configuración Nginx (producción local)

```nginx
server {
    listen 80;
    server_name admin.gamma.local;
    root /opt/gamma/admin-ui/dist;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API al backend en GCP
    location /api/ {
        proxy_pass https://gammia-api-1028680563477.us-central1.run.app;
        proxy_ssl_server_name on;
    }

    location /static/ {
        proxy_pass https://gammia-api-1028680563457.us-central1.run.app;
        proxy_ssl_server_name on;
    }
}
```

---

## 7. Base de datos — Cloud SQL PostgreSQL

**Instancia:** Cloud SQL PostgreSQL 15 con extensión `pgvector`  
**Conexión:** Via IP privada desde Cloud Run (`10.224.0.3:5432`)  
**Base de datos:** `gammiadb` · **Usuario:** `gamma_admin`

Las migraciones de esquema se ejecutan **automáticamente al arranque** de la aplicación via `_init_db()` en `app/main.py`. No hay herramienta de migración separada (Alembic) — se usan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para cada campo nuevo.

**Backup manual:**

```bash
gcloud sql export sql gammia-db \
  gs://automatizaciones-n8n-ia-backups/gammiadb-$(date +%Y%m%d).sql \
  --database=gammiadb \
  --project automatizaciones-n8n-ia
```

---

## 8. Checklist de despliegue

- [ ] `git push origin master` — código en GitHub
- [ ] `gcloud builds submit` — imagen construida y en Artifact Registry
- [ ] `gcloud run deploy` — nueva revisión activa en Cloud Run
- [ ] Health check: `GET /` retorna 200
- [ ] Verificar: `GET /api/v1/agents` retorna 401 (auth activo)
- [ ] Login en admin panel con credenciales (puede requerir logout/login si rotó JWT_SECRET_KEY)
- [ ] Confirmar en "Agentes & Chatbots" que `gammia` e `iris` aparecen seeded
- [ ] Probar chat en widget con `agent_id: "gammia"` y `agent_id: "iris"`
