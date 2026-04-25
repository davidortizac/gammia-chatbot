"""
app/api/endpoints/widget.py
----------------------------
Endpoint público para el chatbot embeddable de GammIA.
Diseñado para ser consumido por el widget JS desde sitios externos.

Contextos:
  - 'public'   → RAG solo con documentos tagueados como 'public'
  - 'internal' → RAG completo (requiere widget_secret válido)
"""
from fastapi import APIRouter, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import time
import hashlib

from app.core.config import settings
from app.core.security import enforce_guardrails

router = APIRouter()

# Contextos válidos y sus niveles de acceso
CONTEXT_MAP = {
    "public":   {"is_internal": False, "label": "Sitio Corporativo"},
    "internal": {"is_internal": True,  "label": "Intranet Google Sites"},
    "intranet": {"is_internal": True,  "label": "Intranet"},
}

# Session ID simple basado en hash para tracking anónimo
def _session_id(request: Request) -> str:
    raw = f"{request.client.host}:{request.headers.get('user-agent','')}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


class WidgetChatRequest(BaseModel):
    message: str
    context: str = "public"           # 'public' | 'internal' | 'intranet'
    session_id: Optional[str] = None
    widget_secret: Optional[str] = None  # para contexto 'internal'
    lang: str = "es"                  # idioma preferido


class WidgetChatResponse(BaseModel):
    reply: str
    session_id: str
    context: str
    source: str
    latency_ms: int


@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(body: WidgetChatRequest, request: Request):
    """
    Endpoint de chat para el widget embeddable.
    No requiere autenticación JWT — usa contexto + widget_secret para acceso interno.
    """
    # Validar contexto
    ctx = CONTEXT_MAP.get(body.context, CONTEXT_MAP["public"])

    # Seguridad para contexto interno
    if ctx["is_internal"]:
        expected_secret = getattr(settings, "WIDGET_INTERNAL_SECRET", "")
        if not expected_secret or body.widget_secret != expected_secret:
            # Degradar a acceso público en lugar de error 401 (UX sin fricción)
            ctx = CONTEXT_MAP["public"]

    # Guardrails
    if not enforce_guardrails(body.message):
        return WidgetChatResponse(
            reply="Lo siento, esa consulta no puedo procesarla por políticas de seguridad corporativas.",
            session_id=body.session_id or _session_id(request),
            context=body.context,
            source="guardrail",
            latency_ms=0
        )

    session_id = body.session_id or _session_id(request)
    start = time.time()

    try:
        from google import genai
        from google.genai import types
        from app.agents.tools.gamma_tools import search_tool

        # Buscar contexto RAG
        rag_context = search_tool(body.message, is_internal=ctx["is_internal"], top_k=4)

        # Construir prompt adaptado al contexto
        if ctx["is_internal"]:
            system = (
                "Eres GammIA, asistente de IA de Gamma Ingenieros. "
                "Tienes acceso completo a la base de conocimiento interna de la empresa. "
                "Responde de forma concisa, profesional y con datos precisos. "
                "Cita la fuente cuando sea relevante. Responde siempre en español."
            )
        else:
            system = (
                "Eres GammIA, asistente virtual de Gamma Ingenieros especializado en ciberseguridad. "
                "Ayuda a los visitantes con información sobre nuestros servicios y soluciones. "
                "Sé amigable, profesional y conciso. No reveles información confidencial. "
                "Si no tienes información específica, ofrece contactar con el equipo. "
                "Responde siempre en español."
            )

        prompt = f"""Contexto de la base de conocimiento:
{rag_context}

Pregunta del usuario: {body.message}

Responde de forma útil y concisa basándote en el contexto proporcionado."""

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model=settings.MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0.1,
                max_output_tokens=512,
            )
        )
        reply = response.text

    except Exception as e:
        print(f"Widget chat error: {e}")
        reply = (
            "En este momento no puedo procesar tu consulta. "
            "Por favor escríbenos a gammia@gammaingenieros.com o intenta nuevamente."
        )

    latency_ms = int((time.time() - start) * 1000)

    return WidgetChatResponse(
        reply=reply,
        session_id=session_id,
        context=body.context,
        source=f"rag_{body.context}",
        latency_ms=latency_ms
    )


@router.get("/config")
async def widget_config():
    """Retorna la configuración pública del widget (sin secretos)."""
    return {
        "bot_name": "GammIA",
        "company": "Gamma Ingenieros",
        "tagline": "Tu asistente de ciberseguridad",
        "contact_email": "gammia@gammaingenieros.com",
        "contexts": list(CONTEXT_MAP.keys()),
        "version": settings.VERSION,
    }
