"""
scripts/test_chat.py
--------------------
Prueba el endpoint de chat de GammIA con una pregunta sobre el RAG.
Ejecutar: python scripts/test_chat.py
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import urllib.request
import urllib.parse
import json

API_BASE = "https://gammia-api-1028680563477.us-central1.run.app"
TOKEN = "GAMMA_MOCK_ADMIN_TOKEN_999"

def ask(question: str, is_internal: bool = True):
    print(f"\n{'='*60}")
    print(f"🤖 Pregunta: {question}")
    print(f"{'='*60}")

    url = f"{API_BASE}/api/v1/chat?query={urllib.parse.quote(question)}"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            print(f"\n✅ Respuesta de GammIA:")
            print(data.get("response", "Sin respuesta"))
            print(f"\n📌 Fuente usada: {data.get('source', 'N/A')}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    # Cambia estas preguntas por temas de los documentos que subiste al RAG
    preguntas = [
        "¿Cuál es la política de Zero Trust de Gamma Ingenieros?",
        "¿Qué servicios ofrece Gamma Ingenieros?",
        "Explícame el portafolio de ciberseguridad",
    ]

    for p in preguntas:
        ask(p)
