from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import os
import shutil
import uuid
import json
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Diretórios e arquivos
RIFF_DIR = "riffs"
RIFF_DB = "riffs.json"

os.makedirs(RIFF_DIR, exist_ok=True)
app.mount("/riffs", StaticFiles(directory=RIFF_DIR), name="riffs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Riff(BaseModel):
    id: str
    name: str
    date: str
    audio_url: str

# Carregar riffs do JSON
def load_riffs():
    if os.path.exists(RIFF_DB):
        with open(RIFF_DB, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# Salvar riffs no JSON
def save_riffs():
    with open(RIFF_DB, "w", encoding="utf-8") as f:
        json.dump(riffs, f, indent=4, ensure_ascii=False)

# Lista em memória carregada do disco
riffs: List[dict] = load_riffs()

@app.get("/riffs", response_model=List[Riff])
def get_riffs():
    return riffs

@app.post("/riffs", response_model=Riff)
def create_riff(
    name: str = Form(...),
    date: str = Form(...),
    file: UploadFile = File(...)
):
    riff_id = str(uuid.uuid4())
    filename = f"{riff_id}_{file.filename}"
    save_path = os.path.join(RIFF_DIR, filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    riff = {
        "id": riff_id,
        "name": name,
        "date": date,
        "audio_url": f"/riffs/{filename}"
    }
    riffs.insert(0, riff)
    save_riffs()
    return riff

@app.delete("/riffs/{riff_id}")
def delete_riff(riff_id: str):
    riff = next((r for r in riffs if r["id"] == riff_id), None)
    if not riff:
        raise HTTPException(status_code=404, detail="Riff não encontrado")

    audio_path = os.path.join(RIFF_DIR, os.path.basename(riff["audio_url"]))
    if os.path.exists(audio_path):
        os.remove(audio_path)

    riffs.remove(riff)
    save_riffs()
    return {"message": "Riff deletado com sucesso"}

