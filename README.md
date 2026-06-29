# PlacementPal 🚀
### *The Ultimate AI-Powered Campus Placement & Interview Preparation Companion*

PlacementPal is a lightweight, all-in-one web platform designed to help students and early-career developers crack internships, coding assessments, HR rounds, and technical interviews. It is powered by standard LLMs (via Hugging Face API, OpenAI, or local Ollama) and runs on a lightweight Python backend integrated with a Retrieval-Augmented Generation (RAG) system for custom knowledge grounding.

---

## 🌟 Key Features

### 1. 💬 AI Placement Chatbot (with Persistent History)
* Conversational AI assistant styled as a friendly peer ("PlacementPal").
* Tailors guidance and answers dynamically according to your academic branch, target role, and experience level.
* Automatically references details from your uploaded resume.
* **Persistent History**: Chat history is automatically saved to the user's `localStorage` so conversation context is preserved even after a page refresh.

### 2. 📚 RAG Knowledge Base Manager
* Custom Retrieval-Augmented Generation (RAG) pipeline to feed context-rich placement prep files to the LLM.
* Supports **Lexical Search (BM25)** (custom zero-dependency implementation) and **AI Semantic Embeddings** (OpenAI, Hugging Face, or Ollama).
* Interactive UI to upload reference material (PDF, TXT, MD), view parsed text blocks (chunks), delete guides, and configure retrieval settings (Enable/Disable RAG, strategy toggle, and Top-K retrieval count).
* Includes pre-generated Llama-3.1 placement preparation guides (DSA, Aptitude, HR interviews, and Resume guidelines).

### 3. 📄 Resume Dashboard & ATS Scanner
* Upload resumes in PDF format (parsed locally using `pypdf`).
* Generates an **ATS Match Score** out of 100.
* Details concrete lists of **Strengths**, **Critical Areas of Improvement**, **Extracted Skills**, and a personalized **Preparation Checklist**.

### 4. 🎯 Resume Optimizer (JD Matcher)
* Match your resume text directly against any Job Description (JD).
* Highlights missing keywords, technical skills, and experience gaps.
* Suggests step-by-step optimization recommendations to pass resume screens.

### 5. 🏢 Company Placement Hub
* Target-specific preparation dashboards for top recruiters: **Google**, **Amazon**, **TCS NQT**, **Infosys**, **Wipro**, and **Deloitte**.
* View recruitment stages, focus domains, typical salary packages (CTC), and instantly generate custom roadmaps or timed tests.

### 6. 🎙️ AI Mock Interview Simulator
* Simulates realistic **HR**, **Technical**, or **Managerial** interview rounds.
* Interactive text-based format with **Speech-to-Text Dictation** support.
* Evaluates replies across three key dimensions: **Technical Skill**, **Communication Vibe**, and **Confidence**.
* Provides a detailed performance scorecard with question-by-question reviews.

### 7. 💻 DSA Workspace & Compiler
* Write and compile solutions directly inside the browser.
* Supported languages: **Python**, **C++**, **Java**, and **JavaScript**.
* Get AI evaluations of code **Correctness**, **Time Complexity (Big-O)**, **Space Complexity (Big-O)**, and **Edge Case Coverage**, with copy-pasteable **Optimized AI Solutions**.

---

## 🛠️ Technology Stack

* **Backend**: Python 3 (built on standard `http.server` & `socketserver`)
* **Frontend**: React 19, Vite, Tailwind CSS (Modern modular UI)
* **Search & Grounding**: BM25 Lexical & Cosine-Similarity Semantic vector searching (implemented in `rag.py`)
* **LLM Engine**: Hugging Face Inference API, OpenAI API, or Ollama

---

## 🚀 Setup & Installation

### 1. Prerequisites
Ensure you have the following installed on your machine:
* Python 3.10+
* Node.js (for compiling the frontend React application)

### 2. Clone the Repository & Install Dependencies
Navigate to the project directory and install the backend libraries:
```bash
pip install -r requirements.txt
```

Navigate into the `frontend` folder and install React dependencies:
```bash
cd frontend
npm install
```

### 3. Configure the Environment
Create a `.env` file in the root directory by copying the example:
```bash
copy .env.example .env
```
Open `.env` and fill in your model keys based on your choice:

* **Option A: Hugging Face (Default)**
  ```ini
  HF_TOKEN=your_huggingface_write_token_here
  HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
  HF_PROVIDER=auto
  HF_MAX_TOKENS=4000
  ```
* **Option B: OpenAI**
  ```ini
  OPENAI_API_KEY=your_openai_api_key_here
  OPENAI_MODEL=gpt-4.1-mini
  ```
* **Option C: Local Ollama (Completely Free & Offline)**
  ```ini
  USE_OLLAMA=1
  OLLAMA_MODEL=llama3.1:8b
  OLLAMA_URL=http://127.0.0.1:11434/api/generate
  ```

### 4. Build the Frontend
Compile the React code so it is ready to be served by the Python server:
```bash
cd frontend
npm run build
cd ..
```
*(Alternatively, for frontend-only development you can run `npm run dev` inside the `frontend` directory.)*

### 5. Run the Server
Start the lightweight application server from the root directory:
```bash
py main.py
```

### 6. Access the Web App
Open your browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**

---

## 🐳 Docker Setup (Alternative)

If you prefer to run PlacementPal using Docker, a multi-stage Docker build and a Docker Compose configuration are provided. This compiles the React frontend and installs Python dependencies in isolated environments automatically.

### 1. Prerequisites
Ensure you have **Docker** and **Docker Compose** installed on your system.

### 2. Configure Environment
Ensure your `.env` file is set up in the root directory (as described in the local configuration step above).

### 3. Build & Run with Docker Compose
Start the application in detached mode:
```bash
docker compose up --build -d
```
This command will:
* Build the React frontend production assets.
* Spin up the Python backend server.
* Mount local folders (`knowledge_base/` and `saved_codes/`) as persistent volumes, ensuring data persists across runs.
* Map the application port to the port specified in your `.env` file (default is `5000`).

### 4. Access the Web App
Open your browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**

### 5. Stopping the Application
To stop and clean up the containers:
```bash
docker compose down
```

---

## 📁 Project Structure

* `main.py` - Core Python server handling API routing, file storage, mock sandbox compiler execution, and LLM orchestration. Serves React assets from `frontend/dist/`.
* `rag.py` - RAG engine managing document parsing, sliding-window chunking, zero-dependency BM25 retrieval, and semantic embedding generations.
* `verify_rag.py` - CLI tool to scan and index local documents in the `knowledge_base` folder.
* `generate_kb.py` - Helper script that uses your configured LLM to generate placement guides (DSA, Aptitude, HR, Resume) for initial grounding.
* `knowledge_base/` - Sub-directory storing PDFs/Text files and the search database index (`index.json`).
* `frontend/` - Source React codebase containing layout views, components, and Tailwind styles.
* `saved_codes/` - Sub-directory where user-saved code snippets from the DSA workspace are stored.
* `requirements.txt` - Python module dependencies.
* `.env.example` - Template config for API keys.
