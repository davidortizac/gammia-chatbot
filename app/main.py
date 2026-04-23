import uvicorn
from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.core.config import settings
from app.db.database import engine, Base
from app.api.endpoints import chat, rag, analytics

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
app.include_router(chat.router, prefix="/api/v1", tags=["Chat & Orchestration"])
app.include_router(rag.router, prefix="/api/v1/rag", tags=["Vector RAG Sync"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Commercial Analytics"])

@app.get("/")
async def root():
    return {"message": "Bienvenido a la API del orquestador GammIA - Gamma Ingenieros"}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
