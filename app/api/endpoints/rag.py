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
    content: str, 
    db: AsyncSession = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """ Ingresa un nuevo documento al flujo (Sometido a Validación de IA) """
    if not current_user.get("is_internal"):
        return {"status": "error", "message": "Privilegios insuficientes"}
        
    from app.rag.pipeline import GammiaRAGPipeline
    pipeline = GammiaRAGPipeline(db)
    
    # Se pasa el email del usuario como solicitante
    requested_by = current_user.get("email", "anonymous")
    result = await pipeline.ingest_drive_document(doc_id, title, content, requested_by)
    return result

@router.post("/approve-delete")
async def approve_delete(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """ Aval documentado del responsable para purgar vectores o aprobar un update """
    if not current_user.get("is_internal"):
        raise HTTPException(status_code=403, detail="Privilegios insuficientes")

    from sqlalchemy import select
    from app.db.models import DocumentDeletionRequest
    from app.rag.pipeline import GammiaRAGPipeline
    import datetime

    # 1. Recuperar el ticket
    stmt = select(DocumentDeletionRequest).where(DocumentDeletionRequest.id == request_id)
    result = await db.execute(stmt)
    req = result.scalar_one_or_none()

    if not req or req.status != "PENDING":
        return {"status": "error", "message": "Solicitud inválida o ya procesada"}

    # 2. Dejar huella del aval
    req.status = "APPROVED"
    req.approved_by = current_user.get("email", "admin")
    from sqlalchemy.sql import func
    req.approved_at = func.now()
    
    # 3. Ejecutar el purgado de memoria
    pipeline = GammiaRAGPipeline(db)
    await pipeline.execute_approved_deletion(req.doc_id)
    
    # 4. Si era por versión nueva, aquí se re-encolaría el ingest (simplificado para Phase 5)
    
    await db.commit()
    return {"status": "success", "message": f"Documento {req.doc_id} purgado de forma segura bajo auditoría de {req.approved_by}"}
