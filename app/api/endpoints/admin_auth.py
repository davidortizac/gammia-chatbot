"""
app/api/endpoints/admin_auth.py
--------------------------------
Autenticación JWT para el panel admin de GammIA.

Rutas:
  POST /api/v1/auth/login          → obtener token JWT
  GET  /api/v1/auth/me             → perfil del usuario autenticado
  GET  /api/v1/auth/users          → listar admins (superadmin)
  POST /api/v1/auth/users          → crear admin (superadmin)
  PUT  /api/v1/auth/users/{id}     → editar admin (superadmin)
  DELETE /api/v1/auth/users/{id}   → desactivar admin (superadmin)
  PUT  /api/v1/auth/me/password    → cambiar contraseña propia
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import (
    hash_password, verify_password, create_access_token,
    get_current_admin, require_superadmin, get_db,
)
from app.db.models import AdminUser

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class CreateUserRequest(BaseModel):
    email: str
    full_name: Optional[str] = None
    password: str
    role: str = "admin"


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _user_dict(u: AdminUser) -> dict:
    return {
        "id":         u.id,
        "email":      u.email,
        "full_name":  u.full_name,
        "role":       u.role,
        "is_active":  u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "created_by": u.created_by,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, user=_user_dict(user))


@router.get("/me")
async def me(current: AdminUser = Depends(get_current_admin)):
    return _user_dict(current)


@router.put("/me/password")
async def change_my_password(
    body: ChangePasswordRequest,
    current: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    result = await db.execute(select(AdminUser).where(AdminUser.id == current.id))
    user = result.scalar_one()
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


@router.get("/users", dependencies=[Depends(get_current_admin)])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AdminUser).order_by(AdminUser.created_at))
    return {"users": [_user_dict(u) for u in result.scalars().all()]}


@router.post("/users", dependencies=[Depends(require_superadmin)])
async def create_user(
    body: CreateUserRequest,
    current: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El email ya está registrado")

    user = AdminUser(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        created_by=current.email,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"ok": True, "user": _user_dict(user)}


@router.put("/users/{user_id}", dependencies=[Depends(require_superadmin)])
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AdminUser).where(AdminUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    for field, value in body.dict(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return {"ok": True, "user": _user_dict(user)}


@router.delete("/users/{user_id}", dependencies=[Depends(require_superadmin)])
async def deactivate_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AdminUser).where(AdminUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    await db.commit()
    return {"ok": True}
