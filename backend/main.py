from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import os
import shutil
import uuid
import json

import numpy as np
from sklearn.neighbors import NearestNeighbors
import librosa
import soundfile as sf


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

# Função para carregar riffs salvos
def load_riffs():
    if os.path.exists(RIFF_DB):
        with open(RIFF_DB, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# Função para salvar riffs no JSON
def save_riffs():
    with open(RIFF_DB, "w", encoding="utf-8") as f:
        json.dump(riffs, f, indent=4, ensure_ascii=False)

# Inicializa a lista em memória
riffs: List[dict] = load_riffs()

# Endpoints
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

#função similaridade
# Função para extrair as features de um arquivo
def extract_features(file_path):
    y, sr = librosa.load(file_path, sr=None)

    mfcc = np.mean(librosa.feature.mfcc(y=y, sr=sr).T, axis=0)
    chroma = np.mean(librosa.feature.chroma_stft(y=y, sr=sr).T, axis=0)
    spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr).T, axis=0)
    zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(y=y).T, axis=0)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

    features = np.hstack([mfcc, chroma, spectral_centroid, zero_crossing_rate, tempo])
    return features

# Nova rota de similaridade
@app.get("/similarity/{riff_id}")
def get_similar_riffs(riff_id: str, top_k: int = 3):
    target_riff = next((r for r in riffs if r["id"] == riff_id), None)
    if not target_riff:
        raise HTTPException(status_code=404, detail="Riff não encontrado")

    # Extrai features do riff alvo
    target_path = os.path.join(RIFF_DIR, os.path.basename(target_riff["audio_url"]))
    target_features = extract_features(target_path)

    feature_list = []
    ids = []

    for riff in riffs:
        path = os.path.join(RIFF_DIR, os.path.basename(riff["audio_url"]))
        try:
            features = extract_features(path)
            feature_list.append(features)
            ids.append(riff["id"])
        except Exception as e:
            print(f"Erro ao extrair features do arquivo {riff['id']}: {e}")

    if not feature_list:
        raise HTTPException(status_code=500, detail="Não foi possível extrair features dos riffs.")

    X = np.array(feature_list)
    model = NearestNeighbors(n_neighbors=min(top_k + 1, len(X)))
    model.fit(X)

    distances, indices = model.kneighbors([target_features])

    similar_riffs = []
    for idx in indices[0]:
        similar_id = ids[idx]
        if similar_id != riff_id:
            similar_riffs.append(next(r for r in riffs if r["id"] == similar_id))

    return similar_riffs
