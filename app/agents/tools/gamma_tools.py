"""
app/agents/tools/gamma_tools.py
--------------------------------
Herramientas reales de Function Calling para GammIA.
search_tool conecta directamente a pgvector para RAG semántico.
"""
import asyncio
from typing import List
from sqlalchemy import create_engine, text, select
from sqlalchemy.orm import Session

from app.core.config import settings

# Engine síncrono para usar dentro de tools síncronas de function calling
_sync_engine = None

def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        # Convertir URL asyncpg a psycopg2 para el engine síncrono de tools
        sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        try:
            from sqlalchemy import create_engine as ce
            _sync_engine = ce(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=0)
        except Exception as e:
            print(f"Warning: no se pudo crear sync engine: {e}")
            _sync_engine = None
    return _sync_engine


def _embed_query_sync(query_text: str) -> List[float]:
    """Genera embedding síncrono para la consulta del usuario."""
    try:
        from google import genai
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=[query_text]
        )
        return response.embeddings[0].values
    except Exception as e:
        print(f"Warning: embedding fallido en search_tool: {e}")
        return [0.0] * 3072


def search_tool(query: str, is_internal: bool = False, top_k: int = 5) -> str:
    """
    Busca en la base de datos vectorial (pgvector) los fragmentos más relevantes
    para responder la consulta. Filtra por tags según el nivel de acceso del usuario.
    Usar cuando necesites contexto interno de Gamma Ingenieros: políticas, servicios,
    portafolio, procedimientos, clientes o cualquier documento corporativo.
    """
    engine = _get_sync_engine()
    if not engine:
        return "[RAG no disponible — error de conexión a la BD]"

    try:
        query_embedding = _embed_query_sync(query)
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        # RBAC: usuarios internos ven todo, externos solo tags 'public'
        if is_internal:
            tag_filter = ""  # sin filtro de tags
        else:
            tag_filter = "AND 'public' = ANY(tags)"

        sql = text(f"""
            SELECT title, content, tags,
                   (embedding <=> '{embedding_str}'::vector) AS distance
            FROM document_nodes
            WHERE active = 1 {tag_filter}
            ORDER BY embedding <=> '{embedding_str}'::vector
            LIMIT :top_k
        """)

        with engine.connect() as conn:
            rows = conn.execute(sql, {"top_k": top_k}).fetchall()

        if not rows:
            scope = "intranet" if is_internal else "pública"
            return f"[No se encontraron documentos relevantes en la base {scope} para: '{query}']"

        # Construir contexto para el LLM
        context_parts = []
        for i, row in enumerate(rows, 1):
            tags_str = ", ".join(row.tags) if row.tags else "sin tags"
            context_parts.append(
                f"[Fragmento {i} — {row.title} | tags: {tags_str}]\n{row.content}"
            )

        context = "\n\n---\n\n".join(context_parts)
        scope = "INTERNO" if is_internal else "PÚBLICO"
        return f"=== CONTEXTO RAG ({scope}) ===\n\n{context}\n\n=== FIN CONTEXTO ==="

    except Exception as e:
        print(f"Error en search_tool: {e}")
        return f"[Error consultando la base vectorial: {str(e)[:200]}]"


def salesforce_connector(consulta_cliente: str) -> str:
    """
    Consulta el CRM de Salesforce para obtener el estado de servicios o tickets de clientes.
    Usar cuando el usuario pregunte sobre el estado de un proyecto, contrato o cliente específico.
    """
    # TODO: integrar con Salesforce API real
    return f"[Salesforce CRM] Consultando estado para: {consulta_cliente}. Integración pendiente de credenciales OAuth."


def workspace_integration(accion: str) -> str:
    """
    Interactúa con Google Workspace: envía correos, agenda citas o crea eventos en el calendario corporativo.
    Usar solo cuando el usuario solicite explícitamente agendar, enviar correo o crear un evento.
    """
    # TODO: integrar con Google Workspace API real
    return f"[Google Workspace] Acción registrada: {accion}. Integración pendiente de Service Account."
