import hashlib
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.db.models import DocumentNode

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    from app.core.config import settings
except ImportError:
    pass

class GammiaRAGPipeline:
    def __init__(self, db: AsyncSession):
        self.db = db
        # Para RAG usaremos text-embedding-004
        self.embeddings_model = "models/text-embedding-004"
        try:
           self.embedder = GoogleGenerativeAIEmbeddings(
               model=self.embeddings_model, 
               google_api_key=settings.GOOGLE_API_KEY
           )
        except Exception:
           self.embedder = None

    def _generate_hash(self, content: str) -> str:
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    async def ingest_drive_document(self, doc_id: str, title: str, full_content: str):
        """
        Punto de entrada cuando Google Drive reporta un documento nuevo o modificado.
        """
        new_hash = self._generate_hash(full_content)

        # 1. Verificar si el documento ya existe
        stmt = select(DocumentNode).where(DocumentNode.doc_id == doc_id).limit(1)
        result = await self.db.execute(stmt)
        existing_doc = result.scalar_one_or_none()

        version = 1
        if existing_doc:
            if existing_doc.doc_hash == new_hash:
                print(f"[{doc_id}] El documento no ha cambiado. Ignorando.")
                return {"status": "skipped", "message": "No changes detected"}
            
            # Hay cambios. Incrementar versión y borrar los nodos (chunks) viejos.
            version = existing_doc.version + 1
            print(f"[{doc_id}] Detectados cambios. Borrando v{existing_doc.version} e infiriendo v{version}.")
            await self._delete_document_chunks(doc_id)

        # 2. Chunking con LangChain
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
        chunks = text_splitter.split_text(full_content)

        # 3. Vectorización con Gemini
        if self.embedder:
            embeddings = await self.embedder.aembed_documents(chunks)
        else:
            # Mock para entorno vacío
            embeddings = [[0.1] * 768 for _ in chunks]

        # 4. Insertar Nodos nuevos
        new_nodes = []
        for i, chunk_text in enumerate(chunks):
            node = DocumentNode(
                doc_id=doc_id,
                title=title,
                version=version,
                doc_hash=new_hash,
                source_type="intranet_drive",
                content=chunk_text,
                embedding=embeddings[i],
                active=1
            )
            self.db.add(node)
            new_nodes.append(node)

        await self.db.commit()
        return {"status": "success", "chunks_inserted": len(new_nodes), "version": version}

    async def _delete_document_chunks(self, doc_id: str):
        """ Hard-delete de los fragmentos obsoletos para evitar alucinaciones """
        stmt = delete(DocumentNode).where(DocumentNode.doc_id == doc_id)
        await self.db.execute(stmt)
        await self.db.commit()
