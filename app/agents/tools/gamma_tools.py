"""
app/agents/tools/gamma_tools.py
--------------------------------
Hybrid Search RAG con Reciprocal Rank Fusion (RRF).

Arquitectura:
  1. Búsqueda semántica  → pgvector HNSW (cosine distance)
  2. Búsqueda léxica     → PostgreSQL GIN + tsvector (full-text)
  3. Fusión RRF          → combina rankings para máxima precisión
  4. RBAC               → filtra por tags según nivel de acceso

RRF score = Σ  1 / (k + rank_i)   donde k=60 (constante estándar)
"""
from typing import List, Dict
from app.core.config import settings

# ── Engine síncrono (tools son funciones síncronas en Function Calling) ───────
_sync_engine = None

def _get_engine():
    global _sync_engine
    if _sync_engine is None:
        sync_url = settings.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://"
        )
        try:
            from sqlalchemy import create_engine
            _sync_engine = create_engine(
                sync_url, pool_pre_ping=True, pool_size=3, max_overflow=2
            )
        except Exception as e:
            print(f"Warning: no se pudo crear sync engine: {e}")
    return _sync_engine


def _embed(text: str) -> List[float]:
    """Genera embedding semántico con gemini-embedding-001."""
    try:
        from google import genai
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        resp = client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=[text]
        )
        return resp.embeddings[0].values
    except Exception as e:
        print(f"Warning: embedding fallido: {e}")
        return [0.0] * 3072


def _rrf_score(rank: int, k: int = 60) -> float:
    return 1.0 / (k + rank)


def _hybrid_search(
    query: str,
    is_internal: bool,
    top_k: int = 15,
    candidate_k: int = 60,
) -> List[Dict]:
    """
    Hybrid Search con RRF.
    
    Parámetros:
        query       : pregunta del usuario
        is_internal : True = acceso total, False = solo tags 'public'
        top_k       : número final de chunks a retornar
        candidate_k : candidatos por cada rama (semántica + léxica)
    """
    engine = _get_engine()
    if not engine:
        return []

    # RBAC tag filter
    tag_filter = "" if is_internal else "AND 'public' = ANY(tags)"

    # ── 1. Búsqueda semántica (HNSW cosine) ───────────────────────────────
    semantic_results = {}
    try:
        vec = _embed(query)
        vec_str = "[" + ",".join(str(v) for v in vec) + "]"

        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT id, title, content, tags,
                       (embedding <=> '{vec_str}'::vector) AS distance
                FROM document_nodes
                WHERE active = 1 {tag_filter}
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> '{vec_str}'::vector
                LIMIT :k
            """), {"k": candidate_k}).fetchall()

        for rank, row in enumerate(rows):
            semantic_results[row.id] = {
                "id": row.id, "title": row.title,
                "content": row.content, "tags": row.tags,
                "semantic_rank": rank + 1,
                "lexical_rank": None,
            }
    except Exception as e:
        print(f"Semantic search error: {e}")

    # ── 2. Búsqueda léxica (GIN full-text) ───────────────────────────────
    lexical_results = {}
    try:
        # Normalizar query para tsquery: unir palabras con &
        words = [w.strip() for w in query.split() if len(w.strip()) > 2]
        tsquery = " | ".join(words) if words else query

        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT id, title, content, tags,
                       ts_rank(content_tsv, plainto_tsquery('spanish', :q)) AS rank
                FROM document_nodes
                WHERE active = 1 {tag_filter}
                  AND content_tsv @@ plainto_tsquery('spanish', :q)
                ORDER BY rank DESC
                LIMIT :k
            """), {"q": query, "k": candidate_k}).fetchall()

        for rank, row in enumerate(rows):
            lexical_results[row.id] = {
                "id": row.id, "title": row.title,
                "content": row.content, "tags": row.tags,
                "semantic_rank": None,
                "lexical_rank": rank + 1,
            }
    except Exception as e:
        print(f"Lexical search error: {e}")

    # ── 3. Fusión RRF ─────────────────────────────────────────────────────
    all_ids = set(semantic_results.keys()) | set(lexical_results.keys())
    fused = []

    for doc_id in all_ids:
        sem = semantic_results.get(doc_id)
        lex = lexical_results.get(doc_id)

        # Tomar metadata del que exista
        meta = sem or lex

        sem_score = _rrf_score(sem["semantic_rank"]) if sem and sem["semantic_rank"] else 0.0
        lex_score = _rrf_score(lex["lexical_rank"])  if lex and lex["lexical_rank"]  else 0.0
        rrf = sem_score + lex_score

        fused.append({
            "id": meta["id"],
            "title": meta["title"],
            "content": meta["content"],
            "tags": meta["tags"],
            "rrf_score": round(rrf, 6),
            "source": (
                "hybrid"   if sem and lex else
                "semantic" if sem        else "lexical"
            ),
        })

    # Ordenar por RRF descendente y devolver top_k
    fused.sort(key=lambda x: x["rrf_score"], reverse=True)
    return fused[:top_k]


# ── Herramientas de Function Calling ─────────────────────────────────────────

def search_tool(query: str, is_internal: bool = False, top_k: int = 5) -> str:
    """
    Busca en la base de datos vectorial interna de Gamma Ingenieros usando Hybrid Search
    (búsqueda semántica + léxica con fusión RRF). Retorna los fragmentos más relevantes
    del conocimiento corporativo: políticas, portafolio, servicios, procedimientos y clientes.
    Usar siempre que necesites información específica de Gamma Ingenieros.
    """
    chunks = _hybrid_search(query, is_internal=is_internal, top_k=top_k)

    if not chunks:
        scope = "intranet" if is_internal else "base pública"
        return f"[RAG] No se encontraron documentos relevantes en la {scope} para: '{query}'"

    parts = []
    for i, c in enumerate(chunks, 1):
        tags_str = ", ".join(c["tags"]) if c["tags"] else "—"
        source_badge = {"hybrid": "⊕", "semantic": "◈", "lexical": "◉"}.get(c["source"], "○")
        parts.append(
            f"[{i}] {source_badge} {c['title']} | tags: {tags_str} | RRF: {c['rrf_score']}\n"
            f"{c['content']}"
        )

    scope_label = "INTERNO" if is_internal else "PÚBLICO"
    return (
        f"=== CONTEXTO RAG HYBRID ({scope_label}) — {len(chunks)} fragmentos ===\n\n"
        + "\n\n---\n\n".join(parts)
        + "\n\n=== FIN CONTEXTO ==="
    )


def salesforce_connector(consulta_cliente: str) -> str:
    """
    Consulta el CRM de Salesforce para obtener estado de servicios o tickets de clientes.
    Usar cuando el usuario pregunte sobre un proyecto, contrato o cliente específico.
    """
    return f"[Salesforce CRM] Consultando: {consulta_cliente}. Integración pendiente de credenciales OAuth."


def workspace_integration(accion: str) -> str:
    """
    Interactúa con Google Workspace: envía correos, agenda citas o crea eventos.
    Usar solo cuando el usuario solicite explícitamente agendar, enviar correo o crear un evento.
    """
    return f"[Google Workspace] Acción registrada: {accion}. Integración pendiente de Service Account."
