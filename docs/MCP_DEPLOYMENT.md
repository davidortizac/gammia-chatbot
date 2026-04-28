# MCP — Guía de Despliegue en Red Local Gamma

> **Versión:** 1.0 · **Fecha:** Abril 2026  
> **Componente:** `certifications_mcp.py` (servidor) + `mcp_client.py` (cliente en GCP)

---

## 1. Contexto arquitectónico

El servidor MCP de certificaciones actúa como **puente controlado** entre el chatbot GammIA
(desplegado en GCP) y los endpoints corporativos internos de Gamma Ingenieros que solo son
accesibles dentro de la red local o con VPN activa.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GCP (Cloud Run / GCE)                                                      │
│                                                                             │
│   FastAPI Chatbot (GammIA)                                                  │
│     └─ mcp_client.py                                                        │
│          └─ SSE HTTP  ──────────────────────────────────────────────────┐  │
└─────────────────────────────────────────────────────────────────────────│──┘
                                                                          │
       Tunnel VPN / Cloud Interconnect / regla firewall puntual           │
                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Red Local Gamma Ingenieros                                                 │
│                                                                             │
│   Servidor MCP (Windows / Linux)          Endpoint Corporativo              │
│     certifications_mcp.py                                                   │
│       ├─ Escucha :8001/sse   ◄──SSE──    (cliente GCP)                      │
│       └─ HTTP GET ──────────────────────► emsg.gammaingenieros.com          │
│                                            /apiControllers/getData.ashx     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Flujo de una consulta:**

1. Usuario interno pregunta al chatbot en GCP.
2. Gemini decide invocar `listar_funcionarios_por_marca` o `obtener_certificaciones_funcionario`.
3. `mcp_client.py` hace el call via SSE al servidor MCP en la red de Gamma.
4. El servidor MCP consulta el endpoint interno y devuelve los datos.
5. Gemini sintetiza la respuesta final.

---

## 2. Puertos y reglas de red

### 2.1 Puerto del servidor MCP

| Puerto | Protocolo | Dirección     | Origen permitido       | Destino              |
|--------|-----------|---------------|------------------------|----------------------|
| 8001   | TCP/HTTP  | ENTRANTE      | IP(s) de salida de GCP | Servidor MCP local   |

> **Configurables** via variables de entorno `MCP_HOST` y `MCP_PORT` antes de levantar el servidor.

### 2.2 Puerto del endpoint corporativo

| Puerto | Protocolo | Dirección | Origen permitido  | Destino                       |
|--------|-----------|-----------|-------------------|-------------------------------|
| 443    | HTTPS     | SALIENTE  | Servidor MCP      | emsg.gammaingenieros.com      |

### 2.3 Obtener las IPs de salida de GCP

Si el chatbot corre en **Cloud Run**, las IPs de salida no son fijas por defecto.
Para fijarlas se debe configurar **Cloud NAT**:

```bash
# Reservar IP estática de salida en GCP
gcloud compute addresses create gammia-nat-ip --region=us-central1

# Crear Cloud Router
gcloud compute routers create gammia-router \
  --network=default --region=us-central1

# Asociar Cloud NAT con la IP estática
gcloud compute routers nats create gammia-nat \
  --router=gammia-router \
  --region=us-central1 \
  --nat-external-ip-pool=gammia-nat-ip \
  --nat-custom-subnet-ip-ranges=default
```

Luego esa IP estática es la que se whitelist en el firewall de Gamma.

---

## 3. Configuración del WAF / Firewall

### 3.1 Regla mínima recomendada (firewall perimetral Gamma)

```
ALLOW TCP:8001 FROM <IP-estatica-GCP> TO <IP-servidor-MCP>
DENY  TCP:8001 FROM any
```

El puerto **8001 NO debe ser expuesto a internet**. Solo la IP de salida de GCP debe poder
alcanzarlo. Si Gamma usa un WAF (FortiWeb, Palo Alto, etc.) la regla va en la zona DMZ→LAN
o directamente en el host firewall del servidor donde corre el MCP.

### 3.2 Validación desde GCP (prueba de conectividad)

```bash
# Desde una instancia GCE o Cloud Shell con la IP NAT configurada
curl -v http://<IP-servidor-MCP>:8001/sse --max-time 5
# Respuesta esperada: 200 OK con Content-Type: text/event-stream
```

---

## 4. Seguridad en tránsito

El servidor MCP expone HTTP plano por defecto. Para producción se recomiendan las siguientes capas:

### 4.1 Opción A — Token compartido (mínimo viable)

Agrega un header `Authorization` que el cliente envía y el servidor valida.

**En el servidor (`certifications_mcp.py`)**, agregar middleware Starlette:

```python
import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

MCP_SECRET = os.getenv("MCP_SECRET_TOKEN", "")

class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if MCP_SECRET:
            auth = request.headers.get("Authorization", "")
            if auth != f"Bearer {MCP_SECRET}":
                return Response("Unauthorized", status_code=401)
        return await call_next(request)

# Montar en la app SSE
app = mcp.sse_app()
app.add_middleware(TokenAuthMiddleware)
```

**En el cliente (`mcp_client.py`)**, pasar el header:

```python
await mcp_manager.connect(
    sse_url=settings.MCP_CERTIFICATIONS_URL,
    headers={"Authorization": f"Bearer {settings.MCP_SECRET_TOKEN}"}
)
```

Y en `mcp_client.py → connect()`:

```python
read, write = await self._exit_stack.enter_async_context(
    sse_client(url=sse_url, headers=headers or {})
)
```

### 4.2 Opción B — HTTPS con certificado (recomendado para producción)

Poner **nginx** o **Caddy** como reverse proxy frente al servidor MCP:

```nginx
# /etc/nginx/conf.d/mcp.conf
server {
    listen 443 ssl;
    server_name mcp-certs.gammaingenieros.com;

    ssl_certificate     /etc/ssl/gamma/cert.pem;
    ssl_certificate_key /etc/ssl/gamma/key.pem;

    location /sse {
        proxy_pass         http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        chunked_transfer_encoding on;
    }
}
```

Y la variable en GCP pasa a ser `MCP_CERTIFICATIONS_URL=https://mcp-certs.gammaingenieros.com/sse`.

### 4.3 Opción C — VPN site-to-site (mayor aislamiento)

Crear un túnel **Cloud VPN** entre GCP y la red de Gamma:
- GCP VPN Gateway ←→ FortiGate / PfSense de Gamma
- El servidor MCP escucha solo en `127.0.0.1:8001` (no expuesto a red)
- GCP accede via IP privada del túnel VPN
- Cero exposición al internet público

---

## 5. Ejecución local — Servidor MCP

### 5.1 Requisitos en la máquina de Gamma

```bash
# Python 3.11+ requerido
python --version

# Instalar dependencias (mismo requirements.txt del chatbot)
pip install mcp httpx python-dotenv
```

### 5.2 Variables de entorno necesarias

Crear un archivo `.env` en la misma carpeta o exportar las variables:

```env
# Host y puerto del servidor SSE
MCP_HOST=0.0.0.0
MCP_PORT=8001

# Opcional: token de autenticación compartido con GCP
MCP_SECRET_TOKEN=cambia-por-token-aleatorio-largo
```

### 5.3 Levantar el servidor

```bash
# Modo SSE (producción — escucha en red)
python mcp_servers/certifications_mcp.py sse

# Modo stdio (desarrollo local con VPN — subprocess)
python mcp_servers/certifications_mcp.py
```

Salida esperada en modo SSE:
```
Iniciando Servidor MCP 'Gammia Certificaciones' en SSE: http://0.0.0.0:8001/sse
INFO:     Started server process [1234]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

### 5.4 Correr como servicio en Windows (NSSM)

Para que arranque automáticamente con el sistema:

```powershell
# Descargar NSSM: https://nssm.cc/download
# Instalar el servicio
nssm install GammIA-MCP "C:\Python311\python.exe" `
  "E:\gamma\mcp_servers\certifications_mcp.py" sse

nssm set GammIA-MCP AppEnvironmentExtra MCP_HOST=0.0.0.0 MCP_PORT=8001
nssm set GammIA-MCP AppStdout "E:\gamma\logs\mcp_out.log"
nssm set GammIA-MCP AppStderr "E:\gamma\logs\mcp_err.log"
nssm set GammIA-MCP Start SERVICE_AUTO_START

nssm start GammIA-MCP
```

### 5.5 Correr como servicio en Linux (systemd)

```ini
# /etc/systemd/system/gammia-mcp.service
[Unit]
Description=GammIA MCP Certificaciones
After=network.target

[Service]
User=gamma
WorkingDirectory=/opt/gamma/chatbot
ExecStart=/usr/bin/python3 mcp_servers/certifications_mcp.py sse
Restart=always
RestartSec=5
Environment=MCP_HOST=0.0.0.0
Environment=MCP_PORT=8001
Environment=MCP_SECRET_TOKEN=tu-token-aqui
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now gammia-mcp
systemctl status gammia-mcp
```

---

## 6. Observabilidad — Logs y métricas

### 6.1 Logs estructurados en el servidor MCP

Agrega logging estructurado a `certifications_mcp.py` para que cada request quede registrado:

```python
import logging
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s'
)
logger = logging.getLogger("gammia.mcp")

# Dentro de cada tool, al inicio:
logger.info(json.dumps({
    "event": "tool_called",
    "tool": "listar_funcionarios_por_marca",
    "args": {"marca_fabricante": marca_fabricante}
}))
```

### 6.2 Opción A — Cloud Logging (GCP nativo)

Si el servidor MCP corre en una VM de GCP o se decide enviarlo desde Gamma:

```bash
# Instalar el agente de logging de GCP en el servidor de Gamma
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
bash add-google-cloud-ops-agent-repo.sh --also-install
```

Configurar `/etc/google-cloud-ops-agent/config.yaml`:

```yaml
logging:
  receivers:
    mcp_logs:
      type: files
      include_paths:
        - /opt/gamma/logs/mcp_out.log
        - /opt/gamma/logs/mcp_err.log
  service:
    pipelines:
      mcp_pipeline:
        receivers: [mcp_logs]
```

Los logs aparecen en **Cloud Logging → Log Explorer** con el label `gammia-mcp`.

### 6.3 Opción B — Elastic Stack (ELK / EFK)

Si Gamma ya tiene Elasticsearch/Kibana:

```bash
# Instalar Filebeat en el servidor MCP
# Configuración /etc/filebeat/filebeat.yml

filebeat.inputs:
  - type: log
    paths:
      - /opt/gamma/logs/mcp_*.log
    fields:
      service: gammia-mcp
      environment: production
    json.keys_under_root: true

output.elasticsearch:
  hosts: ["https://elastic.gammaingenieros.com:9200"]
  username: "filebeat_user"
  password: "${ELASTIC_PASSWORD}"
  index: "gammia-mcp-%{+yyyy.MM.dd}"
```

Dashboard recomendado en Kibana: filtrar por `fields.service: gammia-mcp` para ver:
- Volumen de llamadas por herramienta
- Latencia del endpoint corporativo
- Errores de conexión VPN/endpoint

### 6.4 Opción C — Grafana Loki (liviano, sin Elasticsearch)

```bash
# Instalar Promtail en el servidor MCP
# /etc/promtail/config.yaml

server:
  http_listen_port: 9080

clients:
  - url: http://loki.gammaingenieros.com:3100/loki/api/v1/push

scrape_configs:
  - job_name: gammia_mcp
    static_configs:
      - targets: [localhost]
        labels:
          job: gammia-mcp
          env: production
          __path__: /opt/gamma/logs/mcp_*.log
```

Query en Grafana para ver errores en tiempo real:
```logql
{job="gammia-mcp"} |= "ERROR"
```

### 6.5 Métricas de health (endpoint de estado)

El servidor MCP expone automáticamente via uvicorn. Puedes agregar un endpoint `/health`
creando una app compuesta:

```python
# Al final de certifications_mcp.py, antes del if __name__
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
import time

_start_time = time.time()

async def health(request):
    return JSONResponse({
        "status": "ok",
        "uptime_seconds": round(time.time() - _start_time),
        "service": "gammia-mcp-certifications"
    })
```

Luego en el modo SSE usar la app compuesta en lugar del `mcp.run()` directo.
Prometheus / Grafana pueden scrapearlo con un probe HTTP.

---

## 7. Matriz de conectividad y seguridad

| Origen         | Destino                        | Puerto | Protocolo | Auth requerida      | Por WAF |
|----------------|-------------------------------|--------|-----------|---------------------|---------|
| GCP (Cloud Run)| Servidor MCP Gamma            | 8001   | HTTP/SSE  | Bearer token o mTLS | Sí      |
| Servidor MCP   | emsg.gammaingenieros.com      | 443    | HTTPS     | Token en URL        | No      |
| Admin Gamma    | Servidor MCP (logs/status)    | 8001   | HTTP      | IP allowlist        | No      |
| Prometheus     | Servidor MCP (/health)        | 8001   | HTTP      | IP allowlist        | No      |

---

## 8. Checklist de puesta en producción

- [ ] IP estática de salida configurada en GCP (Cloud NAT)
- [ ] Regla de firewall Gamma: `ALLOW TCP:8001 FROM <IP-GCP>`
- [ ] Variable `MCP_CERTIFICATIONS_URL` seteada en el deploy de GCP
- [ ] Variable `MCP_SECRET_TOKEN` generada y sincronizada en ambos lados
- [ ] Servidor MCP corriendo como servicio (NSSM / systemd)
- [ ] Logs enviándose a la herramienta de observabilidad elegida
- [ ] Prueba de conectividad end-to-end desde GCP hacia `:8001/sse`
- [ ] Prueba funcional: pregunta de certificaciones en el chatbot de producción
- [ ] Alerta configurada si el servidor MCP no responde en >30s
