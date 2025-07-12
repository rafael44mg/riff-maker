import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactDOM from 'react-dom'; // <--- Importe ReactDOM aqui
// Importação do CSS. Certifique-se de que este arquivo existe E está no diretório CORRETO.
import './App.css';

/**
 * IMPORTANTE: ATENÇÃO AOS AVISOS E ERROS DE COMPILAÇÃO
 *
 * 1. AVISO "import.meta":
 * Este aviso ("import.meta" is not available in the configured target environment ("es2015")
 * e ficará vazio [empty-import-meta]") NÃO é um erro no seu código React em si,
 * mas um ALERTA de que o seu ambiente de build (Vite) está configurado para gerar código
 * JavaScript para uma versão muito antiga (ES2015), que não suporta 'import.meta.env'.
 *
 * PARA RESOLVER:
 * - No seu 'vite.config.js' (na raiz do projeto):
 * Certifique-se de que 'build.target' esteja definido para 'es2020' ou 'esnext'.
 * Exemplo:
 * import { defineConfig } from 'vite';
 * import react from '@vitejs/plugin-react';
 * export default defineConfig({
 * plugins: [react()],
 * build: {
 * target: 'es2020' // <-- Mude ou adicione esta linha. Ou 'esnext' para o mais recente.
 * }
 * });
 *
 * 2. ERRO "Could not resolve "./App.css"":
 * Este erro significa que o compilador não consegue encontrar o arquivo 'App.css'
 * no caminho especificado ('./App.css').
 *
 * PARA RESOLVER:
 * - Certifique-se de que o arquivo 'App.css' (cujo conteúdo está abaixo)
 * está na MESMA PASTA que o seu arquivo 'App.jsx'.
 * Tipicamente, ambos ficam dentro da pasta 'src/'.
 *
 * 3. CONFIGURAÇÃO DA VARIÁVEL DE AMBIENTE:
 * - Verifique se você tem um arquivo '.env' (ou '.env.local' para ambiente local)
 * na RAIZ do seu projeto.
 * O conteúdo deve ser:
 * VITE_API_URL=http://localhost:8000
 * (Para testes LOCAL, se o backend está rodando em 8000, ou 127.0.0.1:8000).
 *
 * 4. REINICIE O SERVIDOR:
 * - Após QUALQUER alteração em 'vite.config.js' ou nos arquivos '.env',
 * é FUNDAMENTAL parar (Ctrl+C) e REINICIAR o servidor de desenvolvimento
 * (geralmente com 'npm run dev' ou 'yarn dev').
 */
const API_URL = import.meta.env.VITE_API_URL;

function App() {
  // Estados para gravação e dados da aplicação
  const [isRecording, setIsRecording] = useState(false); // Indica se a gravação está ativa
  const [recordings, setRecordings] = useState([]); // Armazena a lista de riffs do backend
  const [seconds, setSeconds] = useState(0); // Contador de tempo da gravação
  const [riffName, setRiffName] = useState(''); // Nome do riff a ser gravado
  const [showModal, setShowModal] = useState(false); // Para controlar a visibilidade de um modal personalizado
  const [modalMessage, setModalMessage] = useState(''); // Mensagem para o modal
  const [similarRiffsData, setSimilarRiffsData] = useState([]); // Para armazenar dados de riffs similares (com { riff, distance })

  // Refs para MediaRecorder e Stream
  const mediaRecorderRef = useRef(null); // Referência ao objeto MediaRecorder
  const mediaChunksRef = useRef([]); // Array para armazenar os pedaços de áudio
  const timerRef = useRef(null); // Referência para o timer de gravação
  const streamRef = useRef(null); // Referência para a stream de áudio do microfone

  // Efeito para gerenciar o timer de gravação
  useEffect(() => {
    if (isRecording) {
      // Inicia o timer quando a gravação começa
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      // Limpa o timer quando a gravação para
      clearInterval(timerRef.current);
    }
    // Função de cleanup para garantir que o timer seja limpo ao desmontar o componente ou ao mudar isRecording
    return () => clearInterval(timerRef.current);
  }, [isRecording]); // Dependência: executa quando isRecording muda

  // Efeito para buscar os riffs do backend ao carregar o componente
  useEffect(() => {
    fetchRiffs();
  }, []); // Dependência vazia: executa apenas uma vez no montagem do componente

  /**
   * Função para buscar a lista de riffs do backend.
   */
  const fetchRiffs = async () => {
    // Adicionado tratamento de erro para API_URL indefinida
    if (!API_URL) {
      console.error('API_URL não está definida. Verifique seu arquivo .env e a configuração do Vite.');
      showCustomModal('Erro: A URL da API não está configurada. Por favor, verifique as configurações.');
      return;
    }
    try {
      // Faz a requisição GET para a API de riffs
      const response = await axios.get(`${API_URL}/riffs`);
      // Atualiza o estado com os dados recebidos.
      // Inverte a ordem para mostrar os mais recentes primeiro, se o backend não fizer isso.
      setRecordings(response.data.reverse());
    } catch (error) {
      console.error('Erro ao buscar riffs:', error);
      // Exibe uma mensagem de erro ao usuário usando o modal personalizado
      showCustomModal('Erro ao buscar riffs. Por favor, tente novamente.');
    }
  };

  /**
   * Função para iniciar a gravação do áudio.
   */
  const startRecording = async () => {
    // Adicionado tratamento de erro para API_URL indefinida
    if (!API_URL) {
      console.error('API_URL não está definida. Não é possível iniciar a gravação.');
      showCustomModal('Erro: A URL da API não está configurada. Não é possível iniciar a gravação.');
      return;
    }

    // Valida se o nome do riff foi digitado
    if (!riffName.trim()) {
      showCustomModal("Por favor, digite um nome para o riff antes de gravar.");
      return;
    }

    try {
      // Solicita acesso ao microfone do usuário
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // Armazena a stream para poder parar as tracks depois
      mediaRecorderRef.current = new MediaRecorder(stream); // Cria o objeto MediaRecorder
      mediaChunksRef.current = []; // Limpa os pedaços de áudio anteriores

      // Evento disparado quando há dados de áudio disponíveis
      mediaRecorderRef.current.ondataavailable = (e) => {
        mediaChunksRef.current.push(e.data); // Adiciona os pedaços de áudio ao array
      };

      // Evento disparado quando a gravação é parada
      mediaRecorderRef.current.onstop = async () => {
        // Cria um Blob (objeto de arquivo) com os pedaços de áudio gravados
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        const now = new Date(); // Pega a data e hora atual
        // Formata o nome do riff para ser um nome de arquivo válido
        const formattedName = riffName.trim().replace(/\s+/g, '_').toLowerCase();

        // Cria um objeto FormData para enviar o arquivo e outros dados
        const formData = new FormData();
        formData.append('file', blob, `${formattedName}.webm`); // O arquivo de áudio
        formData.append('name', riffName.trim()); // O nome do riff
        formData.append('date', now.toISOString()); // A data da gravação

        try {
          // Envia o áudio e os metadados para o backend
          await axios.post(`${API_URL}/riffs`, formData);
          fetchRiffs(); // Atualiza a lista de riffs após o upload
          console.log('Áudio enviado com sucesso!');
          showCustomModal('Riff gravado e enviado com sucesso!');
          setRiffName(''); // Limpa o campo do nome do riff
        } catch (error) {
          console.error('Erro ao enviar o áudio:', error);
          showCustomModal('Erro ao enviar o riff. Por favor, tente novamente.');
        } finally {
          // Garante que a stream do microfone seja fechada após o upload
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          setSeconds(0); // Reseta o contador de segundos
          setIsRecording(false); // Define o estado de gravação como falso
        }
      };

      mediaRecorderRef.current.start(); // Inicia a gravação
      setIsRecording(true); // Define o estado de gravação como verdadeiro
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      showCustomModal('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  /**
   * Função para parar a gravação do áudio.
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop(); // Para a gravação
    } else {
      console.warn('MediaRecorder não está gravando no momento.');
      setIsRecording(false); // Garante que o estado de gravação seja falso
    }
  };

  /**
   * Função para deletar um riff do backend.
   * @param {string} id - O ID do riff a ser deletado.
   */
  const deleteRiff = async (id) => {
    // Adicionado tratamento de erro para API_URL indefinida
    if (!API_URL) {
      console.error('API_URL não está definida. Não é possível deletar o riff.');
      showCustomModal('Erro: A URL da API não está configurada. Não é possível deletar.');
      return;
    }
    // Adiciona uma confirmação antes de deletar
    if (!window.confirm("Tem certeza que deseja deletar este riff?")) {
      return; // Cancela a operação se o usuário não confirmar
    }
    try {
      await axios.delete(`${API_URL}/riffs/${id}`);
      // Remove o riff da lista localmente para uma atualização mais rápida da UI
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      !window.confirm('Riff deletado com sucesso!');
    } catch (err) {
      console.error("Erro ao deletar riff:", err);
      showCustomModal('Erro ao deletar riff. Por favor, tente novamente.');
    }
  };

/**
 * Função para comparar um riff com outros e encontrar similaridades.
 * @param {object} riff - O objeto riff a ser comparado.
 */
const compareRiff = async (riff) => {
  if (!API_URL) {
    console.error('API_URL não está definida. Não é possível comparar riffs.');
    showCustomModal('Erro: A URL da API não está configurada. Não é possível comparar.');
    return;
  }

  console.log("Função compareRiff chamada para:", riff); // <-- Debug

  try {
    const response = await axios.get(`${API_URL}/similarity/${riff.id}`);
    console.log("Resposta da similaridade:", response.data); // <-- Debug

    const top3SimilarRiffs = response.data
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    setSimilarRiffsData(top3SimilarRiffs);

    let message = `Riffs similares ao riff "${riff.name}":`;
    if (!top3SimilarRiffs || top3SimilarRiffs.length === 0) {
      message += '\nNenhum riff similar encontrado.';
    }

    showCustomModal(message);
  } catch (error) {
    console.error('Erro na comparação:', error);
    showCustomModal('Erro ao comparar riffs. Verifique o console para detalhes.');
  }
};

// ... (showCustomModal e closeCustomModal permanecem os mesmos)
// Exibe o modal com uma mensagem
const showCustomModal = (message) => {
  setModalMessage(message);
  setShowModal(true);
};

// Fecha o modal e limpa dados de similaridade
const closeCustomModal = () => {
  setShowModal(false);
  setSimilarRiffsData([]);
};

return (
  <div className="app bg-gradient-to-br from-gray-900 to-black min-h-screen text-white font-inter p-4 sm:p-6 lg:p-8 rounded-lg shadow-xl">
    {/* Modal Personalizado */}
    {showModal && ReactDOM.createPortal (
      <div className="custom-modal-overlay">
        <div className="custom-modal-content">
          <h3 className="custom-modal-title">Riff Similaridade</h3> {/* Título mais descritivo */}
          <p className="custom-modal-message">{modalMessage}</p> {/* Esta é a mensagem "Riffs similares ao riff 'NomeDoRiff':" */}

          {/* Renderiza o bloco de detalhes apenas se houver riffs similares */}
          {similarRiffsData && similarRiffsData.length > 0 && (
            <div className="similar-riffs-details">
              {/* Você pode remover o h4 "Detalhes dos Riffs Similares:" se a mensagem acima já for clara o suficiente */}
              {/* <h4 className="similar-riffs-title">Detalhes dos Riffs Similares:</h4> */}
              <ul className="similar-riffs-list">
                {/* Aqui, o loop já está usando 'similarRiffsData' que agora só contém os 3 primeiros */}
                {similarRiffsData.map((item) => (
                  <li key={item.riff.id}>
                    <strong>{item.riff.name}</strong> (Distância: {item.distance.toFixed(2)})
                    {item.riff.audio_url ? (
                      <audio controls src={`${API_URL}/audio_files/${item.riff.audio_url.split('/').pop()}`} className="riff-audio-player"></audio>
                    ) : (
                      <p className="text-sm text-red-400">Sem áudio disponível</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Botão Fechar */}
          <button
            onClick={closeCustomModal}
            className="custom-modal-close-button"
          >
            Fechar
          </button>
        </div>
      </div>,
      document.body // <--- Renderiza este JSX diretamente no body do documento
    )}

      <header className="text-center mb-8">
        <h1 className="text-5xl font-extrabold text-orange-500 drop-shadow-lg mb-4">
          🎸 Riff Maker
        </h1>
        <p className="text-gray-400 text-lg">Crie, gerencie e descubra riffs de guitarra com facilidade.</p>
        <nav className="mt-6 flex flex-wrap justify-center gap-4">
          <button className="nav-button">Home</button>
          <button className="nav-button">Meus Riffs</button>
          <button className="nav-button">Criar Novo</button>
          <button className="nav-button">Explorar Biblioteca</button>
          <button className="nav-button">Configurações</button>
          <span className="user-icon text-orange-400 text-3xl ml-4">👤</span>
        </nav>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="metrics p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700 col-span-1 lg:col-span-1">
          <h2 className="text-3xl font-bold mb-4 text-orange-400">📊 Estatísticas Rápidas</h2>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-center text-lg"><span className="text-orange-300 mr-3">📂</span> Riffs Criados: <span className="font-semibold ml-2">{recordings.length}</span></div>
            <div className="flex items-center text-lg"><span className="text-orange-300 mr-3">🌟</span> Favoritos: <span className="font-semibold ml-2">0</span></div>
            {/* Calcula a duração total somando as durações individuais dos riffs, se disponíveis */}
            <div className="flex items-center text-lg">
                <span className="text-orange-300 mr-3">⏱️</span> Tempo Total Gravado:{' '}
                <span className="font-semibold ml-2">
                    {/* Acessa riff.duration */}
                    {Math.floor(recordings.reduce((acc, rec) => acc + (rec.duration || 0), 0) / 60)}m{' '}
                    {Math.round(recordings.reduce((acc, rec) => acc + (rec.duration || 0), 0) % 60)}s
                </span>
            </div>
            <div className="flex items-center text-lg"><span className="text-orange-300 mr-3">🎧</span> Último Acessado: <span className="font-semibold ml-2">{recordings[0]?.name || '-'}</span></div>
          </div>
        </section>

        <section className="recorder p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700 col-span-1 lg:col-span-2">
          <h2 className="text-3xl font-bold mb-6 text-orange-400 flex items-center">
            <span className="text-4xl mr-3">🎙️</span> Criar Novo Riff
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mb-6">
            <input
              type="text"
              value={riffName}
              onChange={(e) => setRiffName(e.target.value)}
              placeholder="Digite o nome do riff"
              disabled={isRecording}
              className="riff-name-input bg-gray-700 text-white placeholder-gray-400 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition duration-200 flex-grow"
            />
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="record-button bg-gradient-to-r from-green-500 to-lime-600 hover:from-green-600 hover:to-lime-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center min-w-[120px]"
              >
                <span className="mr-2 text-2xl">🎤</span> Gravar
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="stop-button bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center min-w-[120px]"
              >
                <span className="mr-2 text-2xl">⏹️</span> Parar ({seconds}s)
              </button>
            )}
          </div>
          {isRecording && <p className="recording-indicator text-orange-400 text-center text-xl animate-pulse">🔴 Gravando...</p>}
        </section>

        <section className="library p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700 col-span-1 lg:col-span-3">
          <h3 className="text-3xl font-bold mb-6 text-orange-400 flex items-center">
            <span className="text-4xl mr-3">🎵</span> Biblioteca de Riffs
          </h3>
          <div className="riff-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recordings.length === 0 ? (
              <p className="text-gray-400 text-center col-span-full">Nenhum riff gravado ainda. Comece a criar!</p>
            ) : (
              recordings.map((riff) => (
                <div key={riff.id} className="riff-card bg-gray-900 rounded-lg p-5 shadow-lg border border-gray-700 flex flex-col justify-between">
                  <div>
                    <p className="text-xl font-bold text-orange-300 mb-2">{riff.name}</p>
                    <p className="text-sm text-gray-500 mb-4">{new Date(riff.date).toLocaleString()}</p>
                    {/* Exibição da duração, se disponível */}
                    {riff.duration && (
                        <p className="text-sm text-gray-500 mb-2">
                            Duração: {Math.floor(riff.duration / 60)}m {Math.round(riff.duration % 60)}s
                        </p>
                    )}
                    {/* ALTERAÇÃO CRUCIAL AQUI: Mude o src para o novo prefixo */}
                    <audio controls src={`${API_URL}/audio_files/${riff.audio_url.split('/').pop()}`} className="w-full mt-2 rounded-md"></audio>
                  </div>
                  <div className="actions mt-4 flex flex-wrap gap-2 justify-center">
                    {/* Botão de Favorito (funcionalidade a ser implementada) */}
                    <button className="icon-button bg-gray-700 hover:bg-yellow-600 text-yellow-400 hover:text-white transition duration-300" title="Favoritar">⭐</button>
                    {/* Link para download do áudio */}
                    <a href={`${API_URL}/audio_files/${riff.audio_url.split('/').pop()}`} download={`${riff.name}.webm`} className="icon-button bg-gray-700 hover:bg-blue-600 text-blue-400 hover:text-white transition duration-300" title="Download">
                      ⬇️
                    </a>
                    {/* Botão de Similaridade */}
                    <button
                      onClick={() => compareRiff(riff)}
                      className="action-button bg-purple-600 hover:bg-purple-700 text-white transition duration-300"
                    >
                      <span className="mr-1" title="Similaridade Riffs">🔍</span>
                    </button>
                    {/* Botão de Deletar */}
                    <button
                      onClick={() => deleteRiff(riff.id)}
                      className="action-button bg-red-600 hover:bg-red-700 text-white transition duration-300"
                    >
                      <span className="mr-1" title="Deletar">🗑️</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="text-center text-gray-500 mt-12 text-sm">
        <p>&copy; {new Date().getFullYear()} Riff Maker. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

export default App;







