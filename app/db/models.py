from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from app.db.database import Base
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    from sqlalchemy.types import UserDefinedType
    class Vector(UserDefinedType):
        def get_col_spec(self):
            return "VECTOR"

class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(String, index=True)
    session_id = Column(String, index=True, nullable=True)   # widget session tracking
    tokens_in = Column(Integer)
    tokens_out = Column(Integer)
    latency_ms = Column(Integer)
    source_used = Column(String)
    user_query = Column(Text)
    assistant_response = Column(Text)
    sentiment_score = Column(Float, nullable=True)


class DocumentNode(Base):
    __tablename__ = "document_nodes"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    title = Column(String)
    version = Column(Integer, default=1)
    doc_hash = Column(String, index=True)
    source_type = Column(String, index=True)
    tags = Column(ARRAY(String), default=["general"])
    content = Column(Text)
    embedding = Column(Vector(3072))
    active = Column(Integer, default=1)
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DocumentDeletionRequest(Base):
    __tablename__ = "document_deletion_requests"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    requested_by = Column(String)
    reason = Column(String)
    new_hash_to_upsert = Column(String, nullable=True)
    status = Column(String, default="PENDING")
    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    color = Column(String, default="slate")
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WidgetConfig(Base):
    """Configuración dinámica del Chatbot Widget — editable desde el panel admin."""
    __tablename__ = "widget_config"

    id = Column(Integer, primary_key=True)

    # ── Colores ────────────────────────────────────────────────────────────────
    primary_color    = Column(String, default="#168bf2")
    secondary_color  = Column(String, default="#0d5eab")
    background_color = Column(String, default="#1a1a1a")
    surface_color    = Column(String, default="#2d2d2d")
    surface2_color   = Column(String, default="#3d3d3d")
    user_bubble_color = Column(String, default="#168bf2")
    bot_bubble_color  = Column(String, default="#3d3d3d")
    text_color       = Column(String, default="#E2E8F0")
    border_color     = Column(String, default="#1E293B")

    # ── Tipografía ─────────────────────────────────────────────────────────────
    font_family = Column(String, default="'Poppins', sans-serif")
    font_size   = Column(String, default="13px")

    # ── Contenido ──────────────────────────────────────────────────────────────
    title    = Column(String, default="GammIA")
    subtitle = Column(String, default="Asistente Virtual · Gamma Ingenieros")
    greeting_public   = Column(Text, default="¡Hola! Soy GammIA, asistente virtual de Gamma Ingenieros. Puedo ayudarte con información sobre nuestros servicios de ciberseguridad. ¿Tienes alguna pregunta?")
    greeting_internal = Column(Text, default="¡Hola! Soy GammIA, tu asistente de intranet. Tengo acceso a la base de conocimiento interna de Gamma Ingenieros. ¿En qué te puedo ayudar?")

    # ── Icono / Avatar ─────────────────────────────────────────────────────────
    avatar_url    = Column(String, default="/static/gammia-avatar.png")
    bot_icon_type = Column(String, default="avatar")   # avatar | letter | custom

    # ── Configuración general ──────────────────────────────────────────────────
    theme            = Column(String,  default="dark")   # dark | light
    max_interactions = Column(Integer, default=10)
    chat_width       = Column(Integer, default=370)
    chat_height      = Column(Integer, default=560)
    
    # ── LLM & RAG Config ───────────────────────────────────────────────────────
    llm_temperature  = Column(Float, default=0.1)
    llm_top_p        = Column(Float, default=0.95)
    llm_top_k        = Column(Integer, default=40)
    rag_top_k        = Column(Integer, default=15)


class AdminUser(Base):
    """Usuarios del panel de administración con autenticación JWT."""
    __tablename__ = "admin_users"

    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String, unique=True, index=True, nullable=False)
    full_name    = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role         = Column(String, default="admin")   # admin | superadmin
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    created_by   = Column(String, nullable=True)     # email of creator


class WidgetSession(Base):
    """Sesión de widget: limita a max_interactions por sesión y audita conversaciones."""
    __tablename__ = "widget_sessions"

    id                   = Column(String, primary_key=True)   # session_id
    context              = Column(String)
    interaction_count    = Column(Integer, default=0)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    last_interaction_at  = Column(DateTime(timezone=True), nullable=True)
