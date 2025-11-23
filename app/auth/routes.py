import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta
from app.db import SessionLocal, User
from app.auth.utils import verify_password
import os

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def create_access_token(data: dict):
    """Create a short-lived JWT token with an expiration claim (exp)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == form_data.username).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Invalid credentials")

        access_token = create_access_token(data={"sub": user.username})
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        db.close()

class UserCreate(BaseModel):

    username: str
    password: str

@router.post("/register")
def register(user: UserCreate):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == user.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="User already exists")

        hashed = bcrypt.hashpw(user.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        new_user = User(username=user.username, hashed_password=hashed)
        db.add(new_user)
        db.commit()
        return{"msg":"User created successfully"}
    finally:
        db.close()

@router.get("/me")
def read_me(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str =payload.get("sub")
        if username is None:
            raise HTTPException(status_code=400, detail="Invalid authentication")
        return {"username": username}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

