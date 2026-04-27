"""
app/api/endpoints/widget.py
----------------------------
Endpoint público para el chatbot embeddable de GammIA.

Rutas:
  GET  /api/v1/widget/config           → configuración pública del widget (colores, fuentes, etc.)
  POST /api/v1/widget/chat             → chat con límite de 10 interacciones por sesión
  GET  /api/v1/widget/admin/config     → configuración completa (admin)
  PUT  /api/v1/widget/admin/config     → actualizar configuración (admin)
  GET  /api/v1/widget/admin/sessions   → listar sesiones con historial de mensajes (admin)
"""
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import time
import hashlib
import os
import shutil
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.core.security import enforce_guardrails
from app.core.auth import get_current_admin, get_db
from app.db.database import engine
from app.db.models import WidgetConfig, WidgetSession, InteractionLog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

router = APIRouter()

CONTEXT_MAP = {
    "public":   {"is_internal": False, "label": "Sitio Corporativo"},
    "internal": {"is_internal": True,  "label": "Intranet Google Sites"},
    "intranet": {"is_internal": True,  "label": "Intranet"},
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _session_id(request: Request) -> str:
    raw = f"{request.client.host}:{request.headers.get('user-agent', '')}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


async def _get_config(db: AsyncSession) -> WidgetConfig:
    result = await db.execute(select(WidgetConfig).where(WidgetConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = WidgetConfig(id=1)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


def _config_to_dict(cfg: WidgetConfig) -> dict:
    return {
        "id": cfg.id,
        "primary_color":    cfg.primary_color,
        "secondary_color":  cfg.secondary_color,
        "background_color": cfg.background_color,
        "surface_color":    cfg.surface_color,
        "surface2_color":   cfg.surface2_color,
        "user_bubble_color": cfg.user_bubble_color,
        "bot_bubble_color": cfg.bot_bubble_color,
        "text_color":       cfg.text_color,
        "border_color":     cfg.border_color,
        "font_family":      cfg.font_family,
        "font_size":        cfg.font_size,
        "title":            cfg.title,
        "subtitle":         cfg.subtitle,
        "greeting_public":  cfg.greeting_public,
        "greeting_internal": cfg.greeting_internal,
        "avatar_url":       cfg.avatar_url,
        "bot_icon_type":    cfg.bot_icon_type,
        "theme":            cfg.theme,
        "max_interactions": cfg.max_interactions,
        "chat_width":       cfg.chat_width,
        "chat_height":      cfg.chat_height,
    }


# ── Schemas ────────────────────────────────────────────────────────────────────

class WidgetChatRequest(BaseModel):
    message: str
    context: str = "public"
    session_id: Optional[str] = None
    widget_secret: Optional[str] = None
    lang: str = "es"


class WidgetChatResponse(BaseModel):
    reply: str
    session_id: str
    context: str
    source: str
    latency_ms: int
    interaction_count: int
    max_interactions: int
    limit_reached: bool = False


class WidgetConfigUpdate(BaseModel):
    primary_color:    Optional[str] = None
    secondary_color:  Optional[str] = None
    background_color: Optional[str] = None
    surface_color:    Optional[str] = None
    surface2_color:   Optional[str] = None
    user_bubble_color: Optional[str] = None
    bot_bubble_color: Optional[str] = None
    text_color:       Optional[str] = None
    border_color:     Optional[str] = None
    font_family:      Optional[str] = None
    font_size:        Optional[str] = None
    title:            Optional[str] = None
    subtitle:         Optional[str] = None
    greeting_public:  Optional[str] = None
    greeting_internal: Optional[str] = None
    avatar_url:       Optional[str] = None
    bot_icon_type:    Optional[str] = None
    theme:            Optional[str] = None
    max_interactions: Optional[int] = None
    chat_width:       Optional[int] = None
    chat_height:      Optional[int] = None


# ── Endpoints públicos ─────────────────────────────────────────────────────────

@router.get("/config")
async def widget_config_public(db: AsyncSession = Depends(get_db)):
    """Retorna la configuración del widget (colores, fuentes, textos) para el JS embeddable."""
    cfg = await _get_config(db)
    return _config_to_dict(cfg)


@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(
    body: WidgetChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Chat con sesión persistida. Máximo max_interactions por sesión (default 10)."""
    ctx = CONTEXT_MAP.get(body.context, CONTEXT_MAP["public"])

    if ctx["is_internal"]:
        expected_secret = getattr(settings, "WIDGET_INTERNAL_SECRET", "")
        if not expected_secret or body.widget_secret != expected_secret:
            ctx = CONTEXT_MAP["public"]

    session_id = body.session_id or _session_id(request)

    if not enforce_guardrails(body.message):
        return WidgetChatResponse(
            reply="Lo siento, esa consulta no puedo procesarla por políticas de seguridad corporativas.",
            session_id=session_id,
            context=body.context,
            source="guardrail",
            latency_ms=0,
            interaction_count=0,
            max_interactions=10,
        )

    cfg = await _get_config(db)
    max_interactions = cfg.max_interactions or 10

    # Obtener o crear sesión
    sess_result = await db.execute(
        select(WidgetSession).where(WidgetSession.id == session_id)
    )
    sess = sess_result.scalar_one_or_none()
    if not sess:
        sess = WidgetSession(id=session_id, context=body.context, interaction_count=0)
        db.add(sess)
        await db.flush()

    current_count = sess.interaction_count or 0

    # Verificar límite
    if current_count >= max_interactions:
        return WidgetChatResponse(
            reply=(
                f"Has alcanzado el límite de {max_interactions} interacciones en esta sesión. "
                "Para continuar, recarga la página o escríbenos a gammia@gammaingenieros.com"
            ),
            session_id=session_id,
            context=body.context,
            source="limit",
            latency_ms=0,
            interaction_count=current_count,
            max_interactions=max_interactions,
            limit_reached=True,
        )

    start = time.time()
    reply = ""

    try:
        from google import genai
        from google.genai import types
        from app.agents.tools.gamma_tools import search_tool

        rag_context = search_tool(body.message, is_internal=ctx["is_internal"], top_k=4)

        if ctx["is_internal"]:
            system = (
                "Eres GammIA, asistente de IA de Gamma Ingenieros. "
                "Tienes acceso completo a la base de conocimiento interna de la empresa. "
                "Responde de forma concisa y profesional usando formato markdown cuando ayude "
                "(listas, negritas, encabezados). Cita la fuente cuando sea relevante. "
                "Responde siempre en español."
            )
        else:
            system = (
                "Eres GammIA, asistente virtual de Gamma Ingenieros especializado en ciberseguridad. "
                "Ayuda a los visitantes con información sobre nuestros servicios y soluciones. "
                "Sé amigable, profesional y conciso. Usa formato markdown cuando ayude a la claridad. "
                "No reveles información confidencial. "
                "Si no tienes información específica, ofrece contactar con el equipo. "
                "Responde siempre en español."
            )

        prompt = (
            f"Contexto de la base de conocimiento:\n{rag_context}\n\n"
            f"Pregunta del usuario: {body.message}\n\n"
            "Responde de forma útil y concisa basándote en el contexto proporcionado."
        )

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model=settings.MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0.1,
                max_output_tokens=512,
            ),
        )
        reply = response.text

    except Exception as e:
        print(f"Widget chat error: {e}")
        reply = (
            "En este momento no puedo procesar tu consulta. "
            "Por favor escríbenos a gammia@gammaingenieros.com o intenta nuevamente."
        )

    latency_ms = int((time.time() - start) * 1000)
    new_count = current_count + 1

    # Persistir sesión e interacción
    sess.interaction_count = new_count
    sess.last_interaction_at = datetime.now(timezone.utc)

    log = InteractionLog(
        user_id=session_id,
        session_id=session_id,
        tokens_in=len(body.message.split()),
        tokens_out=len(reply.split()),
        latency_ms=latency_ms,
        source_used=f"rag_{body.context}",
        user_query=body.message,
        assistant_response=reply,
    )
    db.add(log)
    await db.commit()

    return WidgetChatResponse(
        reply=reply,
        session_id=session_id,
        context=body.context,
        source=f"rag_{body.context}",
        latency_ms=latency_ms,
        interaction_count=new_count,
        max_interactions=max_interactions,
        limit_reached=(new_count >= max_interactions),
    )


# ── Endpoints admin ────────────────────────────────────────────────────────────

@router.get("/admin/config", dependencies=[Depends(get_current_admin)])
async def get_admin_config(db: AsyncSession = Depends(get_db)):
    """Retorna la configuración completa del widget."""
    cfg = await _get_config(db)
    return _config_to_dict(cfg)


@router.put("/admin/config", dependencies=[Depends(get_current_admin)])
async def update_admin_config(
    body: WidgetConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Actualiza la configuración del widget desde el panel admin."""
    cfg = await _get_config(db)
    for field, value in body.dict(exclude_none=True).items():
        setattr(cfg, field, value)
    await db.commit()
    await db.refresh(cfg)
    return {"ok": True, "config": _config_to_dict(cfg)}


@router.get("/admin/sessions", dependencies=[Depends(get_current_admin)])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """Lista las últimas 100 sesiones del widget con su historial de mensajes."""
    result = await db.execute(
        select(WidgetSession)
        .order_by(WidgetSession.created_at.desc())
        .limit(100)
    )
    sessions = result.scalars().all()

    sessions_data = []
    for s in sessions:
        msgs_result = await db.execute(
            select(InteractionLog)
            .where(InteractionLog.session_id == s.id)
            .order_by(InteractionLog.timestamp.asc())
        )
        msgs = msgs_result.scalars().all()
        sessions_data.append({
            "id": s.id,
            "context": s.context,
            "interaction_count": s.interaction_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_interaction_at": s.last_interaction_at.isoformat() if s.last_interaction_at else None,
            "messages": [
                {
                    "id": m.id,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                    "user_query": m.user_query,
                    "assistant_response": m.assistant_response,
                    "latency_ms": m.latency_ms,
                }
                for m in msgs
            ],
        })

    return {"sessions": sessions_data, "total": len(sessions_data)}


@router.post("/admin/avatar", dependencies=[Depends(get_current_admin)])
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Sube un archivo .png para el avatar del widget y actualiza la configuración."""
    if not file.filename.lower().endswith(".png"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PNG.")
    
    static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../static"))
    os.makedirs(static_dir, exist_ok=True)
    
    filename = f"avatar-{int(time.time())}.png"
    file_path = os.path.join(static_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    cfg = await _get_config(db)
    cfg.avatar_url = f"/static/{filename}"
    await db.commit()
    await db.refresh(cfg)
    
    return {"ok": True, "avatar_url": cfg.avatar_url}
