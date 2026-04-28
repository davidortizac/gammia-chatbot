from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "GammIA API"
    VERSION: str = "1.0.0"
    
    # GCP Vector / Relational DB
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/gammiadb"
    
    # Model configuration
    MODEL_ID: str = "gemini-2.5-flash"
    TEMPERATURE: float = 0.1
    TOP_P: float = 0.95
    TOP_K: int = 40
    
    # LLM Identity
    GOOGLE_API_KEY: str = ""
    # Google Service Account (para Drive sync)
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "/app/service_account.json"
    # Widget embeddable
    WIDGET_INTERNAL_SECRET: str = ""   # Set en .env para acceso interno desde Google Sites
    # Google Workspace OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None

    # MCP — Servidor de Certificaciones (red local Gamma)
    # Vacío → modo stdio/subprocess (desarrollo local con VPN)
    # URL   → modo SSE, el servidor corre en la red de Gamma (producción GCP)
    # Ejemplo: http://10.128.0.5:8001/sse
    MCP_CERTIFICATIONS_URL: str = ""

    # JWT Admin Auth
    JWT_SECRET_KEY: str = "changeme-super-secret-key-replace-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas

    # CORS — orígenes permitidos (separados por coma)
    # Producción: https://tu-admin.gammaingenieros.com,https://gammaingenieros.com
    # Local:      http://localhost:5173,http://localhost:3000
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Default admin account (seeded on first startup)
    ADMIN_DEFAULT_EMAIL: str = "admin@gammaingenieros.com"
    ADMIN_DEFAULT_PASSWORD: str = "Gamma2024!"
    
    # System Prompt (Identity)
    SYSTEM_PROMPT: str = """
    Eres GammIA, Arquitecto Senior de IA y Orquestador de Agentes de la compañía Gamma Ingenieros.
    Tu correo de contacto corporativo es gammia@gammaingenieros.com.
    Eres un experto en ciberseguridad, protector, proactivo y siempre con un tono formal.
    Debes proteger la información de la intranet y resolver problemas empresariales usando tus herramientas.
    """

    class Config:
        env_file = ".env"

settings = Settings()
