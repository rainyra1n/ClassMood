import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = "postgresql://admin:'go-away-please_1984'@localhost:5432/classmood_db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    audio_sample_path = Column(String, nullable=True)
    hashed_password = Column(String)


class MediaFile(Base):
    __tablename__ = "media_files"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    filepath = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

class MediaAnalysis(Base):
    __tablename__ = "media_analyses"
    id = Column(Integer, primary_key=True)
    file_id = Column(Integer, ForeignKey("media_files.id"), unique=True)
    series = Column(JSON)
    # можно добавить avg, min, max как отдельные колонки для быстрых запросов
def init_db():
    Base.metadata.create_all(bind=engine)
