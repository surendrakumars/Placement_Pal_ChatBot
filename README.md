# PlacementPal 🚀
### *The Ultimate AI-Powered Campus Placement & Interview Preparation Companion*

PlacementPal is a lightweight, all-in-one web platform designed to help students and early-career developers crack internships, coding assessments, HR rounds, and technical interviews. It is powered by standard LLMs (via Hugging Face API, OpenAI, or local Ollama) and runs on a lightweight Python server.

---

## 🌟 Key Features

### 1. 💬 AI Placement Chatbot
* Conversational AI assistant styled as a friendly peer ("PlacementPal").
* Tailors guidance and answers dynamically according to your academic branch, target role, and experience level.
* Automatically references details from your uploaded resume.

### 2. 📄 Resume Dashboard & ATS Scanner
* Upload resumes in PDF format (parsed locally using `pypdf`).
* Generates an **ATS Match Score** out of 100.
* Details concrete lists of **Strengths**, **Critical Areas of Improvement**, **Extracted Skills**, and a personalized **Preparation Checklist**.

### 3. 🎯 Resume Optimizer (JD Matcher)
* Match your resume text directly against any Job Description (JD).
* Highlights missing keywords, technical skills, and experience gaps.
* Suggests step-by-step optimization recommendations to pass resume screens.

### 4. 🏢 Company Placement Hub
* Target-specific preparation dashboards for top recruiters: **Google**, **Amazon**, **TCS NQT**, **Infosys**, **Wipro**, and **Deloitte**.
* View recruitment stages, interview difficulty, focus domains, and typical salary packages (CTC).
* Instantly generate custom roadmaps, take targeted aptitude tests, or initiate company-specific interviews.

### 5. 🎙️ AI Mock Interview Simulator
* Simulates realistic **HR**, **Technical**, or **Managerial** interview rounds.
* Interactive text-based format with **Speech-to-Text Dictation** support.
* Evaluates replies across three key dimensions: **Technical Skill**, **Communication Vibe**, and **Confidence**.
* Provides a detailed performance scorecard with question-by-question reviews.

### 6. 💻 DSA Workspace & Compiler
* Write and compile solutions directly inside the browser.
* Supported languages: **Python**, **C++**, **Java**, and **JavaScript**.
* Simulator sandbox execution with logs and error reports.
* Get AI evaluations of code **Correctness**, **Time Complexity (Big-O)**, **Space Complexity (Big-O)**, and **Edge Case Coverage**, with copy-pasteable **Optimized AI Solutions**.

---

## 🛠️ Technology Stack

* **Backend**: Python 3 (built on standard `http.server` & `socketserver`)
* **Frontend**: Vanilla HTML5, CSS (styled with Tailwind CSS), Vanilla ES6 JavaScript
* **Integrations**: 
  * Simple Icons (clean brand assets)
  * Hunter.io Logo API (live recruiter logos)
  * Web Speech API (dictation)
* **LLM Engine**: Hugging Face Inference API, OpenAI API, or Ollama

---

## 🚀 Setup & Installation

### 1. Prerequisites
Ensure you have Python 3.10+ installed on your computer.

### 2. Clone the Repository & Install Dependencies
Navigate to the project directory and install the required library dependencies:
```bash
pip install -r requirements.txt
```

### 3. Configure the Environment
Create a `.env` file in the root directory by copying the example file:
```bash
copy .env.example .env
```
Open `.env` and fill in your model keys based on your choice:

* **Option A: Hugging Face (Default)**
  ```ini
  HF_TOKEN=your_huggingface_write_token_here
  HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
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
  ```

### 4. Run the Server
Start the lightweight application server:
```bash
py main.py
```

### 5. Access the Web App
Open your browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**

---

## 📁 Project Structure

* `main.py` - Single-file Python server handling routes, base64 uploads, compiler simulation, and LLM requests.
* `index.html` - Single-page web application featuring glassmorphism layout, modular state manager, coding editor, and API binders.
* `saved_codes/` - Sub-directory where user-saved code snippets from the DSA workspace are stored.
* `requirements.txt` - Python module dependencies.
* `.env.example` - Template config for API keys.
