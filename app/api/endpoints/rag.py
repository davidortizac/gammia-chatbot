"""
app/api/endpoints/rag.py
------------------------
Endpoints para gestión del RAG vectorial:
- Upload de archivos reales (PDF, DOCX, XLSX, PPTX, web URL)
- Sincronización de carpeta de Google Drive (Service Account)
- CRUD de Tags personalizados
- Listado de nodos vectorizados
"""
import json
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.database import get_db
from app.db.models import DocumentNode, Tag
from app.rag.pipeline import GammiaRAGPipeline
from app.rag.extractors import extract_text_from_file, SUPPORTED_EXTENSIONS, extract_from_url
from app.core.config import settings

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Tags CRUD
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_TAGS = [
    {"id": "public",          "label": "Public",         "color": "sky"},
    {"id": "internal",        "label": "Internal",       "color": "violet"},
    {"id": "portfolio",       "label": "Portfolio",      "color": "amber"},
    {"id": "solutions",       "label": "Solutions",      "color": "emerald"},
    {"id": "policies",        "label": "Policies",       "color": "rose"},
    {"id": "Project_manager", "label": "Project Manager","color": "orange"},
    {"id": "cx",              "label": "CX",             "color": "teal"},
    {"id": "cux",             "label": "CUX",            "color": "indigo"},
    {"id": "marketing",       "label": "Marketing",      "color": "pink"},
    {"id": "csoc",            "label": "CSOC",           "color": "red"},
    {"id": "services",        "label": "Services",       "color": "lime"},
    {"id": "general",         "label": "General",        "color": "slate"},
]

class TagCreate(BaseModel):
    id: str
    label: str
    color: str = "slate"

@router.get("/tags")
async def list_tags(db: AsyncSession = Depends(get_db)):
    """Lista todos los tags: los del sistema + los personalizados de la BD."""
    result = await db.execute(select(Tag))
    custom_tags = result.scalars().all()
    custom_ids = {t.id for t in custom_tags}
    # Combinar: system first, then custom (que no estén ya en system)
    all_tags = list(SYSTEM_TAGS)
    for t in custom_tags:
        if t.id not in {st["id"] for st in SYSTEM_TAGS}:
            all_tags.append({"id": t.id, "label": t.label, "color": t.color, "is_system": False})
    return {"tags": all_tags}

@router.post("/tags", status_code=201)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    """Crea un tag personalizado. Falla si ya existe."""
    tag_id = re.sub(r'[^a-z0-9_]', '_', body.id.lower())
    existing = await db.execute(select(Tag).where(Tag.id == tag_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"El tag '{tag_id}' ya existe.")
    # Verificar que tampoco sea un tag del sistema
    system_ids = {t["id"] for t in SYSTEM_TAGS}
    if tag_id in system_ids:
        raise HTTPException(status_code=409, detail="Este tag ya existe como tag del sistema.")
    new_tag = Tag(id=tag_id, label=body.label, color=body.color, is_system=False)
    db.add(new_tag)
    await db.commit()
    return {"status": "created", "tag": {"id": tag_id, "label": body.label, "color": body.color}}

@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, db: AsyncSession = Depends(get_db)):
    """Elimina un tag personalizado. Los tags del sistema son intocables."""
    system_ids = {t["id"] for t in SYSTEM_TAGS}
    if tag_id in system_ids:
        raise HTTPException(status_code=403, detail="Los tags del sistema no se pueden eliminar.")
    await db.execute(delete(Tag).where(Tag.id == tag_id))
    await db.commit()
    return {"status": "deleted", "tag_id": tag_id}


# ─────────────────────────────────────────────────────────────────────────────
# AI Tag Suggester
# ─────────────────────────────────────────────────────────────────────────────

async def _suggest_tags_with_ai(text_sample: str, available_tag_ids: list) -> list:
    """
    Usa Gemini para sugerir qué tags son apropiados para el documento.
    Retorna lista de IDs de tags sugeridos. El humano los aprueba en el frontend.
    """
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        tag_list = ", ".join(available_tag_ids)
        prompt = f"""Analiza el siguiente fragmento de documento corporativo y sugiere cuáles de estos tags de clasificación son más apropiados:
Tags disponibles: {tag_list}

Fragmento del documento (primeros 2000 caracteres):
{text_sample[:2000]}

Responde ÚNICAMENTE con un JSON válido: {{"suggested_tags": ["tag1", "tag2"], "reasoning": "breve explicación"}}
Solo incluye tags de la lista disponible."""
        response = client.models.generate_content(
            model=settings.MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        data = json.loads(response.text)
        return data.get("suggested_tags", [])
    except Exception as e:
        print(f"AI tag suggestion failed: {e}")
        return ["internal"]


# ─────────────────────────────────────────────────────────────────────────────
# Upload de Archivo Real
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    tags: str = Form("[]"),           # JSON array como string: '["internal","csoc"]'
    requested_by: str = Form("admin"),
    doc_id: Optional[str] = Form(None),
    suggest_tags: bool = Form(False), # Si True, la IA sugiere tags antes de guardar
    db: AsyncSession = Depends(get_db)
):
    """
    Recibe un archivo real (PDF, DOCX, XLSX, PPTX, TXT, MD),
    extrae el texto, opcionalmente sugiere tags con IA, y vectoriza.
    """
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    supported = list(SUPPORTED_EXTENSIONS.keys())
    if ext not in supported:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de archivo no soportado: .{ext}. Soportados: {', '.join(supported)}"
        )

    file_bytes = await file.read()
    if len(file_bytes) > 50 * 1024 * 1024:  # 50 MB limit
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máximo 50 MB).")

    # Extraer texto
    text = extract_text_from_file(file_bytes, filename)
    if not text:
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del archivo.")

    # Parsear tags enviados
    try:
        tag_list = json.loads(tags) if tags else []
    except Exception:
        tag_list = ["internal"]

    # Sugerir tags con IA si se solicita (modo sugerencia, no guarda aún)
    if suggest_tags:
        result_tags = await db.execute(select(Tag))
        db_tags = [t.id for t in result_tags.scalars().all()]
        all_tag_ids = list({t["id"] for t in SYSTEM_TAGS} | set(db_tags))
        suggested = await _suggest_tags_with_ai(text, all_tag_ids)
        return {
            "status": "suggestion",
            "suggested_tags": suggested,
            "filename": filename,
            "text_preview": text[:500],
            "char_count": len(text),
            "message": "Revisa y aprueba los tags sugeridos, luego vuelve a llamar con los tags confirmados."
        }

    # Si no se piden sugerencias, ingestar directamente
    final_doc_id = doc_id or f"upload_{filename.replace(' ', '_').lower()}_{hash(file_bytes) & 0xFFFF:04x}"
    pipeline = GammiaRAGPipeline(db)
    result = await pipeline.ingest_drive_document(
        doc_id=final_doc_id,
        title=filename,
        full_content=text,
        requested_by=requested_by,
        tags=tag_list if tag_list else ["internal"]
    )
    return {**result, "filename": filename, "char_count": len(text)}


# ─────────────────────────────────────────────────────────────────────────────
# URL (Web Page) Upload
# ─────────────────────────────────────────────────────────────────────────────

class UrlIngestRequest(BaseModel):
    url: str
    tags: List[str] = ["public"]
    requested_by: str = "admin"
    suggest_tags: bool = False

@router.post("/upload-url")
async def upload_url(body: UrlIngestRequest, db: AsyncSession = Depends(get_db)):
    """Extrae texto de una URL y lo vectoriza con los tags indicados."""
    try:
        text = extract_from_url(body.url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error al scrapear la URL: {e}")

    if body.suggest_tags:
        result_tags = await db.execute(select(Tag))
        db_tags = [t.id for t in result_tags.scalars().all()]
        all_tag_ids = list({t["id"] for t in SYSTEM_TAGS} | set(db_tags))
        suggested = await _suggest_tags_with_ai(text, all_tag_ids)
        return {
            "status": "suggestion",
            "suggested_tags": suggested,
            "url": body.url,
            "text_preview": text[:500],
            "char_count": len(text)
        }

    doc_id = f"web_{re.sub(r'[^a-z0-9]', '_', body.url.lower())[:60]}"
    pipeline = GammiaRAGPipeline(db)
    result = await pipeline.ingest_drive_document(
        doc_id=doc_id,
        title=body.url,
        full_content=text,
        requested_by=body.requested_by,
        tags=body.tags
    )
    return {**result, "url": body.url, "char_count": len(text)}


# ─────────────────────────────────────────────────────────────────────────────
# Google Drive Folder Sync (Service Account)
# ─────────────────────────────────────────────────────────────────────────────

class DriveSyncRequest(BaseModel):
    folder_id: str
    tags: List[str] = ["internal"]
    requested_by: str = "admin"

@router.post("/sync-drive-folder")
async def sync_drive_folder(body: DriveSyncRequest, db: AsyncSession = Depends(get_db)):
    """
    Sincroniza todos los archivos soportados de una carpeta de Google Drive.
    Usa Service Account — la carpeta debe compartirse con la cuenta de servicio.
    Deduplica automáticamente por hash MD5.
    """
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
        import io as _io

        # Cargar credenciales del Service Account
        sa_file = settings.GOOGLE_SERVICE_ACCOUNT_FILE
        creds = service_account.Credentials.from_service_account_file(
            sa_file, scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        drive_service = build("drive", "v3", credentials=creds)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al conectar con Google Drive: {e}")

    # Listar archivos en la carpeta
    supported_mimes = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "text/plain": "txt",
        "text/markdown": "md",
    }
    
    query = f"'{body.folder_id}' in parents and trashed=false"
    files_resp = drive_service.files().list(
        q=query,
        fields="files(id, name, mimeType, md5Checksum, modifiedTime)",
        pageSize=100
    ).execute()
    files = files_resp.get("files", [])

    results = []
    pipeline = GammiaRAGPipeline(db)

    for f in files:
        mime = f.get("mimeType", "")
        ext = supported_mimes.get(mime)
        fname = f.get("name", "unknown")
        fid = f["id"]

        if not ext:
            results.append({"file": fname, "status": "skipped", "reason": "Tipo no soportado"})
            continue

        # Descargar archivo
        try:
            request = drive_service.files().get_media(fileId=fid)
            buf = _io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            file_bytes = buf.getvalue()
        except Exception as e:
            results.append({"file": fname, "status": "error", "reason": str(e)})
            continue

        # Extraer texto
        text = extract_text_from_file(file_bytes, fname)
        if not text:
            results.append({"file": fname, "status": "skipped", "reason": "Sin texto extraíble"})
            continue

        # Ingestar con deduplicación por hash (pipeline lo maneja)
        result = await pipeline.ingest_drive_document(
            doc_id=f"drive_{fid}",
            title=fname,
            full_content=text,
            requested_by=body.requested_by,
            tags=body.tags
        )
        results.append({"file": fname, "drive_id": fid, **result})

    synced = sum(1 for r in results if r.get("status") == "success")
    skipped = sum(1 for r in results if r.get("status") in ("skipped", "skipped"))
    return {
        "folder_id": body.folder_id,
        "total_files": len(files),
        "synced": synced,
        "skipped": skipped,
        "results": results
    }


# ─────────────────────────────────────────────────────────────────────────────
# Google Drive — Sync de archivo individual
# ─────────────────────────────────────────────────────────────────────────────

class DriveFileSyncRequest(BaseModel):
    file_id: str
    tags: List[str] = ["internal"]
    requested_by: str = "admin"


@router.post("/sync-drive-file")
async def sync_drive_file(body: DriveFileSyncRequest, db: AsyncSession = Depends(get_db)):
    """
    Sincroniza un archivo individual de Google Drive dado su File ID.
    Usa Service Account — el archivo debe compartirse con la cuenta de servicio.
    """
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
        import io as _io

        sa_file = settings.GOOGLE_SERVICE_ACCOUNT_FILE
        creds = service_account.Credentials.from_service_account_file(
            sa_file, scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        drive_service = build("drive", "v3", credentials=creds)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al conectar con Google Drive: {e}")

    supported_mimes = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "text/plain": "txt",
        "text/markdown": "md",
    }

    # Obtener metadatos del archivo
    try:
        file_meta = drive_service.files().get(
            fileId=body.file_id,
            fields="id, name, mimeType, md5Checksum"
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Archivo no encontrado en Drive: {e}")

    mime = file_meta.get("mimeType", "")
    ext = supported_mimes.get(mime)
    fname = file_meta.get("name", "unknown")
    fid = file_meta["id"]

    if not ext:
        raise HTTPException(
            status_code=422,
            detail=f"Tipo de archivo no soportado: {mime}. Soportados: PDF, DOCX, XLSX, PPTX, TXT, MD"
        )

    # Descargar archivo
    try:
        from googleapiclient.http import MediaIoBaseDownload
        import io as _io
        request = drive_service.files().get_media(fileId=fid)
        buf = _io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        file_bytes = buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error descargando archivo: {e}")

    # Extraer texto
    text = extract_text_from_file(file_bytes, fname)
    if not text:
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del archivo")

    # Vectorizar
    pipeline = GammiaRAGPipeline(db)
    result = await pipeline.ingest_drive_document(
        doc_id=f"drive_{fid}",
        title=fname,
        full_content=text,
        requested_by=body.requested_by,
        tags=body.tags
    )

    return {
        "file_id": fid,
        "file_name": fname,
        "mime_type": mime,
        **result
    }


# ─────────────────────────────────────────────────────────────────────────────
# Listado de Nodos RAG
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/nodes")
async def list_nodes(db: AsyncSession = Depends(get_db)):
    """Lista los documentos únicos vectorizados (agrupados por doc_id)."""
    stmt = select(
        DocumentNode.doc_id,
        DocumentNode.title,
        DocumentNode.version,
        DocumentNode.doc_hash,
        DocumentNode.source_type,
        DocumentNode.tags,
        DocumentNode.active,
        DocumentNode.last_updated_at
    ).where(DocumentNode.active == 1).order_by(DocumentNode.last_updated_at.desc())
    result = await db.execute(stmt)
    rows = result.fetchall()

    # Deduplicar por doc_id (mostrar solo el más reciente de cada doc)
    seen = {}
    for row in rows:
        if row.doc_id not in seen:
            seen[row.doc_id] = {
                "id": row.doc_id,
                "title": row.title,
                "version": row.version,
                "hash": row.doc_hash[:8] if row.doc_hash else "—",
                "source": row.source_type,
                "tags": row.tags or [],
                "status": "SYNCED",
                "updated_at": row.last_updated_at.isoformat() if row.last_updated_at else None,
            }
    return {"documents": list(seen.values()), "total": len(seen)}


# ─────────────────────────────────────────────────────────────────────────────
# Legacy: sync-intranet (mantener compatibilidad)
# ─────────────────────────────────────────────────────────────────────────────

class IntranetSyncRequest(BaseModel):
    doc_id: str
    title: str
    content: str
    tags: List[str] = ["internal"]
    requested_by: str = "admin"

@router.post("/sync-intranet")
async def sync_intranet(body: IntranetSyncRequest, db: AsyncSession = Depends(get_db)):
    pipeline = GammiaRAGPipeline(db)
    result = await pipeline.ingest_drive_document(
        doc_id=body.doc_id,
        title=body.title,
        full_content=body.content,
        requested_by=body.requested_by,
        tags=body.tags
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Mantenimiento de la Base Vectorial
# ─────────────────────────────────────────────────────────────────────────────

class UpdateTagsRequest(BaseModel):
    tags: List[str]

class RevectorizeRequest(BaseModel):
    content: str
    tags: Optional[List[str]] = None
    requested_by: str = "admin"


@router.get("/nodes/{doc_id}/chunks")
async def get_doc_chunks(doc_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna todos los chunks vectorizados de un documento específico."""
    stmt = select(
        DocumentNode.id,
        DocumentNode.title,
        DocumentNode.version,
        DocumentNode.content,
        DocumentNode.tags,
        DocumentNode.active,
        DocumentNode.last_updated_at,
    ).where(
        DocumentNode.doc_id == doc_id,
        DocumentNode.active == 1
    ).order_by(DocumentNode.id)
    result = await db.execute(stmt)
    rows = result.fetchall()
    return {
        "doc_id": doc_id,
        "total_chunks": len(rows),
        "chunks": [
            {
                "chunk_id": r.id,
                "version": r.version,
                "content_preview": r.content[:200] + ("..." if len(r.content) > 200 else ""),
                "content_length": len(r.content),
                "tags": r.tags or [],
                "updated_at": r.last_updated_at.isoformat() if r.last_updated_at else None,
            }
            for r in rows
        ]
    }


@router.patch("/nodes/{doc_id}/tags")
async def update_doc_tags(doc_id: str, body: UpdateTagsRequest, db: AsyncSession = Depends(get_db)):
    """Actualiza los tags de TODOS los chunks de un documento sin re-vectorizar."""
    from sqlalchemy import update as sa_update
    stmt = (
        sa_update(DocumentNode)
        .where(DocumentNode.doc_id == doc_id, DocumentNode.active == 1)
        .values(tags=body.tags)
    )
    result = await db.execute(stmt)
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"Documento '{doc_id}' no encontrado.")
    return {
        "status": "updated",
        "doc_id": doc_id,
        "new_tags": body.tags,
        "chunks_updated": result.rowcount
    }


@router.post("/nodes/{doc_id}/revectorize")
async def revectorize_document(
    doc_id: str,
    body: RevectorizeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Re-vectoriza un documento existente con contenido nuevo.
    Incrementa la versión automáticamente y marca los chunks anteriores como inactivos.
    """
    # Obtener metadata del documento anterior
    stmt = select(DocumentNode.title, DocumentNode.tags, DocumentNode.version).where(
        DocumentNode.doc_id == doc_id, DocumentNode.active == 1
    ).limit(1)
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Documento '{doc_id}' no encontrado.")

    pipeline = GammiaRAGPipeline(db)
    result = await pipeline.ingest_drive_document(
        doc_id=doc_id,
        title=row.title,
        full_content=body.content,
        requested_by=body.requested_by,
        tags=body.tags if body.tags is not None else row.tags or ["internal"]
    )
    return {**result, "doc_id": doc_id, "previous_version": row.version}


@router.delete("/nodes/{doc_id}")
async def delete_document(
    doc_id: str,
    force: bool = False,
    requested_by: str = "admin",
    db: AsyncSession = Depends(get_db)
):
    """
    Elimina un documento de la base vectorial.
    - force=False (default): marca como inactivo (soft delete, reversible).
    - force=True: elimina físicamente todos los chunks (hard delete, irreversible).
    """
    from sqlalchemy import update as sa_update, delete as sa_delete

    # Verificar que existe
    check = await db.execute(
        select(DocumentNode.id).where(DocumentNode.doc_id == doc_id, DocumentNode.active == 1).limit(1)
    )
    if not check.first():
        raise HTTPException(status_code=404, detail=f"Documento '{doc_id}' no encontrado o ya eliminado.")

    if force:
        # Hard delete: elimina físicamente
        result = await db.execute(sa_delete(DocumentNode).where(DocumentNode.doc_id == doc_id))
        await db.commit()
        return {
            "status": "deleted",
            "type": "hard_delete",
            "doc_id": doc_id,
            "chunks_removed": result.rowcount,
            "message": "Documento eliminado permanentemente de la base vectorial."
        }
    else:
        # Soft delete: marca como inactivo (recoverable)
        result = await db.execute(
            sa_update(DocumentNode)
            .where(DocumentNode.doc_id == doc_id)
            .values(active=0)
        )
        await db.commit()
        return {
            "status": "deactivated",
            "type": "soft_delete",
            "doc_id": doc_id,
            "chunks_deactivated": result.rowcount,
            "message": "Documento desactivado. Usa force=true para eliminación permanente."
        }


@router.post("/nodes/{doc_id}/restore")
async def restore_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    """Restaura un documento que fue eliminado con soft delete."""
    from sqlalchemy import update as sa_update
    result = await db.execute(
        sa_update(DocumentNode)
        .where(DocumentNode.doc_id == doc_id, DocumentNode.active == 0)
        .values(active=1)
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado o ya está activo.")
    return {"status": "restored", "doc_id": doc_id, "chunks_restored": result.rowcount}
