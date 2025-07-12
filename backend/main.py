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

# Garante que o diretório de riffs exista
os.makedirs(RIFF_DIR, exist_ok=True)

# ALTERAÇÃO CRUCIAL AQUI: Mude o prefixo da rota para os arquivos estáticos
# Agora os arquivos de áudio serão acessíveis via URL /audio_files/nome_do_arquivo.webm
app.mount("/audio_files", StaticFiles(directory=RIFF_DIR), name="audio_files")

# Configuração do middleware CORS
# ATENÇÃO: allow_origins=["*"] é INSEGURO para produção.
# Em produção, substitua "*" pela URL específica do seu frontend (ex: "https://seu-app.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permite todas as origens para desenvolvimento
    allow_credentials=True,
    allow_methods=["*"], # Permite todos os métodos HTTP (GET, POST, DELETE, etc.)
    allow_headers=["*"], # Permite todos os cabeçalhos HTTP
)

# Modelos Pydantic para validação de dados
class Riff(BaseModel):
    """
    Modelo Pydantic para representar a estrutura de um riff.
    Define os campos esperados e seus tipos.
    """
    id: str
    name: str
    date: str
    audio_url: str
    duration: float = 0.0 # Adicionado campo de duração para futuras melhorias

class SimilarRiff(BaseModel):
    """
    Modelo Pydantic para representar um riff similar,
    incluindo o objeto Riff completo e sua distância.
    """
    riff: Riff
    distance: float

# Função para carregar riffs salvos do arquivo JSON
def load_riffs():
    """
    Carrega a lista de riffs do arquivo JSON de banco de dados.
    Retorna uma lista vazia se o arquivo não existir.
    """
    if os.path.exists(RIFF_DB):
        with open(RIFF_DB, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# Função para salvar riffs no arquivo JSON
def save_riffs():
    """
    Salva a lista atual de riffs na memória para o arquivo JSON.
    ATENÇÃO: Este método de persistência NÃO é thread-safe e NÃO é recomendado
    para ambientes de produção com concorrência, pois pode levar à corrupção
    de dados ou perda de informações. Considere um banco de dados real.
    """
    with open(RIFF_DB, "w", encoding="utf-8") as f:
        json.dump(riffs, f, indent=4, ensure_ascii=False)

# Inicializa a lista de riffs na memória ao iniciar a aplicação
riffs: List[dict] = load_riffs()

# Função para extrair as features de um arquivo de áudio usando librosa
def extract_features(file_path, target_sr=22050):
    """
    Extrai features de áudio (MFCC, Chroma, Spectral Centroid, Zero Crossing Rate, Tempo)
    de um arquivo de áudio usando a biblioteca librosa.
    Args:
        file_path (str): Caminho para o arquivo de áudio.
        target_sr (int): Taxa de amostragem alvo para resampling do áudio.
                         Garante consistência nas features.
    Returns:
        numpy.ndarray: Um array numpy contendo as features extraídas.
    Raises:
        Exception: Se houver um erro ao carregar ou processar o arquivo de áudio.
    """
    try:
        y, sr = librosa.load(file_path, sr=target_sr) # Resample para target_sr
        # Calcula a duração do áudio
        duration = librosa.get_duration(y=y, sr=sr)

        mfcc = np.mean(librosa.feature.mfcc(y=y, sr=sr).T, axis=0)
        chroma = np.mean(librosa.feature.chroma_stft(y=y, sr=sr).T, axis=0)
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr).T, axis=0)
        zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(y=y).T, axis=0)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

        # Concatena todas as features em um único array
        features = np.hstack([mfcc, chroma, spectral_centroid, zero_crossing_rate, tempo])
        return features, duration
    except Exception as e:
        raise Exception(f"Erro ao extrair features ou duração de {file_path}: {e}")


# Endpoints da API

@app.get("/riffs", response_model=List[Riff])
def get_riffs():
    """
    Retorna todos os riffs armazenados.
    """
    return riffs

@app.post("/riffs", response_model=Riff)
def create_riff(
    name: str = Form(...),
    date: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Cria um novo riff, salva o arquivo de áudio e seus metadados.
    Calcula a duração do áudio e as features para futura otimização.
    """
    riff_id = str(uuid.uuid4())
    # Usa o nome formatado no nome do arquivo para evitar caracteres especiais
    base_filename = os.path.splitext(file.filename)[0]
    safe_filename_part = "".join(c if c.isalnum() else "_" for c in base_filename)
    filename = f"{riff_id}_{safe_filename_part}.webm" # Assumindo que o frontend envia webm
    save_path = os.path.join(RIFF_DIR, filename)

    # Salva o arquivo de áudio no disco
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extrai features e duração do áudio recém-salvo
    try:
        _, duration = extract_features(save_path) # Agora retorna a duração também
    except Exception as e:
        # Em caso de erro na extração, ainda pode salvar o riff sem features/duração
        print(f"Aviso: Erro ao extrair features/duração para {filename}: {e}")
        duration = 0.0 # Define duração como 0 se houver erro

    riff = {
        "id": riff_id,
        "name": name,
        "date": date,
        # ALTERAÇÃO CRUCIAL AQUI: Mude a URL do áudio para o novo prefixo
        "audio_url": f"/audio_files/{filename}",
        "duration": duration # Armazena a duração no riff
    }
    riffs.insert(0, riff) # Adiciona o novo riff no início da lista
    save_riffs() # Salva a lista atualizada de riffs no JSON
    return riff

@app.delete("/riffs/{riff_id}")
def delete_riff(riff_id: str):
    """
    Deleta um riff pelo seu ID, removendo tanto o metadado quanto o arquivo de áudio.
    """
    # Encontra o riff na lista
    riff = next((r for r in riffs if r["id"] == riff_id), None)
    if not riff:
        # Retorna 404 se o riff não for encontrado
        raise HTTPException(status_code=404, detail="Riff não encontrado")

    # AQUI: O audio_url agora começa com /audio_files, então ajustamos o caminho
    # A função os.path.basename() ainda é útil para obter apenas o nome do arquivo.
    audio_path = os.path.join(RIFF_DIR, os.path.basename(riff["audio_url"]))
    if os.path.exists(audio_path):
        os.remove(audio_path)
    else:
        print(f"Aviso: Arquivo de áudio não encontrado para o riff {riff_id} em {audio_path}")


    # Remove o riff da lista em memória e salva
    riffs.remove(riff)
    save_riffs()
    return {"message": "Riff deletado com sucesso"}


@app.get("/similarity/{riff_id}", response_model=List[SimilarRiff])
def get_similar_riffs(riff_id: str, top_k: int = 3):
    """
    Encontra e retorna os riffs mais similares a um riff alvo,
    baseado em features de áudio. Inclui a distância de similaridade.
    """
    target_riff = next((r for r in riffs if r["id"] == riff_id), None)
    if not target_riff:
        raise HTTPException(status_code=404, detail="Riff não encontrado")

    # AQUI: O audio_url agora começa com /audio_files, então ajustamos o caminho
    target_path = os.path.join(RIFF_DIR, os.path.basename(target_riff["audio_url"]))
    
    try:
        # Extrai features do riff alvo (agora retorna duração também, mas não usada aqui)
        target_features, _ = extract_features(target_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Erro ao processar o riff alvo: {e}")

    feature_list = []
    ids = []
    # Cria um dicionário para mapear IDs para objetos Riff completos
    riff_map = {r["id"]: Riff(**r) for r in riffs} # Converte para o modelo Pydantic Riff

    for riff_data in riffs: # Itera sobre os dicionários originais
        current_riff_id = riff_data["id"]
        # AQUI: O audio_url agora começa com /audio_files, então ajustamos o caminho
        path = os.path.join(RIFF_DIR, os.path.basename(riff_data["audio_url"]))
        try:
            features, _ = extract_features(path)
            feature_list.append(features)
            ids.append(current_riff_id)
        except Exception as e:
            # Loga o erro, mas não interrompe a busca por outros riffs
            print(f"Erro ao extrair features do arquivo {current_riff_id}: {e}")

    if not feature_list:
        raise HTTPException(status_code=500, detail="Não foi possível extrair features de nenhum riff válido.")

    X = np.array(feature_list)
    # Ajusta n_neighbors para ser no máximo o número de amostras disponíveis
    model = NearestNeighbors(n_neighbors=min(top_k + 1, len(X)))
    model.fit(X)

    # Calcula distâncias e índices dos vizinhos mais próximos
    # Retorna uma array de arrays, por isso distances[0] e indices[0]
    distances, indices = model.kneighbors([target_features])

    similar_riffs_with_dist = []
    # Itera sobre os resultados (distância e índice)
    # `enumerate` é importante para associar a distância ao índice correto
    for i, idx_in_features_list in enumerate(indices[0]):
        similar_id = ids[idx_in_features_list] # Pega o ID do riff usando o índice
        
        # Ignora o próprio riff alvo
        if similar_id != riff_id:
            # Encontra o objeto Riff completo usando o ID e o mapa
            similar_riff_obj = riff_map.get(similar_id)
            if similar_riff_obj:
                similar_riffs_with_dist.append(
                    SimilarRiff(
                        riff=similar_riff_obj,
                        distance=distances[0][i] # Pega a distância correspondente
                    )
                )
    return similar_riffs_with_dist

