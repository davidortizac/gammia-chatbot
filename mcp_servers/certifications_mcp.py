from mcp.server.fastmcp import FastMCP
import httpx
import time
import os
from typing import List, Dict, Any

# En modo SSE el servidor escucha en red — host/puerto configurables por env
_host = os.getenv("MCP_HOST", "0.0.0.0")
_port = int(os.getenv("MCP_PORT", "8001"))

mcp = FastMCP("Gammia Certificaciones", host=_host, port=_port)

# Configuración del Endpoint
ENDPOINT_URL = "https://emsg.gammaingenieros.com/apiControllers/getData.ashx?token=1234567890ABCDEF"

# Caché en memoria simple (para no llamar al endpoint en cada pregunta del chat)
cache = {
    "data": None,
    "last_updated": 0
}
CACHE_TTL = 300 # 5 minutos en segundos

async def obtener_datos_endpoint() -> List[Dict[str, Any]]:
    """Función interna para consultar el endpoint con manejo de caché."""
    current_time = time.time()
    
    # Si tenemos datos frescos en caché, los usamos
    if cache["data"] is not None and (current_time - cache["last_updated"]) < CACHE_TTL:
        return cache["data"]
        
    # Si no, consultamos el endpoint real (Requiere VPN activa)
    async with httpx.AsyncClient(verify=False) as client:
        try:
            # verify=False temporal por si hay temas de certificados SSL locales
            response = await client.get(ENDPOINT_URL, timeout=15.0)
            response.raise_for_status()
            
            datos = response.json()
            
            # Guardamos en caché
            cache["data"] = datos
            cache["last_updated"] = current_time
            return datos
            
        except Exception as exc:
            raise RuntimeError(f"Error conectando al endpoint corporativo: {exc}. ¿Está conectada la VPN?")

@mcp.tool()
async def obtener_certificaciones_funcionario(nombre_funcionario: str) -> str:
    """
    Busca a un funcionario por su nombre o apellido y devuelve un listado de todas sus certificaciones.
    Usa esta herramienta cuando el usuario pregunte por el estado o las certificaciones de una persona específica.
    """
    try:
        datos = await obtener_datos_endpoint()
    except Exception as e:
        return str(e)
    
    resultados = []
    nombre_lower = nombre_funcionario.lower()
    
    for empleado in datos:
        # Asumimos que el JSON tiene un campo 'nombre' o equivalente
        # Ajustaremos esto cuando veamos la respuesta real del endpoint
        nombre_empleado = str(empleado.get("nombre", "")).lower()
        if not nombre_empleado and isinstance(empleado, dict):
             # Buscar en valores si no sabemos la llave exacta aún
             if any(nombre_lower in str(v).lower() for v in empleado.values()):
                 resultados.append(empleado)
        elif nombre_lower in nombre_empleado:
            resultados.append(empleado)
            
    if not resultados:
        return f"No encontré a ningún funcionario llamado '{nombre_funcionario}'."
        
    return str(resultados)

@mcp.tool()
async def listar_funcionarios_por_marca(marca_fabricante: str) -> str:
    """
    Busca y devuelve la lista de todos los funcionarios que tienen alguna certificación de una marca o fabricante específico (Ej. Fortinet, Cisco, Palo Alto).
    Usa esta herramienta cuando el usuario quiera saber quiénes dominan una marca.
    """
    try:
        datos = await obtener_datos_endpoint()
    except Exception as e:
        return str(e)
        
    resultados = []
    marca_lower = marca_fabricante.lower()
    
    for empleado in datos:
        # Búsqueda general en todo el registro del empleado (útil hasta que mapeemos los campos exactos)
        registro_str = str(empleado).lower()
        if marca_lower in registro_str:
             resultados.append(empleado)
             
    if not resultados:
        return f"Nadie parece tener certificaciones registradas para la marca '{marca_fabricante}'."
        
    return str(resultados)

if __name__ == "__main__":
    import sys
    transport = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    if transport == "sse":
        print(f"Iniciando Servidor MCP 'Gammia Certificaciones' en SSE: http://{_host}:{_port}/sse")
    else:
        print("Iniciando Servidor MCP 'Gammia Certificaciones' en stdio...")
    mcp.run(transport=transport)
