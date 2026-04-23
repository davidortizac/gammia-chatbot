from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.db.database import get_db
from app.core.security import get_current_user

router = APIRouter()

@router.post("/sync-web")
async def sync_web(
    db: AsyncSession = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Endpoint para indexar el contenido de www.gammaingenieros.com hacia la base vectorial (pgvector)
    """
    # 1. Scrapear web
    # 2. Partir docs (chunking)
    # 3. Generar embeddings (Vertex AI text-embedding-004)
    # 4. Guardar en tabla DocumentNode
    return {"status": "success", "message": "Indexación web iniciada", "source": "web"}


@router.post("/sync-intranet")
async def sync_intranet(
    doc_id: str,
    title: str,
    content: str, # En producción esto vendría desde el webhook o descarga drive
    db: AsyncSession = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Endpoint protegido para indexar documentos de la Google Workspace Intranet.
    Diseñado para conectarse al webhook de Google Drive.
    """
    if not current_user.get("is_internal"):
        return {"status": "error", "message": "Privilegios insuficientes"}
        
    from app.rag.pipeline import GammiaRAGPipeline
    pipeline = GammiaRAGPipeline(db)
    
    result = await pipeline.ingest_drive_document(doc_id, title, content)
    return result
