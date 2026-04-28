from google import genai
from google.genai import types
from app.core.config import settings
from app.agents.tools.gamma_tools import search_tool, salesforce_connector, workspace_integration

def get_client() -> genai.Client:
    try:
        return genai.Client(api_key=settings.GOOGLE_API_KEY)
    except Exception as e:
        print(f"Advertencia: No se pudo instanciar GenAI SDK. Error: {e}")
        return None


# ── Declaraciones de herramientas locales ─────────────────────────────────────

_SEARCH_TOOL = types.FunctionDeclaration(
    name="buscar_conocimiento_gamma",
    description=(
        "Busca información en la base de datos interna de Gamma Ingenieros "
        "(políticas, servicios, portafolio, procedimientos, clientes). "
        "Usar siempre que necesites información específica de la empresa."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Consulta o pregunta a buscar"}
        },
        "required": ["query"],
    },
)

_SALESFORCE_TOOL = types.FunctionDeclaration(
    name="consultar_crm_salesforce",
    description=(
        "Consulta el CRM de Salesforce para obtener estado de servicios o tickets de clientes. "
        "Usar cuando el usuario pregunte sobre un proyecto, contrato o cliente específico."
    ),
    parameters={
        "type": "object",
        "properties": {
            "consulta_cliente": {
                "type": "string",
                "description": "Información del cliente o proyecto a consultar",
            }
        },
        "required": ["consulta_cliente"],
    },
)

_WORKSPACE_TOOL = types.FunctionDeclaration(
    name="workspace_integration",
    description=(
        "Interactúa con Google Workspace: envía correos, agenda citas o crea eventos. "
        "Usar solo cuando el usuario solicite explícitamente agendar, enviar correo o crear un evento."
    ),
    parameters={
        "type": "object",
        "properties": {
            "accion": {
                "type": "string",
                "description": "Acción a realizar en Google Workspace",
            }
        },
        "required": ["accion"],
    },
)


def _run_local_tool(name: str, args: dict, is_internal: bool) -> str:
    """Ejecuta una herramienta local (no-MCP) por nombre."""
    if name == "buscar_conocimiento_gamma":
        return search_tool(args.get("query", ""), is_internal=is_internal)
    if name == "consultar_crm_salesforce":
        return salesforce_connector(args.get("consulta_cliente", ""))
    if name == "workspace_integration":
        return workspace_integration(args.get("accion", ""))
    return f"[Error] Herramienta desconocida: {name}"


async def execute_gammia_agent(
    query: str, 
    is_internal_user: bool,
    model_id: str = None,
    temperature: float = None,
    top_p: float = None,
    top_k: int = None
):
    """
    Orquestador GammIA con loop agéntico completo.
    - Usuarios internos: RAG + CRM + Workspace + Certificaciones (MCP)
    - Usuarios públicos: solo búsqueda en base pública
    """
    from app.agents.mcp_client import mcp_manager

    client = get_client()
    if (
        not client
        or not settings.GOOGLE_API_KEY
        or settings.GOOGLE_API_KEY in ("INSERT_YOUR_GEMINI_API_KEY_HERE", "")
    ):
        metadata = {"tokens_in": len(query.split()), "tokens_out": 20, "source_used": "mock_no_apikey"}
        return f"[DEBUG MOCK] API Key no configurada. GammIA respondería a: {query}", metadata

    # ── Construir lista de herramientas según privilegios ─────────────────────
    declarations = [_SEARCH_TOOL]
    if is_internal_user:
        declarations += [_SALESFORCE_TOOL, _WORKSPACE_TOOL]
        declarations += mcp_manager.function_declarations  # Certificaciones (MCP)

    # Priorizar parámetros pasados sobre los de settings (.env)
    target_model = model_id or settings.MODEL_ID
    target_temp  = temperature if temperature is not None else settings.TEMPERATURE
    target_top_p = top_p if top_p is not None else settings.TOP_P
    target_top_k = top_k if top_k is not None else settings.TOP_K

    config = types.GenerateContentConfig(
        system_instruction=settings.SYSTEM_PROMPT,
        temperature=target_temp,
        top_p=target_top_p,
        top_k=target_top_k,
        tools=[types.Tool(function_declarations=declarations)] if declarations else None,
    )

    try:
        # Conversación inicial
        contents: list = [
            types.Content(role="user", parts=[types.Part(text=query)])
        ]
        source = "llm_direct"
        response = None

        for _ in range(5):  # máximo 5 rondas de tool use
            response = client.models.generate_content(
                model=target_model,
                contents=contents,
                config=config,
            )

            if not response.function_calls:
                break  # respuesta final en texto

            source = "function_calling"

            # Añadir turno del modelo al historial
            contents.append(response.candidates[0].content)

            # Ejecutar cada función y recopilar resultados
            tool_parts = []
            for fc in response.function_calls:
                if mcp_manager.is_mcp_tool(fc.name):
                    result = await mcp_manager.call_tool(fc.name, dict(fc.args))
                else:
                    result = _run_local_tool(fc.name, dict(fc.args), is_internal=is_internal_user)

                tool_parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": result},
                        )
                    )
                )

            # Añadir resultados de herramientas como turno de usuario
            contents.append(types.Content(role="user", parts=tool_parts))

        metadata = {
            "tokens_in": response.usage_metadata.prompt_token_count if response.usage_metadata else 0,
            "tokens_out": response.usage_metadata.candidates_token_count if response.usage_metadata else 0,
            "source_used": source,
        }
        return response.text, metadata

    except Exception as e:
        return f"Error ejecutando orquestador: {str(e)}", {"tokens_in": 0, "tokens_out": 0, "source_used": "error"}
