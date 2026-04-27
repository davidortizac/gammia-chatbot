import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.db.database import engine, Base
from app.api.endpoints import chat, rag, analytics, widget, admin_auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))

        # Patch 1: añadir columna tags si no existe
        try:
            await conn.execute(text("ALTER TABLE document_nodes ADD COLUMN IF NOT EXISTS tags VARCHAR[] DEFAULT ARRAY['general']::VARCHAR[]"))
        except Exception:
            pass

        # Patch 2: actualizar dimensión del embedding de 768 a 3072 (gemini-embedding-001)
        try:
            await conn.execute(text("ALTER TABLE document_nodes ALTER COLUMN embedding TYPE vector(3072)"))
        except Exception:
            pass  # Ya tiene las dimensiones correctas o la tabla no existe aún

        # Crear todas las tablas (incluyendo la nueva tabla 'tags')
        await conn.run_sync(Base.metadata.create_all)

        # ── Parches WidgetConfig (nuevas columnas) ────────────────────────────
        widget_col_patches = [
            ("secondary_color",   "VARCHAR DEFAULT '#064E3B'"),
            ("background_color",  "VARCHAR DEFAULT '#0B1120'"),
            ("surface_color",     "VARCHAR DEFAULT '#111827'"),
            ("surface2_color",    "VARCHAR DEFAULT '#1E293B'"),
            ("user_bubble_color", "VARCHAR DEFAULT '#10B981'"),
            ("bot_bubble_color",  "VARCHAR DEFAULT '#1E293B'"),
            ("text_color",        "VARCHAR DEFAULT '#E2E8F0'"),
            ("border_color",      "VARCHAR DEFAULT '#1E293B'"),
            ("subtitle",          "VARCHAR DEFAULT 'Asistente Virtual · Gamma Ingenieros'"),
            ("bot_icon_type",     "VARCHAR DEFAULT 'avatar'"),
            ("theme",             "VARCHAR DEFAULT 'dark'"),
            ("max_interactions",  "INTEGER DEFAULT 10"),
            ("chat_width",        "INTEGER DEFAULT 370"),
            ("chat_height",       "INTEGER DEFAULT 560"),
        ]
        for col, type_def in widget_col_patches:
            try:
                await conn.execute(text(
                    f"ALTER TABLE widget_config ADD COLUMN IF NOT EXISTS {col} {type_def}"
                ))
            except Exception:
                pass

        # ── Parches InteractionLog / WidgetSession ────────────────────────────
        try:
            await conn.execute(text(
                "ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_interaction_logs_session_id ON interaction_logs (session_id)"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE widget_sessions ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ"
            ))
        except Exception:
            pass

        # ── Sembrar configuración inicial del widget si no existe ─────────────
        from app.db.models import WidgetConfig, AdminUser
        from app.core.auth import hash_password
        from sqlalchemy.ext.asyncio import AsyncSession
        async with AsyncSession(engine) as session:
            result = await session.execute(text("SELECT id FROM widget_config WHERE id=1"))
            if not result.scalar():
                session.add(WidgetConfig(id=1))
                await session.commit()

        # ── Sembrar admin por defecto si no existe ninguno ────────────────────
        async with AsyncSession(engine) as session:
            result = await session.execute(text("SELECT id FROM admin_users LIMIT 1"))
            if not result.scalar():
                default_admin = AdminUser(
                    email=settings.ADMIN_DEFAULT_EMAIL,
                    full_name="Administrador Principal",
                    hashed_password=hash_password(settings.ADMIN_DEFAULT_PASSWORD),
                    role="superadmin",
                    created_by="system",
                )
                session.add(default_admin)
                await session.commit()
                print(f"[GammIA] Admin por defecto creado: {settings.ADMIN_DEFAULT_EMAIL}")

        # Índice HNSW para búsqueda vectorial eficiente a escala
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_document_nodes_embedding_hnsw
                ON document_nodes
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
            """))
        except Exception as e:
            print(f"Info HNSW index: {e}")

        # Columna tsvector + índice GIN para búsqueda léxica (Hybrid Search)
        try:
            await conn.execute(text(
                "ALTER TABLE document_nodes ADD COLUMN IF NOT EXISTS content_tsv tsvector"
            ))
        except Exception:
            pass
        try:
            # Poblar tsvector en filas existentes
            await conn.execute(text(
                "UPDATE document_nodes SET content_tsv = to_tsvector('spanish', coalesce(content,'')) WHERE content_tsv IS NULL"
            ))
            # Índice GIN sobre el tsvector
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_document_nodes_content_gin ON document_nodes USING gin(content_tsv)"
            ))
        except Exception as e:
            print(f"Info GIN index: {e}")


    yield
    await engine.dispose()

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
