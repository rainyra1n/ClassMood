from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse
from jose import jwt
from app.db import SessionLocal, MediaFile, User, MediaAnalysis
import os
from pathlib import Path
from app.alg.engine import analyze_file
import logging
logging.basicConfig(
    level=logging.INFO,  # или DEBUG, если нужно ещё детальнее
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
router = APIRouter()
oauth2_scheme =OAuth2PasswordBearer(tokenUrl="/auth/token")
SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=400, detail="Invalid authentication")
        return username
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/upload")
async def upload(
        files: list[UploadFile] = File(...),
        user: str = Depends(get_current_user)
):
    """Upload one or more files and save records in the database."""
    db = SessionLocal()
    try:
        # Verify the user exists
        user_obj = db.query(User).filter(User.username == user).first()
        if not user_obj:
            raise HTTPException(status_code=404, detail="User not found")

        results = []
        for file in files:
            # Build a simple unique filename (prefix with user ID)
            safe_filename = f"{user_obj.id}_{file.filename}"
            filepath = UPLOAD_DIR / safe_filename
            # Save content to disk
            with open(filepath, "wb") as f:
                f.write(file.file.read())

            # Create a DB record for the upload
            media = MediaFile(filename=file.filename, filepath=str(filepath), user_id=user_obj.id)
            db.add(media)
            db.commit()
            results.append({"filename": file.filename, "path": str(filepath)})
        return {"user": user, "results": results}
    finally:
        db.close()

@router.get("/files")
async def get_user_files(user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        use_obj = db.query(User).filter(User.username == user).first()
        if not use_obj:
            raise HTTPException(status_code=404, detail="User not found")
        files = db.query(MediaFile).filter(MediaFile.user_id == use_obj.id).all()
        return {"user": user,
            "files": [
                {"id": f.id, "filename": f.filename, "uploaded_at": f.uploaded_at}
                for f in files
            ]
        }
    finally:
        db.close()


@router.delete("/files/{file_id}")
async def delete_file(file_id: int, user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user_obj = db.query(User).filter(User.username == user).first()
        if not user_obj:
            raise HTTPException(status_code=404, detail="User not found")

        file = db.query(MediaFile).filter(MediaFile.id == file_id, MediaFile.user_id == user_obj.id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")

        filepath = Path(file.filepath)
        if filepath.exists():
            filepath.unlink()

        db.delete(file)
        db.commit()
        return {"msg": "File deleted"}
    finally:
        db.close()


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user_obj = db.query(User).filter(User.username == user).first()
        if not user_obj:
            raise HTTPException(status_code=404, detail="User not found")

        file = db.query(MediaFile).filter(MediaFile.id == file_id, MediaFile.user_id == user_obj.id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")

        filepath = Path(file.filepath)
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(path=str(filepath), filename=file.filename)
    finally:
        db.close()


@router.get("/files/{file_id}/analyze")
async def analyze_media_file(file_id: int, user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user_obj = db.query(User).filter(User.username == user).first()
        if not user_obj:
            raise HTTPException(status_code=404, detail="User not found")

        file = db.query(MediaFile).filter(MediaFile.id == file_id, MediaFile.user_id == user_obj.id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        existing_analysis = db.query(MediaAnalysis).filter(
            MediaAnalysis.file_id == file_id
        ).first()

        if existing_analysis:
            logging.info("Returning cached analysis for file_id=%s", file_id)
            return {"series": existing_analysis.series}

        filepath = Path(file.filepath)
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Stored file is missing")

        result = analyze_file(file.filepath)

        if not isinstance(result, dict) or "series" not in result:
            logging.warning("analyze_file returned invalid result for file_id=%s", file_id)
            raise HTTPException(status_code=500, detail="Invalid analysis result")

        series = result["series"]
        if not isinstance(series, list):
            raise HTTPException(status_code=500, detail="Series must be a list")

        new_analysis = MediaAnalysis(
            file_id=file_id,
            series=series
        )
        db.add(new_analysis)
        db.commit()
        db.refresh(new_analysis)

        try:
            if series:
                vals = [float(p.get("value", 0.0)) for p in series]
                times = [float(p.get("t", 0.0)) for p in series]
                avg = sum(vals) / len(vals)
                vmin, vmax = min(vals), max(vals)
                tmin, tmax = min(times), max(times)
                logging.info(
                    "Analyzed & cached file_id=%s len=%d avg=%.4f min=%.4f max=%.4f t=[%.3f..%.3f]",
                    file_id, len(series), avg, vmin, vmax, tmin, tmax
                )
                logging.info("Sample points: %s", series[:5])
            else:
                logging.warning("Empty series for file_id=%s", file_id)
        except Exception as e:
            logging.exception("Failed to log analysis stats: %s", e)

        return result

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logging.exception("Unexpected error during analysis: %s", e)
        raise HTTPException(status_code=500, detail="Analysis failed")
    finally:
        db.close()