riff-maker\
├── backend\
│   ├── main.py
│   ├── riffs\             ← Aqui vão os áudios gravados
│   └── requirements.txt
│
├── frontend\
│   ├── src\
│   │   ├── components\
│   │   │   ├── Dashboard.jsx
│   │   │   └── AudioRecorder.jsx
│   │   ├── App.jsx
│   │   ├── index.jsx
│   │   └── styles\
│   │       └── app.css
│   ├── public\
│   ├── package.json
│   └── vite.config.js
│
└── README.md


cd riff-maker
mkdir backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install fastapi uvicorn python-multipart
pip freeze > requirements.txt

cd ..
npm create vite@latest frontend -- --template react
cd frontend
npm install

# rodar a aplicação backend
source venv/Scripts/activate
uvicorn main:app --reload
# rodar a aplicação frontend
npm run dev
