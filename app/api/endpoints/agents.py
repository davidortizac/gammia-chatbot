"""
app/api/endpoints/agents.py
----------------------------
CRUD de agentes del framework multi-agente GammIA Platform.

Rutas (todas requieren admin JWT):
  GET    /api/v1/agents              → listar todos los agentes
  POST   /api/v1/agents              → crear agente
  GET    /api/v1/agents/{id}         → obtener agente por id/slug
  PUT    /api/v1/agents/{id}         → actualizar agente
  DELETE /api/v1/agents/{id}         → eliminar agente
  POST   /api/v1/agents/{id}/avatar  → subir avatar PNG del agente
  GET    /api/v1/agents/{id}/stats   → estadísticas de uso del agente
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func
import time
import os
import shutil

from app.core.auth import get_current_admin, get_db
from app.db.models import AgentConfig, InteractionLog

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    id: str                              # slug único, p.ej. "iris-rrhh"
    name: str
    area: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    greeting: Optional[str] = None
    avatar_url: Optional[str] = None
    rag_tags: Optional[List[str]] = None
    is_internal_only: bool = True
    model_id: Optional[str] = None
    llm_temperature: Optional[float] = None
    llm_top_p: Optional[float] = None
    llm_top_k: Optional[int] = None
    rag_top_k: Optional[int] = None
    max_interactions: Optional[int] = None
    is_active: bool = True


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    area: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    greeting: Optional[str] = None
    avatar_url: Optional[str] = None
    rag_tags: Optional[List[str]] = None
    is_internal_only: Optional[bool] = None
    model_id: Optional[str] = None
    llm_temperature: Optional[float] = None
    llm_top_p: Optional[float] = None
    llm_top_k: Optional[int] = None
    rag_top_k: Optional[int] = None
    max_interactions: Optional[int] = None
    is_active: Optional[bool] = None


def _agent_to_dict(a: AgentConfig) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "area": a.area,
        "description": a.description,
        "system_prompt": a.system_prompt,
        "greeting": a.greeting,
        "avatar_url": a.avatar_url,
        "rag_tags": a.rag_tags or [],
        "is_internal_only": a.is_internal_only,
        "model_id": a.model_id,
        "llm_temperature": a.llm_temperature,
        "llm_top_p": a.llm_top_p,
        "llm_top_k": a.llm_top_k,
        "rag_top_k": a.rag_top_k,
        "max_interactions": a.max_interactions,
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(get_current_admin)])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AgentConfig).order_by(AgentConfig.created_at))
    agents = result.scalars().all()
    return {"agents": [_agent_to_dict(a) for a in agents]}


@router.post("", dependencies=[Depends(get_current_admin)])
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.get(AgentConfig, body.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe un agente con id '{body.id}'")
    agent = AgentConfig(**body.dict())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"ok": True, "agent": _agent_to_dict(agent)}


@router.get("/{agent_id}", dependencies=[Depends(get_current_admin)])
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return _agent_to_dict(agent)


@router.put("/{agent_id}", dependencies=[Depends(get_current_admin)])
async def update_agent(agent_id: str, body: AgentUpdate, db: AsyncSession = Depends(get_db)):
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    for field, value in body.dict(exclude_none=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return {"ok": True, "agent": _agent_to_dict(agent)}


@router.delete("/{agent_id}", dependencies=[Depends(get_current_admin)])
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    if agent_id in ("gammia", "iris"):
        raise HTTPException(status_code=400, detail="Los agentes del sistema no se pueden eliminar.")
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    await db.delete(agent)
    await db.commit()
    return {"ok": True}


@router.post("/{agent_id}/avatar", dependencies=[Depends(get_current_admin)])
async def upload_agent_avatar(
    agent_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.lower().endswith(".png"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PNG.")
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../static"))
    os.makedirs(static_dir, exist_ok=True)

    filename = f"avatar-{agent_id}-{int(time.time())}.png"
    file_path = os.path.join(static_dir, filename)
    with open(file_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    agent.avatar_url = f"/static/{filename}"
    await db.commit()
    await db.refresh(agent)
    return {"ok": True, "avatar_url": agent.avatar_url}


@router.get("/{agent_id}/stats", dependencies=[Depends(get_current_admin)])
async def agent_stats(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Estadísticas de uso del agente: interacciones, tokens, latencia promedio."""
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    from sqlalchemy import Integer as SAInt
    result = await db.execute(
        select(
            sql_func.count(InteractionLog.id).label("total_interactions"),
            sql_func.coalesce(sql_func.sum(InteractionLog.tokens_in), 0).label("total_tokens_in"),
            sql_func.coalesce(sql_func.sum(InteractionLog.tokens_out), 0).label("total_tokens_out"),
            sql_func.coalesce(sql_func.avg(InteractionLog.latency_ms), 0).label("avg_latency_ms"),
        ).where(InteractionLog.agent_id == agent_id)
    )
    row = result.one()
    return {
        "agent_id": agent_id,
        "total_interactions": row.total_interactions,
        "total_tokens_in": int(row.total_tokens_in),
        "total_tokens_out": int(row.total_tokens_out),
        "avg_latency_ms": round(float(row.avg_latency_ms), 1),
    }
