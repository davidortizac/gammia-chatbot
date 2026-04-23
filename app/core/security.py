from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# Dummy OAuth setup for Google OAuth
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    # Aquí iría la validación del Token de Google Cloud Identity (IAP u OAuth2)
    # Por ahora devolvemos un payload dummy
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Payload = google.oauth2.id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
    payload = {"email": "usuario@gammaingenieros.com", "is_internal": True}
    return payload

def enforce_guardrails(query: str) -> bool:
    """
    Valida que la consulta no intente extraer información sensible
    o tratar temas no relacionados con la compañía de ciberseguridad.
    """
    forbidden_topics = ["cómo hackear", "ignora todas las instrucciones anteriores"]
    if any(topic in query.lower() for topic in forbidden_topics):
        return False
    return True
