from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import time
from typing import Dict, Any

from app.db.database import get_db
from app.db.models import InteractionLog
from app.core.security import get_current_user, enforce_guardrails
from app.agents.gammia_agent import execute_gammia_agent

router = APIRouter()

@router.post("/chat")
async def chat(
    query: str,
    db: AsyncSession = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Guardrails para prevenir filtraciones y ataques
    if not enforce_guardrails(query):
        raise HTTPException(status_code=400, detail="Query bloqueado por reglas de seguridad corporativas.")

    # Obtener configuración de la DB para usar el modelo y parámetros seleccionados
    from app.api.endpoints.widget import _get_config
    cfg = await _get_config(db)

    start_time = time.time()
    
    # Aquí llamamos a nuestro agente con la config dinámica
    response_text, metadata = await execute_gammia_agent(
        query, 
        current_user.get("is_internal", False),
        model_id=cfg.model_id,
        temperature=cfg.llm_temperature,
        top_p=cfg.llm_top_p,
        top_k=cfg.llm_top_k
    )

    latency = int((time.time() - start_time) * 1000)

    # Registrar la analítica comercial/seguridad
    log_entry = InteractionLog(
        user_id=current_user.get("email", "anonymous"),
        tokens_in=metadata.get("tokens_in"),
        tokens_out=metadata.get("tokens_out"),
        latency_ms=latency,
        source_used=metadata.get("source_used"),
        user_query=query,
        assistant_response=response_text
    )
    db.add(log_entry)
    await db.commit()

    return {"response": response_text, "source": metadata.get("source_used")}
