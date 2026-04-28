import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.db.database import engine, Base
from app.api.endpoints import chat, rag, analytics, widget, admin_auth, integrations

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Conectar al servidor MCP de certificaciones (solo para usuarios internos)
    from app.agents.mcp_client import mcp_manager
    if settings.MCP_CERTIFICATIONS_URL:
        # Producción GCP: el servidor MCP corre en la red local de Gamma vía SSE
        await mcp_manager.connect(sse_url=settings.MCP_CERTIFICATIONS_URL)
    else:
        # Desarrollo local: arranca el servidor como subprocess (requiere VPN)
        mcp_script = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "mcp_servers", "certifications_mcp.py")
        )
        await mcp_manager.connect(stdio_script=mcp_script)

    try:
        await _init_db()
    except Exception as e:
        print(f"[GammIA] WARN: startup DB init falló ({e}). El servicio continúa.")

    yield

    await mcp_manager.disconnect()
    await engine.dispose()


async def _init_db():
    """Migraciones DDL, seed de datos iniciales. Corre en el lifespan de startup."""
    from sqlalchemy import text
    from app.db.models import WidgetConfig, AdminUser
    from app.core.auth import hash_password
    from sqlalchemy.ext.asyncio import AsyncSession

    # Tx 1: extensión pgvector (debe existir antes de create_all)
    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))

    # Tx 2: crear todas las tablas (aislado para que nunca sea revertido por patches)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Tx 3: patches ALTER TABLE en document_nodes
    for stmt in [
        "ALTER TABLE document_nodes ADD COLUMN IF NOT EXISTS tags VARCHAR[] DEFAULT ARRAY['general']::VARCHAR[]",
        "ALTER TABLE document_nodes ALTER COLUMN embedding TYPE vector(3072)",
        "ALTER TABLE document_nodes ADD COLUMN IF NOT EXISTS content_tsv tsvector",
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass

    # Tx 4: patches ALTER TABLE en widget_config (una tx por columna para evitar rollback en cascada)
    for col, type_def in [
        ("secondary_color",   "VARCHAR DEFAULT '#0d5eab'"),
        ("background_color",  "VARCHAR DEFAULT '#1a1a1a'"),
        ("surface_color",     "VARCHAR DEFAULT '#2d2d2d'"),
        ("surface2_color",    "VARCHAR DEFAULT '#3d3d3d'"),
        ("user_bubble_color", "VARCHAR DEFAULT '#168bf2'"),
        ("bot_bubble_color",  "VARCHAR DEFAULT '#3d3d3d'"),
        ("text_color",        "VARCHAR DEFAULT '#E2E8F0'"),
        ("border_color",      "VARCHAR DEFAULT '#1E293B'"),
        ("subtitle",          "VARCHAR DEFAULT 'Asistente Virtual · Gamma Ingenieros'"),
        ("bot_icon_type",     "VARCHAR DEFAULT 'avatar'"),
        ("theme",             "VARCHAR DEFAULT 'dark'"),
        ("max_interactions",  "INTEGER DEFAULT 10"),
        ("chat_width",        "INTEGER DEFAULT 370"),
        ("chat_height",       "INTEGER DEFAULT 560"),
        ("model_id",          "VARCHAR DEFAULT 'gemini-1.5-flash'"),
        ("llm_temperature",   "FLOAT DEFAULT 0.1"),
        ("llm_top_p",         "FLOAT DEFAULT 0.95"),
        ("llm_top_k",         "INTEGER DEFAULT 40"),
        ("rag_top_k",         "INTEGER DEFAULT 15"),
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(f"ALTER TABLE widget_config ADD COLUMN IF NOT EXISTS {col} {type_def}"))
        except Exception:
            pass

    # Tx 5: patches en interaction_logs y widget_sessions
    for stmt in [
        "ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR",
        "CREATE INDEX IF NOT EXISTS idx_interaction_logs_session_id ON interaction_logs (session_id)",
        "ALTER TABLE widget_sessions ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ",
        # Tabla de integraciones (creada por create_all, este patch es por si existe sin la columna)
        "CREATE TABLE IF NOT EXISTS integration_configs (id VARCHAR PRIMARY KEY, enabled BOOLEAN DEFAULT FALSE, config_json TEXT, updated_at TIMESTAMPTZ DEFAULT now())",
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass

    # Tx 6: HNSW index (puede fallar si vector(3072) > 2000 dims — no crítico)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_document_nodes_embedding_hnsw
                ON document_nodes USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
            """))
    except Exception as e:
        print(f"Info HNSW index: {e}")

    # Tx 7: GIN full-text index
    try:
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE document_nodes SET content_tsv = to_tsvector('spanish', coalesce(content,'')) WHERE content_tsv IS NULL"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_document_nodes_content_gin ON document_nodes USING gin(content_tsv)"))
    except Exception as e:
        print(f"Info GIN index: {e}")

    # Seed en sesión separada
    async with AsyncSession(engine) as session:
        result = await session.execute(text("SELECT id FROM widget_config WHERE id=1"))
        if not result.scalar():
            session.add(WidgetConfig(id=1))
            await session.commit()

    async with AsyncSession(engine) as session:
        result = await session.execute(text("SELECT id FROM admin_users LIMIT 1"))
        if not result.scalar():
            session.add(AdminUser(
                email=settings.ADMIN_DEFAULT_EMAIL,
                full_name="Administrador Principal",
                hashed_password=hash_password(settings.ADMIN_DEFAULT_PASSWORD),
                role="superadmin",
                created_by="system",
            ))
            await session.commit()
            print(f"[GammIA] Admin por defecto creado: {settings.ADMIN_DEFAULT_EMAIL}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

from fastapi.middleware.cors import CORSMiddleware

# Configuración CORS para permitir peticiones del Frontend React (Local y Prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción reemplazar con ["https://admin.gammaingenieros.com", "http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(admin_auth.router, prefix="/api/v1/auth", tags=["Admin Auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat & Orchestration"])
app.include_router(rag.router, prefix="/api/v1/rag", tags=["Vector RAG Sync"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Commercial Analytics"])
app.include_router(widget.router, prefix="/api/v1/widget", tags=["Chatbot Widget"])
app.include_router(integrations.router, prefix="/api/v1/integrations", tags=["Integrations"])

# Servir archivos estáticos (widget JS, demo page)
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/widget", response_class=HTMLResponse)
async def widget_page(request: Request, ctx: str = "public", secret: str = ""):
    """Sirve el widget como página standalone (para iFrame en Google Sites)."""
    demo_file = os.path.join(static_dir, "widget-iframe.html")
    if os.path.exists(demo_file):
        return FileResponse(demo_file)
    # Fallback inline si no existe el archivo
    api_base = str(request.base_url).rstrip("/")
    return HTMLResponse(f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{{margin:0;padding:0;box-sizing:border-box}}body{{background:#0B1120;height:100vh;display:flex;align-items:flex-end;justify-content:flex-end}}</style>
</head><body>
<script src="{api_base}/static/gammia-widget.js"
  data-context="{ctx}" data-secret="{secret}"
  data-theme="dark" data-api="{api_base}"></script>
<script>window.onload=function(){{setTimeout(function(){{
  var b=document.getElementById('gammia-widget-btn');
  if(b)b.click();
}},400)}}</script>
</body></html>""")

@app.get("/widget/demo", response_class=HTMLResponse)
async def widget_demo():
    """Página de documentación e integración del widget."""
    demo_file = os.path.join(static_dir, "widget-demo.html")
    if os.path.exists(demo_file):
        return FileResponse(demo_file)
    return HTMLResponse("<h1>Demo no disponible</h1>")

@app.get("/")
async def root():
    return {"message": "Bienvenido a la API del orquestador GammIA - Gamma Ingenieros"}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
