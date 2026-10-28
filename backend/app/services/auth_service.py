"""Сервис аутентификации: регистрация, логин, JWT."""

import uuid
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

from sqlalchemy import select

from app.core.config import get_settings
from app.db.models import User
from app.db.session import AsyncSession

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    def __init__(self, session: AsyncSession, redis, jwt_secret: str) -> None:
        self.session = session
        self.redis = redis
        self.jwt_secret = jwt_secret

    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

    async def register(
        self,
        email: str,
        password: str,
        name: str,
        role: str,
        team: str,
    ) -> dict:
        existing = await self.session.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            raise ValueError("email already registered")

        user = User(
            email=email,
            name=name,
            password_hash=self.hash_password(password),
            role=role,
            team=team,
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "team": user.team,
        }

    async def login(self, email: str, password: str) -> dict:
        result = await self.session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user or not self.verify_password(password, user.password_hash):
            raise ValueError("invalid credentials")

        token = self._create_token(user)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "role": user.role,
                "team": user.team,
            },
        }

    async def get_current_user(self, token: str) -> dict:
        from jose import jwt, JWTError

        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
            user_id = payload.get("sub")
            if not user_id:
                raise JWTError("missing sub")
        except JWTError:
            raise ValueError("invalid token")

        result = await self.session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("user not found")
        return {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "team": user.team,
        }

    async def list_users(self) -> dict:
        result = await self.session.execute(
            select(User).order_by(User.created_at.desc())
        )
        users = result.scalars().all()
        return {
            "items": [
                {
                    "id": str(u.id),
                    "email": u.email,
                    "name": u.name,
                    "role": u.role,
                    "team": u.team,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ]
        }

    def _create_token(self, user: User) -> str:
        from jose import jwt

        now = datetime.now(timezone.utc)
        expire = now + timedelta(hours=24)
        to_encode = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "iat": int(now.timestamp()),
            "exp": int(expire.timestamp()),
        }
        return jwt.encode(to_encode, self.jwt_secret, algorithm="HS256")
