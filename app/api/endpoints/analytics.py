import csv
import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import InteractionLog

router = APIRouter()

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
        
        # Escribir cabeceras
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
