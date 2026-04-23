import csv
import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.db.models import InteractionLog, DocumentNode

router = APIRouter()

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """
    Retorna métricas reales de uso para el Dashboard de Admin.
    """
    # Total de vectores activos
    doc_count_result = await db.execute(select(func.count(DocumentNode.id)).where(DocumentNode.active == 1))
    total_vectors = doc_count_result.scalar() or 0

    # Total de interacciones
    log_count_result = await db.execute(select(func.count(InteractionLog.id)))
    total_interactions = log_count_result.scalar() or 0

    # Tokens totales consumidos
    tokens_result = await db.execute(select(func.sum(InteractionLog.tokens_in + InteractionLog.tokens_out)))
    total_tokens = tokens_result.scalar() or 0

    # Latencia promedio
    latency_result = await db.execute(select(func.avg(InteractionLog.latency_ms)))
    avg_latency = round(latency_result.scalar() or 0, 0)

    return {
        "total_vectors": total_vectors,
        "total_interactions": total_interactions,
        "total_tokens": total_tokens,
        "avg_latency_ms": avg_latency,
    }

@router.get("/export")
async def export_analytics(format: str = "csv", db: AsyncSession = Depends(get_db)):
    """
    Exporta logs de trazabilidad.
    """
    query = select(InteractionLog)
    result = await db.execute(query)
    logs = result.scalars().all()

    if format == "csv":
        stream = io.StringIO()
        csv_writer = csv.writer(stream)
        headers = ["id", "timestamp", "user_id", "tokens_in", "tokens_out", "latency_ms", "source_used", "sentiment_score"]
        csv_writer.writerow(headers)
        for log in logs:
            csv_writer.writerow([
                log.id, log.timestamp, log.user_id, log.tokens_in, 
                log.tokens_out, log.latency_ms, log.source_used, log.sentiment_score
            ])
        stream.seek(0)
        return StreamingResponse(
            iter([stream.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=gammia_analytics.csv"}
        )

    return {"logs": [
        {
            "user_id": log.user_id,
            "latency": log.latency_ms,
            "source_used": log.source_used
        } for log in logs
    ]}

