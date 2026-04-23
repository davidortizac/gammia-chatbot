from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from sqlalchemy.sql import func
from app.db.database import Base
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    # Placeholder si pgvector no está instalado localmente, no falla la generación en desarrollo.
    from sqlalchemy.types import UserDefinedType
    class Vector(UserDefinedType):
        def get_col_spec(self):
            return "VECTOR"

class InteractionLog(Base):
    __tablename__ = "interaction_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(String, index=True) # Requerimiento: user_id
    tokens_in = Column(Integer)          # Requerimiento: tokens_in
    tokens_out = Column(Integer)         # Requerimiento: tokens_out
    latency_ms = Column(Integer)         # Requerimiento: latency
    source_used = Column(String)         # Requerimiento: source_used (Ej: Intranet, Web, Salesforce)
    
    # Adicionales útiles para analítica
    user_query = Column(Text)
    assistant_response = Column(Text)
    sentiment_score = Column(Float, nullable=True) # Para el requerimiento analítico


class DocumentNode(Base):
    """
    Modelo para la Base de Datos Vectorial (RAG).
    Almacena los fragmentos indexados listos para búsqueda por similitud.
    """
    __tablename__ = "document_nodes"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)     # Ej: "1A2B3C_manual_seguridad" (Google Drive ID)
    title = Column(String)
    version = Column(Integer, default=1)
    doc_hash = Column(String, index=True)   # Hash MD5 para detectar cambios
    source_type = Column(String, index=True) # "intranet_drive", "web"
    
    content = Column(Text)                  # El chunk de texto
    # Por defecto text-embedding-004 de Google produce 768 dimensiones.
    embedding = Column(Vector(768)) 
    
    active = Column(Integer, default=1)     # 1 = activo, 0 = obsoleto
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class DocumentDeletionRequest(Base):
    """
    Tabla de auditoría para aprobaciones Human-in-the-Loop.
    Registra quién intentó borrar o sobreescribir un documento en el RAG.
    """
    __tablename__ = "document_deletion_requests"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    requested_by = Column(String)      # Usuario/Sistema que pidió borrar
    reason = Column(String)            # "manual_delete" o "version_update"
    new_hash_to_upsert = Column(String, nullable=True) # Si es un update, guardamos el hash a esperar
    
    status = Column(String, default="PENDING") # "PENDING", "APPROVED", "REJECTED"
    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
