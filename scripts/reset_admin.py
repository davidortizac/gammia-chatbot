"""
scripts/reset_admin.py
-----------------------
Crea o resetea el usuario superadmin.
Uso:
  docker exec -it gammia_backend python scripts/reset_admin.py
  python scripts/reset_admin.py  (con venv activo)
"""
import asyncio
import os
import sys

# Permite ejecutar desde la raíz del proyecto
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import engine
from app.db.models import AdminUser
from app.core.auth import hash_password

EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@gammaingenieros.com")
PASSWORD = os.getenv("ADMIN_PASSWORD", "Gamma2024!")
ROLE     = os.getenv("ADMIN_ROLE",     "superadmin")


async def main():
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(AdminUser).where(AdminUser.email == EMAIL)
        )
        user = result.scalar_one_or_none()

        if user:
            user.hashed_password = hash_password(PASSWORD)
            user.is_active = True
            user.role = ROLE
            await session.commit()
            print(f"[OK] Contraseña actualizada para: {EMAIL}")
        else:
            new_user = AdminUser(
                email=EMAIL,
                full_name="Administrador Principal",
                hashed_password=hash_password(PASSWORD),
                role=ROLE,
                is_active=True,
                created_by="script",
            )
            session.add(new_user)
            await session.commit()
            print(f"[OK] Usuario creado: {EMAIL} (rol: {ROLE})")

        # Mostrar todos los admins activos
        all_users = await session.execute(
            select(AdminUser).where(AdminUser.is_active == True)
        )
        print("\nUsuarios activos en admin_users:")
        for u in all_users.scalars().all():
            print(f"  - {u.email}  [{u.role}]")


if __name__ == "__main__":
    asyncio.run(main())
