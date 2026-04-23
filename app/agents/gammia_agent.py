from app.core.config import settings

async def execute_gammia_agent(query: str, is_internal_user: bool):
    """
    Punto de entrada de la lógica del agente y Function Calling.
    
    1. Si 'is_internal_user' == True, el agente tiene contexto para responder 
       preguntas de intranet. Si False, se bloquean temas internos y solo 
       se consulta portafolio.
    
    2. Aquí se inyecta el SYSTEM_PROMPT.
    
    3. Retorna un string (texto AI) y un diccionario JSON con metadata 
       (tokens, latencias, origen del RAG o Function Call usada).
    """
    
    # Ej: prompt = settings.SYSTEM_PROMPT
    
    response = f"GammIA (Confidencialidad: {'Interna' if is_internal_user else 'Pública'}): He recibido tu consulta: {query}"
    
    metadata = {
        "tokens_in": len(query.split()), 
        "tokens_out": 25, 
        "source_used": "intranet" if is_internal_user else "web"
    }
    
    return response, metadata
