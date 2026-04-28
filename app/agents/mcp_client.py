from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client
from google.genai import types


class MCPClientManager:
    """
    Gestiona la conexión con el servidor MCP de certificaciones.

    Modo de conexión (decidido en runtime por MCP_CERTIFICATIONS_URL en config):
      - SSE  → el servidor corre en la red local de Gamma (producción GCP).
      - stdio → el servidor se arranca como subprocess (desarrollo local con VPN).
    """

    def __init__(self):
        self._session: ClientSession | None = None
        self._exit_stack: AsyncExitStack | None = None
        self._tool_names: set[str] = set()
        self.function_declarations: list[types.FunctionDeclaration] = []

    async def connect(self, sse_url: str | None = None, stdio_script: str | None = None):
        """
        Conecta al servidor MCP.

        Args:
            sse_url:      URL del servidor SSE (ej. http://10.0.0.5:8001/sse).
                          Si está presente, se usa modo SSE (producción GCP).
            stdio_script: Ruta al script Python del servidor MCP.
                          Se usa cuando sse_url es None (desarrollo local).
        """
        self._exit_stack = AsyncExitStack()
        try:
            if sse_url:
                # ── Modo SSE: el servidor corre en la red de Gamma ────────────
                print(f"[MCP] Conectando via SSE: {sse_url}")
                read, write = await self._exit_stack.enter_async_context(
                    sse_client(url=sse_url)
                )
            else:
                # ── Modo stdio: arranca el servidor como subprocess local ──────
                if not stdio_script:
                    raise ValueError("Se requiere sse_url o stdio_script para conectar el MCP.")
                print(f"[MCP] Conectando via stdio: {stdio_script}")
                server_params = StdioServerParameters(command="python", args=[stdio_script])
                read, write = await self._exit_stack.enter_async_context(
                    stdio_client(server_params)
                )

            self._session = await self._exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await self._session.initialize()

            mcp_tools = await self._session.list_tools()
            self.function_declarations = [
                types.FunctionDeclaration(
                    name=t.name,
                    description=t.description,
                    parameters=t.inputSchema,
                )
                for t in mcp_tools.tools
            ]
            self._tool_names = {t.name for t in mcp_tools.tools}
            print(f"[MCP] Conectado. Herramientas: {sorted(self._tool_names)}")

        except Exception as e:
            print(f"[MCP] WARN: No se pudo conectar al servidor de certificaciones: {e}")
            if self._exit_stack:
                await self._exit_stack.aclose()
                self._exit_stack = None

    def is_connected(self) -> bool:
        return self._session is not None

    def is_mcp_tool(self, name: str) -> bool:
        return name in self._tool_names

    async def call_tool(self, name: str, args: dict) -> str:
        if not self._session:
            return "[MCP] Servidor de certificaciones no disponible."
        try:
            result = await self._session.call_tool(name, args)
            return result.content[0].text if result.content else ""
        except Exception as e:
            return f"[MCP] Error ejecutando herramienta '{name}': {e}"

    async def disconnect(self):
        if self._exit_stack:
            await self._exit_stack.aclose()
            self._exit_stack = None
            self._session = None
            self._tool_names = set()
            self.function_declarations = []


mcp_manager = MCPClientManager()
