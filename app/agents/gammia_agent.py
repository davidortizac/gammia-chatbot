from google import genai
from google.genai import types
from app.core.config import settings
from app.agents.tools.gamma_tools import search_tool, salesforce_connector, workspace_integration

def get_client() -> genai.Client:
    # Requires google-genai package
    # Falls back to environment variable GEMINI_API_KEY if GOOGLE_API_KEY is not passed explicitly.
    try:
        return genai.Client(api_key=settings.GOOGLE_API_KEY)
    except Exception as e:
        # Prevent crash if api key is mock/empty, handles locally gracefully for skeleton
        print(f"Advertencia: No se pudo instanciar GenAI SDK. Error: {e}")
        return None

async def execute_gammia_agent(query: str, is_internal_user: bool):
    """
    Orquestador GammIA.
    Usa Function Calling si el usuario es interno, o limita el acceso si es cliente web.
    """
    
    # 1. Definir Tools según privilegios
    active_tools = []
    if is_internal_user:
        # Intranet: Acceso completo a CRM, Búsqueda y Workspace
        active_tools = [search_tool, salesforce_connector, workspace_integration]
    else:
        # Web Pública: Restringido a solo búsqueda (FAQ / RAG público)
        active_tools = [search_tool]

    # 2. Configurar el LLM
    config = types.GenerateContentConfig(
        system_instruction=settings.SYSTEM_PROMPT,
        temperature=settings.TEMPERATURE,
        top_p=settings.TOP_P,
        top_k=settings.TOP_K,
        tools=active_tools if active_tools else None
    )

    client = get_client()
    
    # Manejo temporal del esqueleto en caso de faltar API_KEY real
    if not client or settings.GOOGLE_API_KEY == "INSERT_YOUR_GEMINI_API_KEY_HERE" or settings.GOOGLE_API_KEY == "":
        response_text = f"[DEBUG MOCK] API Key no configurada. GammIA usaría el modelo {settings.MODEL_ID} con {len(active_tools)} tools activas para responder a: {query}"
        metadata = {
            "tokens_in": len(query.split()), 
            "tokens_out": 20, 
            "source_used": "mock_no_apikey"
        }
        return response_text, metadata

    # 3. Llamar al Agente con Function Calling
    try:
        # Como no hay historial de chat persistente en este snapshot, usamos generate_content en lugar de chats.
        response = client.models.generate_content(
            model=settings.MODEL_ID,
            contents=query,
            config=config
        )
        
        # Validar si el modelo invocó herramientas (Function Calling behavior)
        source = "llm_direct"
        if response.function_calls:
            source = "function_calling"
            # Aquí iría el ciclo while true para devolver los Function Responses al modelo
            # (Simplificado para Fase inicial)
            
        metadata = {
            "tokens_in": response.usage_metadata.prompt_token_count if response.usage_metadata else 0,
            "tokens_out": response.usage_metadata.candidates_token_count if response.usage_metadata else 0,
            "source_used": source
        }
        
        return response.text, metadata
        
    except Exception as e:
        return f"Error ejecutando orquestador: {str(e)}", {"tokens_in":0, "tokens_out":0, "source_used":"error"}
