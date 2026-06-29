from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST



def load_env_file(path: str = ".env") -> None:
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_env_file(os.path.join(os.path.dirname(__file__), ".env"))

try:
    import truststore
except ImportError:
    truststore = None

try:
    import certifi
except ImportError:
    certifi = None

if truststore:
    truststore.inject_into_ssl()

if certifi:
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
    os.environ.setdefault("CURL_CA_BUNDLE", certifi.where())

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))
HF_API_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN", "")
HF_MODEL = os.getenv("HF_MODEL", "meta-llama/Llama-3.1-8B-Instruct")
HF_PROVIDER = os.getenv("HF_PROVIDER", "auto")
HF_MAX_TOKENS = int(os.getenv("HF_MAX_TOKENS", "4000"))
HF_API_URL = os.getenv("HF_API_URL", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MAX_RESUME_CHARS = int(os.getenv("MAX_RESUME_CHARS", "12000"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))

SAVED_CODES_DIR = os.path.join(os.path.dirname(__file__), "saved_codes")
os.makedirs(SAVED_CODES_DIR, exist_ok=True)

# Prometheus metrics setup
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP Requests",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"]
)

from rag import RAGManager
rag_manager = RAGManager()

def get_rag_config() -> dict[str, Any]:
    kb_dir = os.path.join(os.path.dirname(__file__), "knowledge_base")
    os.makedirs(kb_dir, exist_ok=True)
    config_path = os.path.join(kb_dir, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"enabled": True, "strategy": "bm25", "top_k": 3}

def save_rag_config(config: dict[str, Any]) -> None:
    kb_dir = os.path.join(os.path.dirname(__file__), "knowledge_base")
    os.makedirs(kb_dir, exist_ok=True)
    config_path = os.path.join(kb_dir, "config.json")
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception:
        pass


PLACEMENT_ASSISTANT_ROLE = """
You are PlacementPal, a warm, conversational placement-prep pal.
Your role is to help students prepare for campus placements, internships, and
entry-level job interviews while feeling like a supportive friend who is sitting
beside them and helping them think clearly.

You should:
- Sound natural, human, and relaxed. Use short friendly openings like "Got you",
  "Nice, let's make this easier", or "No worries, we can handle this."
- Match the student's energy. If they are nervous, reassure first, then guide.
  If they are focused, be direct and useful.
- Remember the conversation context and refer back to details the student already
  shared instead of asking for the same information again.
- Ask one or two casual follow-up questions when details like branch, target
  company, experience level, or job role are missing.
- Keep the tone like a real pal: encouraging, honest, specific, and not robotic.
- Give clear, step-by-step guidance for resumes, aptitude, coding rounds,
  HR interviews, technical interviews, group discussions, and company research.
- Prefer actionable answers: checklists, examples, practice questions,
  mock interview feedback, and study plans.
- Keep responses complete. If a topic is broad, give a concise finished answer
  and ask what the student wants to expand next in a friendly way.
- Avoid sounding like a textbook or corporate assistant. Do not overuse long
  disclaimers, generic motivation, or stiff phrases.
- Use light, natural encouragement, but do not pretend to have emotions or a
  personal life.
- Do not end mid-sentence, mid-list, or after a heading with no content.
- Keep answers suitable for students and early-career candidates.
- Never claim the student is guaranteed a job or selection.
- Avoid giving legal, medical, financial, or unsafe advice.
""".strip()

RESUME_CONTEXT_INSTRUCTIONS = """
The student has uploaded their resume. Use it as primary context for personalized advice.
Reference their actual skills, projects, education, internships, and experience from the resume.
Do not invent details that are not supported by the resume or the conversation.
When reviewing, planning prep, or doing mock interviews, tailor recommendations to their profile.
""".strip()


def build_system_prompt(resume_text: str | None = None, rag_chunks: list[dict[str, Any]] | None = None) -> str:
    prompt = PLACEMENT_ASSISTANT_ROLE
    if resume_text:
        trimmed_resume = resume_text.strip()[:MAX_RESUME_CHARS]
        prompt = (
            f"{prompt}\n\n"
            f"{RESUME_CONTEXT_INSTRUCTIONS}\n\n"
            f"Student resume:\n{trimmed_resume}"
        )
    
    if rag_chunks:
        context_parts = []
        for chunk in rag_chunks:
            context_parts.append(
                f"[Source Document: {chunk['filename']}]\n"
                f"{chunk['text']}"
            )
        rag_context_str = "\n\n".join(context_parts)
        prompt = (
            f"{prompt}\n\n"
            f"Relevant context retrieved from placement preparation files:\n"
            f"Use this reference information to assist the candidate. If this information is helpful, "
            f"mention the source filename to support your answers. "
            f"If the answer cannot be found in the context, use your general knowledge, but give precedence to the provided facts.\n\n"
            f"{rag_context_str}"
        )
    return prompt


def extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install pypdf to upload resumes: pip install pypdf") from exc

    import re

    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages: list[str] = []
    raw_char_count = 0
    
    for idx, page in enumerate(reader.pages):
        # Use layout mode to correctly parse multi-column resumes and keep layouts intact
        try:
            text = page.extract_text(extraction_mode="layout")
            # If layout mode returned nothing, try standard text extraction
            if not text or not text.strip():
                text = page.extract_text()
        except Exception as e:
            print(f"pypdf layout mode error on page {idx}: {e}")
            text = page.extract_text()
            
        if text:
            raw_char_count += len(text)
            # Normalize smart/curly quotes
            text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
            # Strip null bytes and non-printable control characters
            text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]', '', text)
            # Standardize excessive spacing while preserving layout indentation (cap at 4 spaces)
            text = re.sub(r'[ \t]{5,}', '    ', text)
            # Remove excessive consecutive newlines (reduce 3+ newlines to just 2)
            text = re.sub(r'\n{3,}', '\n\n', text)
            pages.append(text.strip())

    result = "\n\n".join(pages).strip()
    if not result:
        print(f"PDF Extraction failure: read {raw_char_count} raw characters, but cleaned result is empty.")
        raise ValueError(
            "Could not extract text from this PDF. Use a text-based PDF instead of a scanned image."
        )
    return result


def build_prompt(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    """Create a single prompt for model APIs that expect plain text."""
    conversation = [f"System: {build_system_prompt(resume_text, rag_chunks)}"]
    for message in messages[-12:]:
        role = "Student" if message.get("role") == "user" else "PlacementPal"
        content = message.get("content", "").strip()
        if content:
            conversation.append(f"{role}: {content}")
    conversation.append("PlacementPal:")
    return "\n\n".join(conversation)


def generate_with_your_model(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    """
    Generate a real model response.

    Supported setup:
    - Hugging Face: set HF_API_TOKEN. Optional: set HF_MODEL or HF_API_URL.
    - OpenAI: set OPENAI_API_KEY. Optional: set OPENAI_MODEL.
    - Ollama: run Ollama locally and set USE_OLLAMA=1. Optional: set OLLAMA_MODEL.
    - Custom model: replace this function body with your own model call.
    """
    if HF_API_TOKEN:
        return generate_with_hf(messages, resume_text, rag_chunks)

    if os.getenv("OPENAI_API_KEY"):
        return generate_with_openai(messages, resume_text, rag_chunks)

    if os.getenv("USE_OLLAMA") == "1":
        return generate_with_ollama(messages, resume_text, rag_chunks)

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model. You can "
        "also paste your own model call inside generate_with_your_model() in main.py."
    )


def generate_with_hf(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    if not HF_API_URL:
        return generate_with_hf_inference_client(messages, resume_text, rag_chunks)

    prompt = build_prompt(messages, resume_text, rag_chunks)
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": HF_MAX_TOKENS,
            "temperature": 0.4,
            "return_full_text": False,
        },
    }
    data = post_json(HF_API_URL, payload, {
        "Authorization": f"Bearer {HF_API_TOKEN}",
    })

    generated_text = ""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        generated_text = str(data[0].get("generated_text", ""))
    elif isinstance(data, dict):
        generated_text = str(
            data.get("generated_text")
            or data.get("output_text")
            or data.get("response")
            or ""
        )

    if generated_text.strip():
        return generated_text.strip()
    raise RuntimeError("Hugging Face returned an empty response.")


def generate_with_hf_inference_client(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    try:
        from huggingface_hub import InferenceClient
    except ImportError as exc:
        raise RuntimeError(
            "Install huggingface_hub to use Hugging Face chat completions: "
            "pip install huggingface_hub"
        ) from exc

    client = InferenceClient(provider=HF_PROVIDER, api_key=HF_API_TOKEN)
    completion = client.chat.completions.create(
        model=HF_MODEL,
        messages=[
            {"role": "system", "content": build_system_prompt(resume_text, rag_chunks)},
            *[
                {"role": message["role"], "content": message["content"]}
                for message in messages[-20:]
            ],
        ],
        max_tokens=HF_MAX_TOKENS,
        temperature=0.4,
    )

    choice = completion.choices[0]
    reply = choice.message.content
    if isinstance(reply, str) and reply.strip():
        finish_reason = getattr(choice, "finish_reason", None)
        if finish_reason == "length":
            return (
                f"{reply.strip()}\n\n"
                "[Response stopped because it reached the token limit. Ask me to continue "
                "or increase HF_MAX_TOKENS in .env.]"
            )
        return reply.strip()
    raise RuntimeError("Hugging Face returned an empty response.")


def generate_with_openai(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    payload = {
        "model": OPENAI_MODEL,
        "instructions": build_system_prompt(resume_text, rag_chunks),
        "input": [
            {"role": message["role"], "content": message["content"]}
            for message in messages[-20:]
        ],
    }
    data = post_json("https://api.openai.com/v1/responses", payload, {
        "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
    })

    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    parts: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                parts.append(text)

    if parts:
        return "\n".join(parts).strip()

    raise RuntimeError("The model returned an empty response.")


def generate_with_ollama(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
    rag_chunks: list[dict[str, Any]] | None = None,
) -> str:
    prompt = build_prompt(messages, resume_text, rag_chunks)
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    data = post_json(OLLAMA_URL, payload)
    reply = data.get("response")
    if isinstance(reply, str) and reply.strip():
        return reply.strip()
    raise RuntimeError("Ollama returned an empty response.")



def post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **(headers or {}),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Model API error {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach model API: {exc.reason}") from exc


RESUME_ANALYSIS_SYSTEM_PROMPT = """
You are an expert resume reviewer and career coach.
Analyze the student resume text and return a response strictly in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

RESUME_ANALYSIS_USER_PROMPT_TEMPLATE = """
Analyze the following resume and return a JSON object with this exact schema:

{{
  "score": <an integer between 0 and 100 representing the resume strength>,
  "summary": "<a short 2-3 sentence overall professional feedback summary>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<critical area of improvement 1>", "<critical area of improvement 2>", "<critical area of improvement 3>"],
  "skills": ["<identified skill 1>", "<identified skill 2>", "<identified skill 3>", ...],
  "suggested_projects": ["<tailored project idea 1>", "<tailored project idea 2>", "<tailored project idea 3>"],
  "action_checklist": [
    {{"task": "<specific actionable task to fix or improve the resume>", "done": false}}
  ]
}}

Provide at least 3 strengths, 3 improvements, 3 suggested projects, and 4-6 specific actionable tasks in the action_checklist.

Resume Text:
{resume_text}
""".strip()


def generate_resume_analysis(resume_text: str) -> str:
    system_prompt = RESUME_ANALYSIS_SYSTEM_PROMPT
    user_prompt = RESUME_ANALYSIS_USER_PROMPT_TEMPLATE.format(resume_text=resume_text[:MAX_RESUME_CHARS])

    if HF_API_TOKEN:
        if not HF_API_URL:
            try:
                from huggingface_hub import InferenceClient
            except ImportError as exc:
                raise RuntimeError("Install huggingface_hub: pip install huggingface_hub") from exc
            client = InferenceClient(provider=HF_PROVIDER, api_key=HF_API_TOKEN)
            completion = client.chat.completions.create(
                model=HF_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=HF_MAX_TOKENS,
                temperature=0.3,
            )
            return completion.choices[0].message.content.strip()
        else:
            prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": HF_MAX_TOKENS,
                    "temperature": 0.3,
                    "return_full_text": False,
                },
            }
            data = post_json(HF_API_URL, payload, {"Authorization": f"Bearer {HF_API_TOKEN}"})
            generated_text = ""
            if isinstance(data, list) and data and isinstance(data[0], dict):
                generated_text = str(data[0].get("generated_text", ""))
            elif isinstance(data, dict):
                generated_text = str(data.get("generated_text") or data.get("response") or "")
            return generated_text.strip()

    if os.getenv("OPENAI_API_KEY"):
        payload = {
            "model": OPENAI_MODEL,
            "instructions": system_prompt,
            "input": [{"role": "user", "content": user_prompt}],
        }
        data = post_json("https://api.openai.com/v1/responses", payload, {
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        })
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()
        parts: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts).strip()
        raise RuntimeError("OpenAI returned empty response")

    if os.getenv("USE_OLLAMA") == "1":
        prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.3
            }
        }
        data = post_json(OLLAMA_URL, payload)
        reply = data.get("response")
        if isinstance(reply, str) and reply.strip():
            return reply.strip()
        raise RuntimeError("Ollama returned an empty response.")

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model."
    )


RESUME_OPTIMIZATION_SYSTEM_PROMPT = """
You are an expert resume optimizer and career coach.
Analyze the student resume against the provided job description and return a response strictly in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

RESUME_OPTIMIZATION_USER_PROMPT_TEMPLATE = """
Compare the following resume against the job description (JD) and return a JSON object with this exact schema:

{{
  "match_score": <an integer between 0 and 100 representing how well the resume matches the JD requirements>,
  "summary": "<a short 2-3 sentence overview of the alignment and main gaps>",
  "missing_skills": ["<missing skill or keyword 1>", "<missing skill or keyword 2>", ...],
  "modifications": [
    {{
      "section": "<e.g., Summary, Experience, Projects, Skills>",
      "original": "<original text or bullet point to change, or 'N/A' if adding new content>",
      "suggested": "<suggested tailored text or bullet point>",
      "reason": "<reason why this change aligns with the JD>"
    }}
  ],
  "tailored_bullets": ["<suggested accomplishment bullet point 1>", "<suggested accomplishment bullet point 2>", ...],
  "checklist": [
    {{"task": "<specific actionable task to tailor the resume>", "done": false}}
  ]
}}

Provide a detailed analysis:
- Highlight missing skills/keywords that are critical in the JD.
- Give at least 3 specific section-by-section modifications (original vs suggested) to tailor their projects, experiences, or summary.
- Suggest 3 tailored achievement-oriented bullet points that use industry keywords from the JD (with metrics if possible).
- Provide a checklist of 4-6 specific actionable tasks they must complete to match the job description.

Resume Text:
{resume_text}

Job Description Text:
{jd_text}
""".strip()


def generate_resume_optimization(resume_text: str, jd_text: str) -> str:
    system_prompt = RESUME_OPTIMIZATION_SYSTEM_PROMPT
    user_prompt = RESUME_OPTIMIZATION_USER_PROMPT_TEMPLATE.format(
        resume_text=resume_text[:MAX_RESUME_CHARS],
        jd_text=jd_text[:MAX_RESUME_CHARS]
    )

    if HF_API_TOKEN:
        if not HF_API_URL:
            try:
                from huggingface_hub import InferenceClient
            except ImportError as exc:
                raise RuntimeError("Install huggingface_hub: pip install huggingface_hub") from exc
            client = InferenceClient(provider=HF_PROVIDER, api_key=HF_API_TOKEN)
            completion = client.chat.completions.create(
                model=HF_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=HF_MAX_TOKENS,
                temperature=0.3,
            )
            return completion.choices[0].message.content.strip()
        else:
            prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": HF_MAX_TOKENS,
                    "temperature": 0.3,
                    "return_full_text": False,
                },
            }
            data = post_json(HF_API_URL, payload, {"Authorization": f"Bearer {HF_API_TOKEN}"})
            generated_text = ""
            if isinstance(data, list) and data and isinstance(data[0], dict):
                generated_text = str(data[0].get("generated_text", ""))
            elif isinstance(data, dict):
                generated_text = str(data.get("generated_text") or data.get("response") or "")
            return generated_text.strip()

    if os.getenv("OPENAI_API_KEY"):
        payload = {
            "model": OPENAI_MODEL,
            "instructions": system_prompt,
            "input": [{"role": "user", "content": user_prompt}],
        }
        data = post_json("https://api.openai.com/v1/responses", payload, {
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        })
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()
        parts: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts).strip()
        raise RuntimeError("OpenAI returned empty response")

    if os.getenv("USE_OLLAMA") == "1":
        prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.3
            }
        }
        data = post_json(OLLAMA_URL, payload)
        reply = data.get("response")
        if isinstance(reply, str) and reply.strip():
            return reply.strip()
        raise RuntimeError("Ollama returned an empty response.")

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model."
    )


def clean_and_parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        text = text[start_idx : end_idx + 1]
    return json.loads(text)


QUIZ_GENERATION_SYSTEM_PROMPT = """
You are an expert aptitude tester and campus placement evaluator.
Generate a set of multiple-choice questions (MCQs) in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

QUIZ_GENERATION_USER_PROMPT_TEMPLATE = """
Generate exactly {count} high-quality aptitude questions for the following topic/company.
Topic/Company: {topic}

{material_instruction}

Return a JSON object with this exact schema:
{{
  "questions": [
    {{
      "question": "<the question text, including any numerical details or logical constraints>",
      "options": {{
        "A": "<option A text>",
        "B": "<option B text>",
        "C": "<option C text>",
        "D": "<option D text>"
      }},
      "correct_answer": "<one character: A, B, C, or D>",
      "explanation": "<a concise 1-2 sentence logical explanation of the solution>"
    }}
  ]
}}

CRITICAL INSTRUCTIONS:
1. Generate EXACTLY {count} questions.
2. The correct answer MUST be mathematically correct and MUST be present as one of the options A, B, C, or D. Double check that the correct_answer key matches the option that contains the mathematically correct solution.
3. Keep the explanation for each question extremely concise (1-2 sentences maximum). Ensure all math expressions are readable.
""".strip()


def generate_quiz(topic: str, material: str | None = None, count: int = 5) -> str:
    system_prompt = QUIZ_GENERATION_SYSTEM_PROMPT
    
    if material and material.strip():
        material_instruction = f"Base the questions on this reference study material:\n{material.strip()[:MAX_RESUME_CHARS]}"
    else:
        material_instruction = "Generate standard campus placement level aptitude questions matching the topic/company."
        
    user_prompt = QUIZ_GENERATION_USER_PROMPT_TEMPLATE.format(
        count=count,
        topic=topic,
        material_instruction=material_instruction
    )

    if HF_API_TOKEN:
        if not HF_API_URL:
            try:
                from huggingface_hub import InferenceClient
            except ImportError as exc:
                raise RuntimeError("Install huggingface_hub: pip install huggingface_hub") from exc
            client = InferenceClient(provider=HF_PROVIDER, api_key=HF_API_TOKEN)
            completion = client.chat.completions.create(
                model=HF_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=HF_MAX_TOKENS,
                temperature=0.4,
            )
            return completion.choices[0].message.content.strip()
        else:
            prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": HF_MAX_TOKENS,
                    "temperature": 0.4,
                    "return_full_text": False,
                },
            }
            data = post_json(HF_API_URL, payload, {"Authorization": f"Bearer {HF_API_TOKEN}"})
            generated_text = ""
            if isinstance(data, list) and data and isinstance(data[0], dict):
                generated_text = str(data[0].get("generated_text", ""))
            elif isinstance(data, dict):
                generated_text = str(data.get("generated_text") or data.get("response") or "")
            return generated_text.strip()

    if os.getenv("OPENAI_API_KEY"):
        payload = {
            "model": OPENAI_MODEL,
            "instructions": system_prompt,
            "input": [{"role": "user", "content": user_prompt}],
        }
        data = post_json("https://api.openai.com/v1/responses", payload, {
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        })
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()
        parts: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts).strip()
        raise RuntimeError("OpenAI returned empty response")

    if os.getenv("USE_OLLAMA") == "1":
        prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.4
            }
        }
        data = post_json(OLLAMA_URL, payload)
        reply = data.get("response")
        if isinstance(reply, str) and reply.strip():
            raise RuntimeError("Ollama returned an empty response.")

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model."
    )


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    if HF_API_TOKEN:
        if not HF_API_URL:
            try:
                from huggingface_hub import InferenceClient
            except ImportError as exc:
                raise RuntimeError("Install huggingface_hub: pip install huggingface_hub") from exc
            client = InferenceClient(provider=HF_PROVIDER, api_key=HF_API_TOKEN)
            completion = client.chat.completions.create(
                model=HF_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=HF_MAX_TOKENS,
                temperature=temperature,
            )
            return completion.choices[0].message.content.strip()
        else:
            prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": HF_MAX_TOKENS,
                    "temperature": temperature,
                    "return_full_text": False,
                },
            }
            data = post_json(HF_API_URL, payload, {"Authorization": f"Bearer {HF_API_TOKEN}"})
            generated_text = ""
            if isinstance(data, list) and data and isinstance(data[0], dict):
                generated_text = str(data[0].get("generated_text", ""))
            elif isinstance(data, dict):
                generated_text = str(data.get("generated_text") or data.get("response") or "")
            return generated_text.strip()

    if os.getenv("OPENAI_API_KEY"):
        payload = {
            "model": OPENAI_MODEL,
            "instructions": system_prompt,
            "input": [{"role": "user", "content": user_prompt}],
        }
        data = post_json("https://api.openai.com/v1/responses", payload, {
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        })
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()
        parts: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts).strip()
        raise RuntimeError("OpenAI returned empty response")

    if os.getenv("USE_OLLAMA") == "1":
        prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature
            }
        }
        data = post_json(OLLAMA_URL, payload)
        reply = data.get("response")
        if isinstance(reply, str) and reply.strip():
            return reply.strip()
        raise RuntimeError("Ollama returned an empty response.")

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model."
    )


CODE_ANALYSIS_SYSTEM_PROMPT = """
You are an expert software engineer and technical interviewer.
Analyze the user's code correctness, time complexity, and space complexity, and return a response strictly in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

CODE_ANALYSIS_USER_PROMPT_TEMPLATE = """
Problem Topic/Title: {problem}
Programming Language: {language}

User's Code Submission:
{code}

Analyze the submission and return a JSON object with this exact schema:
{{
  "correct": "<true or false representing whether the logical approach is correct>",
  "time_complexity": "<Big-O notation of the solution, e.g. O(N)>",
  "space_complexity": "<Big-O notation of the auxiliary space, e.g. O(1)>",
  "edge_cases": ["<checked edge case 1: how it handles it>", "<checked edge case 2>", ...],
  "feedback": "<brief 2-3 sentence overview of their code quality, naming conventions, and logic>",
  "optimized_code": "<a complete, clean, optimized version of the code in the same language without explanations>"
}}

Provide at least 3 edge cases checked.
""".strip()


def generate_code_analysis(problem: str, language: str, code: str) -> str:
    system_prompt = CODE_ANALYSIS_SYSTEM_PROMPT
    user_prompt = CODE_ANALYSIS_USER_PROMPT_TEMPLATE.format(
        problem=problem,
        language=language,
        code=code
    )
    return call_llm(system_prompt, user_prompt, temperature=0.3)


RUN_CODE_SYSTEM_PROMPT = """
You are a highly accurate compiler and runtime execution sandbox simulator.
Your task is to simulate the compilation and execution of code written in the user-specified programming language, using the provided standard input (stdin).

Rules for simulation:
1. **Compilation Check**:
   - Check if the code has syntax errors, import errors, mismatching brackets, or type errors for the specified language.
   - If there is a compilation/syntax error, set "compile_status" to "error", and provide the compiler-specific error output in "compile_error" (with line numbers, error descriptions). Set stdout and stderr to empty strings.
2. **Execution Simulation**:
   - If compilation succeeds, set "compile_status" to "success" and "compile_error" to "".
   - Simulate execution of the code line-by-line, parsing standard input (stdin) if the code reads from input.
   - Keep track of standard output (stdout) and standard error (stderr, e.g. runtime errors like ZeroDivisionError, IndexOutOfBoundsException, NullPointerException).
   - If a runtime error occurs, capture the stack trace in "stderr", and set "exit_code" to a non-zero value (e.g. 1).
   - If the code runs to completion successfully, capture all outputs in "stdout", set "stderr" to "", and set "exit_code" to 0.
3. **Java Specifics**:
   - Java programs should have a public class, typically `Main`, or any class containing `public static void main(String[] args)`. Verify if it has a main entry point. If not, output a compile/run error.
4. **C++ Specifics**:
   - C++ programs should have an `int main()` entry point.
5. **No explanation or markdown**:
   - Return response strictly in valid JSON format matching the schema. Do not include markdown code block formatting (like ```json), introduction, or notes.

Response Schema:
{
  "compile_status": "<'success' or 'error'>",
  "compile_error": "<compiler error output, if compile_status is 'error'>",
  "stdout": "<program standard output>",
  "stderr": "<program standard error / runtime stacktrace, if a runtime error occurs>",
  "exit_code": <integer exit code (e.g. 0 for success, 1 for error)>,
  "exec_time": "<simulated execution time in milliseconds, e.g. '8ms'>",
  "explanation": "<brief 1-2 sentence developer tip or notes about the execution or errors>"
}
""".strip()

RUN_CODE_USER_PROMPT_TEMPLATE = """
Programming Language: {language}
Standard Input (stdin):
{stdin}

Code Submission:
{code}
""".strip()


def generate_code_run(language: str, code: str, stdin: str) -> str:
    system_prompt = RUN_CODE_SYSTEM_PROMPT
    user_prompt = RUN_CODE_USER_PROMPT_TEMPLATE.format(
        language=language,
        code=code,
        stdin=stdin
    )
    return call_llm(system_prompt, user_prompt, temperature=0.2)



def generate_interview_question(
    interview_type: str,
    role: str,
    company: str,
    messages: list[dict[str, str]],
    resume_text: str | None = None
) -> str:
    system_prompt = f"""
You are the AI Interviewer for {company} interviewing a candidate for the {role} role (Round: {interview_type}).
Your task is to ask the candidate the next question in the interview sequence.

Rules:
- Be professional, realistic, and company-appropriate.
- Reference details from their resume if provided below.
- Do not repeat questions already asked.
- Ask ONLY ONE question at a time.
- If this is the start (no questions asked yet), introduce yourself briefly (e.g. "Hi there, I am your interviewer for {company}. Let's start with...") and ask the first question.
- Keep the tone realistic, matching the round.
- Respond with ONLY the question or greeting. Do not include notes, markdown wrappers, labels, or meta-commentary.
""".strip()

    if resume_text:
        system_prompt += f"\n\nCandidate Resume Context:\n{resume_text[:MAX_RESUME_CHARS]}"

    # Build user prompt as the conversation thread
    thread_lines = []
    for msg in messages:
        role_label = "Interviewer" if msg.get("role") == "assistant" else "Candidate"
        content = msg.get("content", "").strip()
        if content:
            thread_lines.append(f"{role_label}: {content}")
            
    if not thread_lines:
        user_prompt = "Start the interview by introducing yourself and asking the first question."
    else:
        user_prompt = "Interview history:\n" + "\n".join(thread_lines) + "\n\nAsk the next question as Interviewer:"

    return call_llm(system_prompt, user_prompt, temperature=0.7)


MOCK_EVAL_SYSTEM_PROMPT = """
You are an expert HR manager and technical bar raiser.
Evaluate the candidate's responses in this mock interview and return a response strictly in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

MOCK_EVAL_USER_PROMPT_TEMPLATE = """
Interview Details:
Type: {interview_type}
Target Role: {role}
Target Company: {company}

{resume_instruction}

Here is the transcript of the interview (Questions and candidate Answers):
{transcript}

Analyze the candidate's performance and return a JSON object with this exact schema:
{{
  "rating": <an integer between 0 and 100 representing overall performance>,
  "score_tech": <integer between 0 and 100 for technical accuracy/competency>,
  "score_comm": <integer between 0 and 100 for communication clarity/articulation>,
  "score_conf": <integer between 0 and 100 for confidence, tone, and vibes>,
  "headline": "<a concise 1-sentence performance summary title>",
  "summary": "<a 2-3 sentence overview of their interview delivery>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<critical area of improvement 1>", "<critical area of improvement 2>", "<critical area of improvement 3>"],
  "reviews": [
    {{
      "question": "<question text>",
      "answer": "<candidate answer text>",
      "rating": <rating for this specific answer between 0 and 100>,
      "feedback": "<1-2 sentence constructive feedback for this answer>",
      "ideal": "<a brief summary of what the ideal answer should have included>"
    }}
  ]
}}

Provide at least 3 strengths, 3 improvements, and an entry for each question in the reviews.
""".strip()


def generate_interview_evaluation(
    interview_type: str,
    role: str,
    company: str,
    QA_pairs: list[dict[str, str]],
    resume_text: str | None = None
) -> str:
    resume_instruction = ""
    if resume_text:
        resume_instruction = f"Candidate Resume:\n{resume_text[:MAX_RESUME_CHARS]}"
        
    transcript_parts = []
    for idx, pair in enumerate(QA_pairs):
        q = pair.get("question", "")
        a = pair.get("answer", "")
        transcript_parts.append(f"Q{idx+1}: {q}\nA{idx+1}: {a}")
    transcript = "\n\n".join(transcript_parts)
    
    user_prompt = MOCK_EVAL_USER_PROMPT_TEMPLATE.format(
        interview_type=interview_type,
        role=role,
        company=company,
        resume_instruction=resume_instruction,
        transcript=transcript
    )
    
    return call_llm(MOCK_EVAL_SYSTEM_PROMPT, user_prompt, temperature=0.3)


ROADMAP_GENERATION_SYSTEM_PROMPT = """
You are an expert career counselor and curriculum designer.
Generate a structured career preparation roadmap for the targeted role and return a response strictly in valid JSON format.
You must return only the JSON block. Do not include markdown code block syntax (like ```json), introduction, or follow-up notes.
""".strip()

ROADMAP_GENERATION_USER_PROMPT_TEMPLATE = """
Generate a comprehensive, step-by-step career preparation roadmap for a candidate targeting the following role.
Target Role: {role}

Return a JSON object with this exact schema:
{{
  "role": "<the target role, e.g. Frontend Developer>",
  "summary": "<a 2-3 sentence overview of the placement preparation roadmap for this role>",
  "phases": [
    {{
      "phase_number": 1,
      "title": "<title of the phase, e.g. Master the Programming Language>",
      "duration": "<suggested time to spend, e.g. 3-4 Weeks>",
      "description": "<a short 1-2 sentence summary of the main goal of this phase>",
      "topics": [
        "<core topic 1 to learn>",
        "<core topic 2 to learn>",
        "<core topic 3 to learn>",
        "<core topic 4 to learn>"
      ],
      "skills": ["<skill badge 1>", "<skill badge 2>", "<skill badge 3>"]
    }}
  ]
}}

Provide exactly 4 or 5 logical phases in chronological order. Each phase should contain 3 to 5 clear, specific, actionable topics to master, and 2 to 4 key skills to acquire.
""".strip()


def wrap_text(text: str, max_chars: int) -> list[str]:
    words = text.split(" ")
    lines = []
    current_line = []
    current_length = 0
    for word in words:
        if current_length + len(word) + (1 if current_line else 0) <= max_chars:
            current_line.append(word)
            current_length += len(word) + (1 if current_line else 0)
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [word]
            current_length = len(word)
    if current_line:
        lines.append(" ".join(current_line))
    return lines


def escape_svg_text(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def generate_roadmap_data(role: str) -> str:
    system_prompt = ROADMAP_GENERATION_SYSTEM_PROMPT
    user_prompt = ROADMAP_GENERATION_USER_PROMPT_TEMPLATE.format(role=role)
    return call_llm(system_prompt, user_prompt, temperature=0.4)


def get_phase_icon_path(phase_idx: int, cx: float, cy: float) -> str:
    # 0-indexed phase icons
    if phase_idx == 0:  # Code block </>
        return f'<path d="M {cx-4} {cy-3} l -3 3 l 3 3 M {cx+4} {cy-3} l 3 3 l -3 3 M {cx+1} {cy-5} l -2 10" stroke="#38bdf8" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    elif phase_idx == 1:  # Server/DNS (3 cylinders stack)
        return f'<path d="M {cx-5} {cy-4} h 10 v 3 h -10 z M {cx-5} {cy} h 10 v 3 h -10 z M {cx-5} {cy+4} h 10 v 3 h -10 z" stroke="#a855f7" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
    elif phase_idx == 2:  # Tools (gear-like shape)
        return f'<circle cx="{cx}" cy="{cy}" r="3" stroke="#ec4899" stroke-width="1.5" fill="none"/>' \
               f'<path d="M {cx} {cy-5} v 2 M {cx} {cy+3} v 2 M {cx-5} {cy} h 2 M {cx+3} {cy} h 2" stroke="#ec4899" stroke-width="1.5" stroke-linecap="round"/>'
    elif phase_idx == 3:  # Trophy
        return f'<path d="M {cx-4} {cy-4} h 8 v 5 c 0 2 -2 4 -4 4 s -4 -2 -4 -4 z M {cx} {cy+5} v 3 M {cx-3} {cy+8} h 6 M {cx-4} {cy-2} h -2 v 2 c 0 1 1 1 2 1 M {cx+4} {cy-2} h 2 v 2 c 0 1 -1 1 -2 1" stroke="#eab308" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    else:  # Star
        return f'<path d="M {cx} {cy-5} l 1.5 3 h 3.5 l -2.5 2 l 1 3.5 l -3.5 -2 l -3.5 2 l 1 -3.5 l -2.5 -2 h 3.5 z" stroke="#22c55e" stroke-width="1.5" fill="none" stroke-linejoin="round"/>'


def render_roadmap_svg(roadmap_data: dict[str, Any]) -> str:
    role = roadmap_data.get("role", "Career")
    phases = roadmap_data.get("phases", [])
    
    width = 800
    padding_top = 40
    padding_bottom = 40
    header_height = 100
    
    y = padding_top + header_height
    card_width = 620
    card_x = 130
    
    phase_renders = []
    
    for idx, phase in enumerate(phases):
        title = phase.get("title", "Learn Basics")
        duration = phase.get("duration", "2-3 weeks")
        skills = phase.get("skills", [])
        
        # Calculate skills tags row count to wrap tags if they exceed card width
        tag_x = card_x + 64
        tag_rows = 1
        for skill in skills:
            escaped_skill = escape_svg_text(skill)
            tag_w = len(escaped_skill) * 7.5 + 16
            if tag_x + tag_w > card_x + card_width - 24:
                tag_rows += 1
                tag_x = card_x + 64 + tag_w + 8
            else:
                tag_x += tag_w + 8
                
        skills_height = tag_rows * 28 if skills else 0
        
        # Compact visual height:
        card_h = 50 + (10 + skills_height if skills else 0) + 15
        
        phase_renders.append({
            "idx": idx,
            "title": title,
            "duration": duration,
            "skills": skills,
            "card_h": card_h,
            "y": y
        })
        
        y += card_h + 30
        
    total_height = y + padding_bottom
    
    # SVG construction
    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {total_height}" width="{width}" height="{total_height}" style="background-color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">')
    
    # Defs
    svg.append('<defs>')
    svg.append('  <linearGradient id="bg-gradient" x1="0" y1="0" x2="0" y2="1">')
    svg.append('    <stop offset="0%" stop-color="#0f172a"/>')
    svg.append('    <stop offset="50%" stop-color="#1e293b"/>')
    svg.append('    <stop offset="100%" stop-color="#0f172a"/>')
    svg.append('  </linearGradient>')
    
    svg.append('  <linearGradient id="title-gradient" x1="0" y1="0" x2="1" y2="0">')
    svg.append('    <stop offset="0%" stop-color="#38bdf8"/>')
    svg.append('    <stop offset="50%" stop-color="#a855f7"/>')
    svg.append('    <stop offset="100%" stop-color="#ec4899"/>')
    svg.append('  </linearGradient>')
    
    svg.append('  <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">')
    svg.append('    <stop offset="0%" stop-color="#38bdf8"/>')
    svg.append('    <stop offset="100%" stop-color="#a855f7"/>')
    svg.append('  </linearGradient>')
    
    svg.append('  <linearGradient id="card-border" x1="0" y1="0" x2="1" y2="1">')
    svg.append('    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.6"/>')
    svg.append('    <stop offset="100%" stop-color="#a855f7" stop-opacity="0.2"/>')
    svg.append('  </linearGradient>')
    
    svg.append('  <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">')
    svg.append('    <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#020617" flood-opacity="0.5"/>')
    svg.append('  </filter>')
    
    svg.append('  <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">')
    svg.append('    <feGaussianBlur stdDeviation="3" result="blur"/>')
    svg.append('    <feComposite in="SourceGraphic" in2="blur" operator="over"/>')
    svg.append('  </filter>')
    
    svg.append('  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">')
    svg.append('    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.5" stroke-opacity="0.15"/>')
    svg.append('  </pattern>')
    svg.append('</defs>')
    
    # Base background and grid
    svg.append('<rect width="800" height="100%" fill="url(#bg-gradient)"/>')
    svg.append(f'<rect width="800" height="{total_height}" fill="url(#grid)"/>')
    
    # Title
    escaped_role = escape_svg_text(role)
    svg.append(f'  <text x="70" y="70" font-size="28" font-weight="800" fill="url(#title-gradient)" letter-spacing="1">{escaped_role.upper()} PREP ROADMAP</text>')
    svg.append('  <text x="70" y="95" font-size="14" font-weight="500" fill="#94a3b8">A visual career preparation timeline designed by PlacementPal</text>')
    
    # Timeline line
    if phase_renders:
        last_y = phase_renders[-1]["y"] + phase_renders[-1]["card_h"] / 2
        svg.append(f'  <line x1="70" y1="130" x2="70" y2="{last_y}" stroke="url(#line-gradient)" stroke-width="4" stroke-linecap="round" filter="url(#line-glow)"/>')
        
    for p in phase_renders:
        idx = p["idx"]
        card_y = p["y"]
        card_h = p["card_h"]
        
        # Center of node dot on timeline
        node_cy = card_y + card_h / 2
        
        # Node dot
        svg.append(f'  <circle cx="70" cy="{node_cy}" r="20" fill="#0f172a" stroke="url(#line-gradient)" stroke-width="3" filter="url(#card-shadow)"/>')
        svg.append(f'  <text x="70" y="{node_cy + 5}" font-size="14" font-weight="800" fill="#38bdf8" text-anchor="middle">{idx+1}</text>')
        
        # Connector dash line
        svg.append(f'  <line x1="90" y1="{node_cy}" x2="130" y2="{node_cy}" stroke="#334155" stroke-width="2" stroke-dasharray="4 4"/>')
        
        # Card outline
        svg.append(f'  <rect x="{card_x}" y="{card_y}" width="{card_width}" height="{card_h}" rx="16" fill="#0f172a" fill-opacity="0.85" stroke="url(#card-border)" stroke-width="1.5" filter="url(#card-shadow)"/>')
        
        # Circular Icon Badge inside the card
        icon_cx = card_x + 36
        icon_cy = card_y + 32
        svg.append(f'  <circle cx="{icon_cx}" cy="{icon_cy}" r="16" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.7"/>')
        
        # Render dynamic vector icon based on phase number
        svg.append(f'  {get_phase_icon_path(idx, icon_cx, icon_cy)}')
        
        # Title text (pushed right due to icon)
        escaped_title = escape_svg_text(p["title"])
        svg.append(f'  <text x="{card_x + 64}" y="{card_y + 37}" font-size="16" font-weight="700" fill="#f8fafc">Phase {idx+1}: {escaped_title}</text>')
        
        # Duration Badge
        duration_text = p["duration"].upper()
        badge_w = len(duration_text) * 7 + 16
        badge_x = card_x + card_width - 24 - badge_w
        badge_y = card_y + 20
        svg.append(f'  <rect x="{badge_x}" y="{badge_y}" width="{badge_w}" height="24" rx="12" fill="#1e1b4b" stroke="#6366f1" stroke-width="1"/>')
        svg.append(f'  <text x="{badge_x + badge_w / 2}" y="{badge_y + 16}" font-size="10" font-weight="700" fill="#a5b4fc" text-anchor="middle">{duration_text}</text>')
        
        # Skills tags
        if p["skills"]:
            curr_y = card_y + 58
            tag_x = card_x + 64
            for skill in p["skills"]:
                escaped_skill = escape_svg_text(skill)
                tag_w = len(escaped_skill) * 7.5 + 16
                if tag_x + tag_w > card_x + card_width - 24:
                    curr_y += 28
                    tag_x = card_x + 64
                svg.append(f'  <rect x="{tag_x}" y="{curr_y}" width="{tag_w}" height="22" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1"/>')
                svg.append(f'  <text x="{tag_x + tag_w/2}" y="{curr_y + 15}" font-size="10" font-weight="600" fill="#38bdf8" text-anchor="middle">{escaped_skill}</text>')
                tag_x += tag_w + 8
                
    svg.append('</svg>')
    return "\n".join(svg)


FRONTEND_DIST_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")
INDEX_HTML_PATH = os.path.join(os.path.dirname(__file__), "index.html")


def load_index_html() -> str:
    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as file:
        return file.read()


class ChatHandler(BaseHTTPRequestHandler):
    def send_response(self, code: int, message: str | None = None) -> None:
        self.last_response_code = code
        super().send_response(code, message)

    def _normalize_path(self, method: str, path: str) -> str:
        path = path.rstrip("/") or "/"
        if method == "GET":
            if path == "/" or path == "/index.html":
                return "/"
            if path == "/metrics":
                return "/metrics"
            return "/static/*"
        elif method == "POST":
            if path.startswith("/api/"):
                return path
            return "/api/*"
        return path

    def _execute_with_metrics(self, method: str, handler_func) -> None:
        import time
        start_time = time.time()
        self.last_response_code = 500
        try:
            handler_func()
        finally:
            duration = time.time() - start_time
            path = urlparse(self.path).path
            normalized_path = self._normalize_path(method, path)
            HTTP_REQUESTS_TOTAL.labels(
                method=method,
                endpoint=normalized_path,
                status=getattr(self, "last_response_code", 500)
            ).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method,
                endpoint=normalized_path
            ).observe(duration)

    def do_OPTIONS(self) -> None:
        self._execute_with_metrics("OPTIONS", self._do_OPTIONS_original)

    def do_GET(self) -> None:
        self._execute_with_metrics("GET", self._do_GET_original)

    def do_POST(self) -> None:
        self._execute_with_metrics("POST", self._do_POST_original)

    def _do_OPTIONS_original(self) -> None:
        self.send_response(204)
        self._send_common_headers("text/plain")
        self.end_headers()

    def _do_GET_original(self) -> None:
        path = urlparse(self.path).path
        if path == "/metrics":
            try:
                metrics_data = generate_latest()
                self.send_response(200)
                self.send_header("Content-Type", CONTENT_TYPE_LATEST)
                self.send_header("Content-Length", str(len(metrics_data)))
                self.end_headers()
                self.wfile.write(metrics_data)
            except Exception as exc:
                self.send_error(500, f"Error generating metrics: {str(exc)}")
            return

        clean_path = path.lstrip("/")
        if not clean_path:
            clean_path = "index.html"

        if not os.path.exists(FRONTEND_DIST_DIR):
            # Fallback to local old index.html at root if frontend/dist doesn't exist yet
            if clean_path == "index.html":
                if os.path.exists(INDEX_HTML_PATH):
                    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as file:
                        self._send(200, file.read(), "text/html; charset=utf-8")
                        return
            self.send_error(404, "Frontend build directory not found. Please build the frontend first.")
            return

        # Serve static React built files
        target_path = os.path.abspath(os.path.join(FRONTEND_DIST_DIR, clean_path))
        if not target_path.startswith(os.path.abspath(FRONTEND_DIST_DIR)):
            self.send_error(403, "Access Denied")
            return

        if os.path.exists(target_path) and os.path.isfile(target_path):
            content_type = "application/octet-stream"
            if target_path.endswith(".html"):
                content_type = "text/html; charset=utf-8"
            elif target_path.endswith(".js") or target_path.endswith(".mjs"):
                content_type = "application/javascript; charset=utf-8"
            elif target_path.endswith(".css"):
                content_type = "text/css; charset=utf-8"
            elif target_path.endswith(".json"):
                content_type = "application/json; charset=utf-8"
            elif target_path.endswith(".svg"):
                content_type = "image/svg+xml; charset=utf-8"
            elif target_path.endswith(".png"):
                content_type = "image/png"
            elif target_path.endswith(".jpg") or target_path.endswith(".jpeg"):
                content_type = "image/jpeg"

            try:
                with open(target_path, "rb") as file:
                    content = file.read()
                self.send_response(200)
                self._send_common_headers(content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as exc:
                self.send_error(500, f"Error reading file: {str(exc)}")
        else:
            self.send_error(404, "File Not Found")

    def _request_path(self) -> str:
        return urlparse(self.path).path.rstrip("/") or "/"

    def _do_POST_original(self) -> None:
        path = self._request_path()
        if path == "/api/chat":
            self._handle_chat()
            return
        if path == "/api/upload-resume":
            self._handle_upload_resume()
            return
        if path == "/api/analyze-resume":
            self._handle_analyze_resume()
            return
        if path == "/api/generate-quiz":
            self._handle_generate_quiz()
            return
        if path == "/api/optimize-resume":
            self._handle_optimize_resume()
            return
        if path == "/api/analyze-code":
            self._handle_analyze_code()
            return
        if path == "/api/run-code":
            self._handle_run_code()
            return
        if path == "/api/save-code":
            self._handle_save_code()
            return
        if path == "/api/list-saved-codes":
            self._handle_list_saved_codes()
            return
        if path == "/api/load-code":
            self._handle_load_code()
            return
        if path == "/api/delete-code":
            self._handle_delete_code()
            return
        if path == "/api/generate-interview-question":
            self._handle_generate_interview_question()
            return
        if path == "/api/evaluate-interview":
            self._handle_evaluate_interview()
            return
        if path == "/api/generate-roadmap":
            self._handle_generate_roadmap()
            return
        if path == "/api/rag/list":
            self._handle_rag_list()
            return
        if path == "/api/rag/upload":
            self._handle_rag_upload()
            return
        if path == "/api/rag/delete":
            self._handle_rag_delete()
            return
        if path == "/api/rag/settings":
            self._handle_rag_settings()
            return
        self._send_json(404, {"error": f"Unknown API route: {path}"})


    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Request body is empty")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _handle_chat(self) -> None:
        try:
            payload = self._read_json_body()
            messages = payload.get("messages", [])
            if not isinstance(messages, list):
                raise ValueError("messages must be a list")

            resume_text = payload.get("resume")
            if resume_text is not None:
                resume_text = str(resume_text).strip()[:MAX_RESUME_CHARS] or None

            cleaned_messages = []
            for message in messages:
                if not isinstance(message, dict):
                    continue
                role = message.get("role")
                content = str(message.get("content", "")).strip()
                if role in {"user", "assistant"} and content:
                    cleaned_messages.append({"role": role, "content": content})

            # Retrieve RAG context if enabled
            rag_chunks = []
            config = get_rag_config()
            if config.get("enabled", True) and cleaned_messages:
                last_user_msg = next((m["content"] for m in reversed(cleaned_messages) if m["role"] == "user"), "")
                if last_user_msg:
                    try:
                        rag_chunks = rag_manager.query(
                            last_user_msg,
                            top_k=config.get("top_k", 3),
                            strategy=config.get("strategy", "bm25"),
                            env_vars=dict(os.environ)
                        )
                    except Exception as e:
                        print(f"RAG query failed: {e}")

            reply = generate_with_your_model(cleaned_messages, resume_text, rag_chunks)

            # Extract source references for citations
            sources = []
            if rag_chunks:
                seen = set()
                for chunk in rag_chunks:
                    fname = chunk["filename"]
                    if fname not in seen:
                        seen.add(fname)
                        sources.append({
                            "filename": fname,
                            "score": chunk.get("score")
                        })

            self._send_json(200, {"reply": reply, "sources": sources})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_rag_list(self) -> None:
        try:
            files = rag_manager.list_files()
            config = get_rag_config()
            self._send_json(200, {"files": files, "config": config})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_rag_upload(self) -> None:
        try:
            payload = self._read_json_body()
            filename = str(payload.get("filename", "")).strip()
            if not filename:
                raise ValueError("filename is required")

            encoded = str(payload.get("data", "")).strip()
            if not encoded:
                raise ValueError("File data is missing")

            file_bytes = base64.b64decode(encoded, validate=True)
            res = rag_manager.add_file(filename, file_bytes, dict(os.environ))
            self._send_json(200, {"success": True, "file": res})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_rag_delete(self) -> None:
        try:
            payload = self._read_json_body()
            filename = str(payload.get("filename", "")).strip()
            if not filename:
                raise ValueError("filename is required")

            success = rag_manager.delete_file(filename)
            self._send_json(200, {"success": success})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_rag_settings(self) -> None:
        try:
            payload = self._read_json_body()
            config = get_rag_config()

            if "enabled" in payload:
                config["enabled"] = bool(payload["enabled"])
            if "strategy" in payload:
                strategy = str(payload["strategy"]).strip().lower()
                if strategy in ["bm25", "embeddings"]:
                    config["strategy"] = strategy
            if "top_k" in payload:
                try:
                    top_k = int(payload["top_k"])
                    if 1 <= top_k <= 10:
                        config["top_k"] = top_k
                except (ValueError, TypeError):
                    pass

            save_rag_config(config)
            self._send_json(200, {"success": True, "config": config})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_upload_resume(self) -> None:
        try:
            payload = self._read_json_body()
            filename = str(payload.get("filename", "resume.pdf")).strip() or "resume.pdf"
            if not filename.lower().endswith(".pdf"):
                raise ValueError("Only PDF resumes are supported")

            encoded = str(payload.get("data", "")).strip()
            if not encoded:
                raise ValueError("PDF data is missing")

            pdf_bytes = base64.b64decode(encoded, validate=True)
            if len(pdf_bytes) > MAX_UPLOAD_BYTES:
                raise ValueError(
                    f"PDF is too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                )

            text = extract_pdf_text(pdf_bytes)
            self._send_json(200, {
                "filename": filename,
                "text": text[:MAX_RESUME_CHARS],
                "charCount": min(len(text), MAX_RESUME_CHARS),
            })
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_analyze_resume(self) -> None:
        try:
            payload = self._read_json_body()
            resume_text = payload.get("resume")
            if not resume_text or not isinstance(resume_text, str):
                raise ValueError("resume field is required and must be a string")

            raw_response = generate_resume_analysis(resume_text)
            try:
                analysis = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for LLM response: {raw_response}")
                raise ValueError("Model failed to return valid JSON. Please try again.") from parse_exc

            self._send_json(200, {"analysis": analysis})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_generate_quiz(self) -> None:
        try:
            payload = self._read_json_body()
            topic = payload.get("topic", "").strip()
            if not topic:
                raise ValueError("topic field is required and cannot be empty")
            
            material = payload.get("material")
            if material is not None:
                material = str(material).strip()

            count = payload.get("count", 5)
            try:
                count = int(count)
                if count not in [5, 10, 15, 20]:
                    count = 5
            except (ValueError, TypeError):
                count = 5

            raw_response = generate_quiz(topic, material, count=count)
            try:
                quiz_data = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for Quiz LLM response: {raw_response}")
                raise ValueError("Model failed to return valid JSON quiz. Please try again.") from parse_exc

            self._send_json(200, {"quiz": quiz_data})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_optimize_resume(self) -> None:
        try:
            payload = self._read_json_body()
            resume_text = payload.get("resume")
            if not resume_text or not isinstance(resume_text, str):
                raise ValueError("resume field is required and must be a string")

            jd_text = payload.get("jd")
            if not jd_text or not isinstance(jd_text, str):
                raise ValueError("jd field is required and must be a string")

            raw_response = generate_resume_optimization(resume_text, jd_text)
            try:
                optimization = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for LLM response: {raw_response}")
                raise ValueError("Model failed to return valid JSON. Please try again.") from parse_exc

            self._send_json(200, {"optimization": optimization})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_analyze_code(self) -> None:
        try:
            payload = self._read_json_body()
            problem = payload.get("problem", "").strip()
            language = payload.get("language", "").strip()
            code = payload.get("code", "").strip()
            
            if not problem or not language or not code:
                raise ValueError("problem, language, and code fields are required")
                
            raw_response = generate_code_analysis(problem, language, code)
            try:
                analysis = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for Code Review: {raw_response}")
                raise ValueError("Model failed to return valid JSON review. Please try again.") from parse_exc
                
            self._send_json(200, {"analysis": analysis})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_run_code(self) -> None:
        try:
            payload = self._read_json_body()
            language = payload.get("language", "").strip()
            code = payload.get("code", "").strip()
            stdin = payload.get("stdin", "")
            
            if not language or not code:
                raise ValueError("language and code fields are required")
                
            raw_response = generate_code_run(language, code, stdin)
            try:
                run_result = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for Code Run: {raw_response}")
                run_result = {
                    "compile_status": "error",
                    "compile_error": "Compiler simulator returned invalid JSON format. Please try again.",
                    "stdout": "",
                    "stderr": "",
                    "exit_code": 1,
                    "exec_time": "0ms",
                    "explanation": "Parsing error on simulator response."
                }
                
            self._send_json(200, {"run": run_result})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_save_code(self) -> None:
        try:
            payload = self._read_json_body()
            filename = payload.get("filename", "").strip()
            code = payload.get("code", "")
            
            if not filename or not code:
                raise ValueError("filename and code fields are required")
                
            filepath = self._safe_code_path(filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(code)
                
            self._send_json(200, {"success": True, "message": f"Successfully saved to {filename}"})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_list_saved_codes(self) -> None:
        try:
            files_list = []
            for item in os.listdir(SAVED_CODES_DIR):
                full_path = os.path.join(SAVED_CODES_DIR, item)
                if os.path.isfile(full_path):
                    stat = os.stat(full_path)
                    ext = item.split(".")[-1].lower() if "." in item else ""
                    lang = "python" if ext == "py" else "cpp" if ext == "cpp" else "java" if ext == "java" else "javascript" if ext == "js" else "text"
                    files_list.append({
                        "filename": item,
                        "language": lang,
                        "size": stat.st_size,
                        "modified": int(stat.st_mtime * 1000)
                    })
                    
            self._send_json(200, {"files": files_list})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_load_code(self) -> None:
        try:
            payload = self._read_json_body()
            filename = payload.get("filename", "").strip()
            if not filename:
                raise ValueError("filename field is required")
                
            filepath = self._safe_code_path(filename)
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"File {filename} not found")
                
            with open(filepath, "r", encoding="utf-8") as f:
                code = f.read()
                
            self._send_json(200, {"filename": filename, "code": code})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_delete_code(self) -> None:
        try:
            payload = self._read_json_body()
            filename = payload.get("filename", "").strip()
            if not filename:
                raise ValueError("filename field is required")
                
            filepath = self._safe_code_path(filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                
            self._send_json(200, {"success": True, "message": f"Successfully deleted {filename}"})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _safe_code_path(self, filename: str) -> str:
        filename = filename.strip()
        if not filename or filename.startswith(".") or "/" in filename or "\\" in filename or ".." in filename:
            raise ValueError("Invalid filename format")
        base = os.path.basename(filename)
        if base != filename:
            raise ValueError("Invalid filename format")
        target_path = os.path.abspath(os.path.join(SAVED_CODES_DIR, base))
        if not target_path.startswith(os.path.abspath(SAVED_CODES_DIR)):
            raise ValueError("Invalid path resolution")
        return target_path

    def _handle_generate_interview_question(self) -> None:
        try:
            payload = self._read_json_body()
            interview_type = payload.get("type", "HR").strip()
            role = payload.get("role", "Software Engineer").strip()
            company = payload.get("company", "Placement Company").strip()
            messages = payload.get("messages", [])
            resume_text = payload.get("resume")
            if resume_text is not None:
                resume_text = str(resume_text).strip()[:MAX_RESUME_CHARS] or None
                
            question = generate_interview_question(interview_type, role, company, messages, resume_text)
            self._send_json(200, {"question": question})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_evaluate_interview(self) -> None:
        try:
            payload = self._read_json_body()
            interview_type = payload.get("type", "HR").strip()
            role = payload.get("role", "Software Engineer").strip()
            company = payload.get("company", "Placement Company").strip()
            qa_pairs = payload.get("qa_pairs", [])
            resume_text = payload.get("resume")
            if resume_text is not None:
                resume_text = str(resume_text).strip()[:MAX_RESUME_CHARS] or None
                
            raw_response = generate_interview_evaluation(interview_type, role, company, qa_pairs, resume_text)
            try:
                evaluation = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for Interview Eval: {raw_response}")
                raise ValueError("Model failed to return valid JSON evaluation. Please try again.") from parse_exc
                
            self._send_json(200, {"evaluation": evaluation})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_generate_roadmap(self) -> None:
        try:
            payload = self._read_json_body()
            role = payload.get("role", "").strip()
            if not role:
                raise ValueError("role field is required and cannot be empty")
                
            raw_response = generate_roadmap_data(role)
            try:
                roadmap_data = clean_and_parse_json(raw_response)
            except Exception as parse_exc:
                print(f"JSON Parsing failed for Roadmap: {raw_response}")
                raise ValueError("Model failed to return valid JSON roadmap. Please try again.") from parse_exc
                
            svg_string = render_roadmap_svg(roadmap_data)
            svg_base64 = base64.b64encode(svg_string.encode("utf-8")).decode("utf-8")
            
            self._send_json(200, {
                "roadmap": roadmap_data,
                "image": f"data:image/svg+xml;base64,{svg_base64}"
            })
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, body: dict[str, Any]) -> None:
        self._send(status, json.dumps(body), "application/json; charset=utf-8")

    def _send(self, status: int, body: str, content_type: str) -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self._send_common_headers(content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_common_headers(self, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")


def main() -> None:
    try:
        rag_manager.scan_and_rebuild(dict(os.environ))
        files = rag_manager.list_files()
        total_chunks = len(rag_manager.chunks)
        print(f"Knowledge base loaded successfully: {len(files)} files, {total_chunks} total chunks indexed.")
    except Exception as e:
        print(f"Warning: Could not index knowledge base at startup: {e}")

    server = ThreadingHTTPServer((HOST, PORT), ChatHandler)
    display_host = "localhost" if HOST == "0.0.0.0" else HOST
    print(f"PlacementPal is running at http://{display_host}:{PORT}")
    print("Press Ctrl+C to stop the server.")
    server.serve_forever()



if __name__ == "__main__":
    main()
