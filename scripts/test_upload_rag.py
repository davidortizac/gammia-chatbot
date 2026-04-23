import requests
import json

# URL del orquestador en Google Cloud (o localhost si pruebas local)
API_URL = "https://gammia-api-1028680563477.us-central1.run.app/api/v1/rag/sync-intranet"

# El token falso estructurado para pasar el filtro is_internal
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer GAMMA_MOCK_ADMIN_TOKEN_999"
}

def simulate_drive_upload():
    print("Iniciando inyección de documento de prueba al RAG Vectorial...")
    
    # Payload con el formato Pydantic actualizado (Tags incluidos)
    payload = {
        "doc_id": "GAMMA_TEST_DOC_001",
        "title": "Políticas de Zero Trust - Gamma 2026",
        "content": "En Gamma Ingenieros, la política de Zero Trust establece que todos los dispositivos, sean corporativos o BYOD, deben ser verificados por el firewall FortiGate antes de acceder a la red interna. No se confía en ningún segmento de red por defecto. Esta política aplica a servicios gestionados y arquitectura SOC.",
        "tags": ["internal", "policies", "csoc"]
    }

    try:
        response = requests.post(API_URL, headers=HEADERS, json=payload)
        
        if response.status_code == 200:
            print("[OK] INGESTA EXITOSA:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"[FAIL] FALLO HTTP {response.status_code}:")
            print(response.text)
            
    except Exception as e:
        print(f"[ERROR] DE CONEXIÓN: {e}")

if __name__ == "__main__":
    simulate_drive_upload()
