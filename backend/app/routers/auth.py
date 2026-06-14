"""
Cargofy -- Auth Router
POST /api/v1/auth/login   -- passwordless demo login / email+password
POST /api/v1/auth/signup  -- create new user account
GET  /api/v1/auth/me      -- return current user info from token
"""

import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import User
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response schemas ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str = Field(..., examples=["demo@cargofy.ai"])
    password: str = Field(..., min_length=4, examples=["cargofy2026"])
    name: Optional[str] = Field(None, examples=["Demo Owner"])
    phone: Optional[str] = Field(None, examples=["+919999999999"])

class SignupRequest(BaseModel):
    name: str = Field(..., min_length=2, examples=["Ravi Kumar"])
    email: str = Field(..., examples=["ravi@example.com"])
    password: str = Field(..., min_length=6, examples=["secure123"])
    phone: Optional[str] = Field(None, examples=["+919876543210"])
    business_name: Optional[str] = Field(None, examples=["Kumar Dairy"])
    business_type: Optional[str] = Field(None, examples=["dairy"])

class AuthResponse(BaseModel):
    user_id: str
    name: str
    email: str
    phone: Optional[str] = None
    business_name: Optional[str] = None
    token: str
    is_new: bool = False


# ── Helpers ─────────────────────────────────────────────────────────────────

def _make_token(user_id: str) -> str:
    """Simple deterministic demo token (not production JWT)."""
    import hashlib
    raw = f"{user_id}:{settings.SECRET_KEY}"
    return "cargofy-" + hashlib.sha256(raw.encode()).hexdigest()[:32]


def _get_or_create_by_email(db: Session, email: str, name: str, phone: Optional[str]) -> tuple[User, bool]:
    """Find user by email-derived phone key or create."""
    import hashlib
    # Derive a stable 15-char pseudo-phone from the email (for email-only accounts)
    pseudo_phone = phone or ("e" + hashlib.md5(email.encode()).hexdigest()[:13])

    user = db.query(User).filter(User.phone == pseudo_phone).first()
    if user:
        return user, False

    user = User(
        name=name or email.split("@")[0].title(),
        phone=pseudo_phone,
        business_name=None,
        business_type=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login (demo mode -- any email + 4+ char password)",
)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Demo-mode login: any valid email + password >= 4 chars is accepted.
    Returns a stable token derived from user ID + secret key.
    Replace with real bcrypt + JWT for production.
    """
    email = body.email.strip().lower()
    if not email or len(body.password) < 4:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email aur password sahi nahi hai.",
        )

    user, is_new = _get_or_create_by_email(
        db, email,
        name=body.name or "",
        phone=body.phone,
    )

    return AuthResponse(
        user_id=str(user.id),
        name=user.name,
        email=email,
        phone=user.phone if (user.phone and not user.phone.startswith("email:")) else None,
        business_name=user.business_name,
        token=_make_token(str(user.id)),
        is_new=is_new,
    )


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Cargofy account",
)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """Create a new user account. Phone (if provided) must be unique."""
    email = body.email.strip().lower()
    # Derive a stable phone surrogate capped at 15 chars (DB column limit)
    if body.phone:
        phone = body.phone.strip()
    else:
        import hashlib
        phone = ("e" + hashlib.md5(email.encode()).hexdigest()[:13])  # 14 chars, unique, safe

    # Check for duplicate phone
    existing = db.query(User).filter(User.phone == phone).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yeh phone number already registered hai.",
        )

    user = User(
        name=body.name.strip(),
        phone=phone,
        business_name=body.business_name,
        business_type=body.business_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return AuthResponse(
        user_id=str(user.id),
        name=user.name,
        email=email,
        phone=body.phone,
        business_name=user.business_name,
        token=_make_token(str(user.id)),
        is_new=True,
    )


@router.get("/me", summary="Get current user info from token")
def get_me(token: str = "", db: Session = Depends(get_db)):
    """Lightweight user-info endpoint for dashboard hydration."""
    if not token or not token.startswith("cargofy-"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"status": "authenticated", "token": token}
