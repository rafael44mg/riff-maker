import { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [riffName, setRiffName] = useState('');
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  useEffect(() => {
    fetchRiffs();
  }, []);

  const fetchRiffs = async () => {
    try {
      const response = await axios.get(`${API_URL}/riffs`);
      setRecordings(response.data);
    } catch (error) {
      console.error('Erro ao buscar riffs:', error);
    }
  };

  const startRecording = async () => {
    if (!riffName.trim()) {
      alert("Digite um nome para o riff antes de gravar.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        mediaChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        const now = new Date();
        const formattedName = riffName.trim().replace(/\s+/g, '_');

        const formData = new FormData();
        formData.append('file', blob, `${formattedName}.webm`);
        formData.append('name', riffName.trim());
        formData.append('date', now.toISOString());

        try {
          await axios.post(`${API_URL}/riffs`, formData);
          fetchRiffs();
          console.log('Áudio enviado com sucesso!');
          setRiffName('');
        } catch (error) {
          console.error('Erro ao enviar o áudio:', error);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        setSeconds(0);
        setIsRecording(false);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      } else {
        console.warn('MediaRecorder não está gravando no momento.');
        setIsRecording(false);
      }
    }
  };

  const deleteRiff = async (id) => {
    try {
      await axios.delete(`${API_URL}/riffs/${id}`);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Erro ao deletar riff:", err);
    }
  };

  const compareRiff = async (riff) => {
  try {
    const response = await axios.get(`https://riff-maker.onrender.com${riff.audio_url}`, { responseType: 'blob' });
    const formData = new FormData();
    formData.append('file', response.data, 'riff.webm');

    const compareResponse = await axios.post('https://riff-maker.onrender.com/compare_riff/', formData);
    console.log('Riffs similares:', compareResponse.data.similar_riffs);
    alert('Riffs similares:\n' + compareResponse.data.similar_riffs.map(r => `${r.name} (distância: ${r.distance.toFixed(2)})`).join('\n'));
  } catch (error) {
    console.error('Erro na comparação:', error);
    alert('Erro ao comparar riffs.');
  }
};

  return (
    <div className="app">
      <header>
        <h1>🎸 Riff Maker</h1>
        <nav>
          <button>Home</button>
          <button>Meus Riffs</button>
          <button>Criar Novo</button>
          <button>Explorar Biblioteca</button>
          <button>Configurações</button>
          <span className="user-icon">👤</span>
        </nav>
      </header>

      <main>
        <section className="metrics">
          <div>📂 Riffs Criados: {recordings.length}</div>
          <div>🌟 Favoritos: 0</div>
          <div>⏱️ Tempo Total Gravado: {recordings.reduce((acc, rec) => acc + (rec.duration || 0), 0)}s</div>
          <div>🎧 Último Acessado: {recordings[0]?.name || '-'}</div>
        </section>

        <section className="recorder">
          <h2>🎙️ Criar Novo Riff</h2>
          <input
            type="text"
            value={riffName}
            onChange={(e) => setRiffName(e.target.value)}
            placeholder="Digite o nome do riff"
            disabled={isRecording}
            className="riff-name-input"
          />
          {!isRecording ? (
            <button onClick={startRecording}>🎤 Gravar</button>
          ) : (
            <button onClick={stopRecording}>⏹️ Parar ({seconds}s)</button>
          )}
          {isRecording && <p className="recording-indicator">🔴 Gravando...</p>}
        </section>

        <section className="library">
          <h3>🎵 Biblioteca de Riffs</h3>
          <div className="riff-list">
            {recordings.map((riff) => (
              <div className="riff-card" key={riff.id}>
                <p><strong>{riff.name}</strong></p>
                <p>{new Date(riff.date).toLocaleString()}</p>
                <audio controls src={`${API_URL}${riff.audio_url}`}></audio>
                <div className="actions">
                  <button>⭐</button>
                  <a href={`${API_URL}${riff.audio_url}`} download>
                    <button>⬇️</button>
                  </a>
                  <button onClick={() => compareRiff(riff)}>🔍 Similaridade</button>
                  <button onClick={() => deleteRiff(riff.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;






