from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, Response
import os
from app.db import init_db
from app.auth.routes import router as auth_router
from app.media.routes import router as media_router
from uuid import uuid4

app = FastAPI()

@app.on_event("startup")
def startup():
    init_db()

BOOT_ID = str(uuid4())


app.mount("/static",StaticFiles(directory="app/static"),name="static")
@app.get("/")
async def read_root():
    return FileResponse(os.path.join("app", "static", "index.html"))


@app.get("/auth")
async def read_auth():
    return FileResponse(os.path.join("app", "static", "index.html"))


@app.get("/upload")
async def read_upload():
    return FileResponse(os.path.join("app", "static", "upload.html"))


@app.get("/profile")
async def read_profile():
    return FileResponse(os.path.join("app", "static", "profile.html"))

# @app.get("/app")
# async def read_react_app():
#     return RedirectResponse(url="/auth", status_code=307)

@app.get("/algorithm")
async def read_algorithm():
    """Return the algorithm HTML page."""
    return FileResponse(os.path.join("app", "static", "algorithm.html"))


@app.get("/meta/boot")
async def get_boot_id():
    return {"boot_id": BOOT_ID}

app.include_router(auth_router, prefix="/auth")
app.include_router(media_router, prefix="/media")