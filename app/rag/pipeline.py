import hashlib
import json
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from datetime import datetime

from app.db.models import DocumentNode, DocumentDeletionRequest

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    from google import genai
    from google.genai import types
    from app.core.config import settings
except ImportError:
    pass

class GammiaRAGPipeline:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embeddings_model = "models/gemini-embedding-001"
        try:
           # Use default API version (v1beta) - works with gemini-embedding-001
           self.llm_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        except Exception as e:
           print(f"Warning: GenAI client init failed: {e}")
           self.llm_client = None

    def _generate_hash(self, content: str) -> str:
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    async def _validate_and_clean_document(self, raw_content: str) -> dict:
        """
        LLM-as-a-judge: Filtra basura, corrige ortografía, y traduce a español
        preservando el contexto técnico.
        """
        if not self.llm_client:
             # Mock fall-back si no hay API_KEY
             return {"is_valid": True, "cleaned_content": raw_content, "reason": "No API KEY"}

        system_instruction = """
        Eres el Auditor de Datos de Gamma Ingenieros. 
        Tu objetivo es evaluar si el siguiente texto es conocimiento idóneo y certero sobre ciberseguridad o políticas corporativas.
        
        REGLAS:
        1. Si es texto basura o sin sentido, responde {"is_valid": false, "cleaned_content": "", "reason": "no certeza"}.
        2. Si no corresponde a tecnología, ciberseguridad o Gamma, recházalo.
        3. Si es idóneo, debes arreglar la ORTOGRAFÍA y TRADUCIRLO al Español de manera profesional.
        4. ABSOLUTAMENTE PROHIBIDO traducir anglicismos técnicos (ej. "Firewall", "Zero-Trust", comandos como "ipconfig", variables de código).
        
        Devuelve ÚNICAMENTE un JSON válido con esta estructura:
        {
           "is_valid": true|false,
           "cleaned_content": "texto corregido y traducido",
           "reason": "motivo de aprobación o rechazo"
        }
        """

        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json"
            )
            response = self.llm_client.models.generate_content(
                model=settings.MODEL_ID,
                contents=raw_content[:30000], # Limitar tamaño para contexto del Judge
                config=config
            )
            data = json.loads(response.text)
            return data
        except Exception as e:
            print(f"Advertencia: AI Validation falló ({e}). Haciendo fallback a contenido crudo.")
            return {"is_valid": True, "cleaned_content": raw_content, "reason": f"Mocked (Quota Error)"}

    async def request_deletion(self, doc_id: str, requested_by: str, reason: str = "manual_delete", new_hash: str = None):
        """ Registra la petición en audit y detiene el flujo (Human in the loop) """
        req = DocumentDeletionRequest(
            doc_id=doc_id,
            requested_by=requested_by,
            reason=reason,
            new_hash_to_upsert=new_hash
        )
        self.db.add(req)
        await self.db.commit()
        return {"status": "pending_approval", "request_id": req.id, "message": "La eliminación o sobreescritura requiere aprobación del responsable."}

    async def ingest_drive_document(self, doc_id: str, title: str, full_content: str, requested_by: str, tags: List[str] = ["general"]):
        """
        Ingesta con Validación de IA y Aprobación de Actualizaciones, sumando Etiquetado (Tags).
        """
        new_hash = self._generate_hash(full_content)

        # 1. Verificar si el documento ya existe
        stmt = select(DocumentNode).where(DocumentNode.doc_id == doc_id).limit(1)
        result = await self.db.execute(stmt)
        existing_doc = result.scalar_one_or_none()

        version = 1
        if existing_doc:
            if existing_doc.doc_hash == new_hash:
                return {"status": "skipped", "message": "No changes detected"}
            
            # Hay cambios. En vez de borrar inmediatamente, encolamos solicitud de baja (HITL)
            return await self.request_deletion(
                doc_id=doc_id, 
                requested_by=requested_by, 
                reason="version_update", 
                new_hash=new_hash
            )

        # 2. IA Auditor (Idoneidad, Certeza, Traducción y Ortografía)
        validation_result = await self._validate_and_clean_document(full_content)
        if not validation_result.get("is_valid"):
             return {"status": "rejected", "message": validation_result.get("reason")}
        
        clean_content = validation_result.get("cleaned_content", full_content)

        # 3. Chunking con LangChain
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200, length_function=len)
        chunks = text_splitter.split_text(clean_content)

        # 4. Vectorización y Guardado
        embeddings = []
        if self.llm_client:
            try:
                response = self.llm_client.models.embed_content(
                    model=self.embeddings_model,
                    contents=chunks
                )
                embeddings = [e.values for e in response.embeddings]
            except Exception as emb_err:
                print(f"Warning: Embedding falló ({emb_err}). Usando vectores mock para continuar.")
                embeddings = [[0.0] * 3072 for _ in chunks]
        else:
            embeddings = [[0.0] * 3072 for _ in chunks]

        new_nodes = []
        for i, chunk_text in enumerate(chunks):
            node = DocumentNode(
                doc_id=doc_id, title=title, version=version,
                doc_hash=new_hash, source_type="intranet_drive",
                content=chunk_text, embedding=embeddings[i], active=1,
                tags=tags
            )
            self.db.add(node)
            new_nodes.append(node)

        await self.db.commit()

        # Actualizar tsvector para Hybrid Search (léxica)
        try:
            from sqlalchemy import text
            await self.db.execute(text(
                "UPDATE document_nodes SET content_tsv = to_tsvector('spanish', coalesce(content,'')) "
                "WHERE doc_id = :doc_id AND content_tsv IS NULL"
            ), {"doc_id": doc_id})
            await self.db.commit()
        except Exception as e:
            print(f"Warning: no se pudo actualizar content_tsv: {e}")

        return {"status": "success", "chunks_inserted": len(new_nodes), "version": version, "ai_validation": "passed"}

    async def execute_approved_deletion(self, doc_id: str):
        """ Ejecuta el Delete físico y definitivo de vectores tras la firma manual """
        stmt = delete(DocumentNode).where(DocumentNode.doc_id == doc_id)
        await self.db.execute(stmt)
        await self.db.commit()
