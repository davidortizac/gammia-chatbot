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
    # Google Workspace OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    
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
