"""
app/api/endpoints/integrations.py
----------------------------------
Gestión de integraciones del agente GammIA desde el panel admin.

Rutas:
  GET  /api/v1/integrations                → Lista estado y config de todas las integraciones
  PUT  /api/v1/integrations                → Guarda estado y config (bulk)
  POST /api/v1/integrations/{id}/test      → Prueba la conectividad de una integración
"""
import json
import os
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import get_current_admin, get_db
from app.core.config import settings
from app.db.models import IntegrationConfig

router = APIRouter()

# Metadatos estáticos por integración (no persisten en DB)
INTEGRATION_META: Dict[str, Dict] = {
    "rag": {
        "locked": True,
        "locked_enabled": True,   # forzado siempre activo
        "wip": False,
        "testable": True,
        "version": "v2.1.0",
    },
    "google_workspace": {
        "locked": False,
        "wip": False,
        "testable": True,
        "version": "v1.0.0",
    },
    "salesforce": {
        "locked": True,
        "locked_enabled": False,  # forzado siempre inactivo
        "wip": False,
        "testable": False,
        "version": "v1.2.0",
    },
    "vulnerability_scanner": {
        "locked": False,
        "wip": True,
        "testable": True,
        "version": "v0.3.0",
    },
}


# ── Schemas ────────────────────────────────────────────────────────────────────

class IntegrationItem(BaseModel):
    id: str
    enabled: bool
    config: Optional[Dict[str, Any]] = None


class IntegrationsBulkUpdate(BaseModel):
    integrations: List[IntegrationItem]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_response(key: str, row: Optional[IntegrationConfig]) -> dict:
    meta = INTEGRATION_META.get(key, {})
    is_locked = meta.get("locked", False)
    if is_locked:
        enabled = meta.get("locked_enabled", False)
    else:
        enabled = row.enabled if row else False

    return {
        "id": key,
        "enabled": enabled,
        "locked": is_locked,
        "locked_enabled": meta.get("locked_enabled"),
        "wip": meta.get("wip", False),
        "testable": meta.get("testable", False),
        "version": meta.get("version", "v1.0.0"),
        "config": json.loads(row.config_json) if row and row.config_json else {},
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(get_current_admin)])
async def get_integrations(db: AsyncSession = Depends(get_db)):
    """Retorna el estado y configuración de todas las integraciones."""
    result = await db.execute(select(IntegrationConfig))
    rows = {r.id: r for r in result.scalars().all()}

    return {
        "integrations": [
            _build_response(key, rows.get(key))
            for key in INTEGRATION_META
        ]
    }


@router.put("", dependencies=[Depends(get_current_admin)])
async def save_integrations(body: IntegrationsBulkUpdate, db: AsyncSession = Depends(get_db)):
    """Guarda en bloque el estado y config de las integraciones no bloqueadas."""
    for item in body.integrations:
        meta = INTEGRATION_META.get(item.id, {})
        if meta.get("locked"):
            continue  # integraciones bloqueadas no se modifican

        result = await db.execute(
            select(IntegrationConfig).where(IntegrationConfig.id == item.id)
        )
        row = result.scalar_one_or_none()
        config_str = json.dumps(item.config) if item.config else None

        if row:
            row.enabled = item.enabled
            row.config_json = config_str
        else:
            db.add(IntegrationConfig(
                id=item.id,
                enabled=item.enabled,
                config_json=config_str,
            ))

    await db.commit()
    return {"ok": True}


@router.post("/{integration_id}/test", dependencies=[Depends(get_current_admin)])
async def test_integration(integration_id: str, db: AsyncSession = Depends(get_db)):
    """Prueba la conectividad de una integración específica."""
    meta = INTEGRATION_META.get(integration_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Integración no encontrada")
    if not meta.get("testable"):
        return {"ok": False, "message": "Test no disponible para esta integración"}

    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.id == integration_id)
    )
    row = result.scalar_one_or_none()
    config = json.loads(row.config_json) if row and row.config_json else {}

    # ── RAG ────────────────────────────────────────────────────────────────────
    if integration_id == "rag":
        try:
            from app.db.models import DocumentNode
            count_result = await db.execute(
                select(DocumentNode).where(DocumentNode.active == 1).limit(1)
            )
            _ = count_result.scalar_one_or_none()
            return {"ok": True, "message": "Motor RAG operativo — pgvector conectado correctamente"}
        except Exception as e:
            return {"ok": False, "message": f"Error pgvector: {e}"}

    # ── Google Workspace ───────────────────────────────────────────────────────
    elif integration_id == "google_workspace":
        try:
            from google.oauth2 import service_account
            sa_file = settings.GOOGLE_SERVICE_ACCOUNT_FILE
            if not os.path.exists(sa_file):
                return {
                    "ok": False,
                    "message": f"Service Account no encontrado en: {sa_file}. Configura GOOGLE_SERVICE_ACCOUNT_FILE en .env"
                }
            creds = service_account.Credentials.from_service_account_file(
                sa_file,
                scopes=["https://www.googleapis.com/auth/calendar.readonly"]
            )
            return {
                "ok": True,
                "message": f"Service Account válido — {creds.service_account_email}"
            }
        except Exception as e:
            return {"ok": False, "message": f"Error al leer Service Account: {e}"}

    # ── Vulnerability Scanner ──────────────────────────────────────────────────
    elif integration_id == "vulnerability_scanner":
        endpoint = config.get("api_endpoint", "").strip()
        if not endpoint:
            return {"ok": False, "message": "Configura el API Endpoint antes de probar"}
        try:
            import httpx
            headers: Dict[str, str] = {}
            api_key = config.get("api_key", "").strip()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(endpoint, headers=headers)
            return {"ok": True, "message": f"Conexión exitosa — HTTP {r.status_code}"}
        except Exception as e:
            return {"ok": False, "message": f"Sin respuesta del servidor: {e}"}

    return {"ok": False, "message": "Test no implementado para esta integración"}
