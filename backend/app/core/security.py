from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from sqlalchemy.orm import Session
import logging

from app.core.config import settings
from app.db.session import get_db
from app.models.models import User

logger = logging.getLogger(__name__)

security = HTTPBearer()

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Validates the Supabase JWT token and retrieves the corresponding user from the database.
    If the user does not exist in the database, it creates a new one using the Supabase auth info.
    """
    token = credentials.credentials
    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid auth token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        sb_user = res.user
        email = sb_user.email
        phone = sb_user.phone
        
        user = db.query(User).filter(User.id == sb_user.id).first()
        
        if not user:
            if phone:
                user = db.query(User).filter(User.phone == phone).first()
            
            if not user:
                user = User(
                    id=sb_user.id,
                    name=sb_user.user_metadata.get("name", email.split("@")[0] if email else "User"),
                    phone=phone or f"auth-{sb_user.id[:10]}",
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                
        return user

    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
