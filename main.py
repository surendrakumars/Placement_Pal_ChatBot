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


def build_system_prompt(resume_text: str | None = None) -> str:
    if not resume_text:
        return PLACEMENT_ASSISTANT_ROLE

    trimmed_resume = resume_text.strip()[:MAX_RESUME_CHARS]
    return (
        f"{PLACEMENT_ASSISTANT_ROLE}\n\n"
        f"{RESUME_CONTEXT_INSTRUCTIONS}\n\n"
        f"Student resume:\n{trimmed_resume}"
    )


def extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install pypdf to upload resumes: pip install pypdf") from exc

    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())

    result = "\n\n".join(pages).strip()
    if not result:
        raise ValueError(
            "Could not extract text from this PDF. Use a text-based PDF instead of a scanned image."
        )
    return result


def build_prompt(messages: list[dict[str, str]], resume_text: str | None = None) -> str:
    """Create a single prompt for model APIs that expect plain text."""
    conversation = [f"System: {build_system_prompt(resume_text)}"]
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
) -> str:
    """
    Generate a real model response.

    Supported setup:
    - Hugging Face: set HF_API_TOKEN. Optional: set HF_MODEL or HF_API_URL.
    - OpenAI: set OPENAI_API_KEY. Optional: set OPENAI_MODEL.
    - Ollama: run Ollama locally and set USE_OLLAMA=1. Optional: set OLLAMA_MODEL.
    - Custom model: replace this function body with your own model call.

    Custom model example:
        prompt = build_prompt(messages)
        response = your_model.generate(prompt)
        return response
    """
    if HF_API_TOKEN:
        return generate_with_hf(messages, resume_text)

    if os.getenv("OPENAI_API_KEY"):
        return generate_with_openai(messages, resume_text)

    if os.getenv("USE_OLLAMA") == "1":
        return generate_with_ollama(messages, resume_text)

    raise RuntimeError(
        "No model is configured. Set HF_API_TOKEN for Hugging Face, set OPENAI_API_KEY "
        "for OpenAI, or set USE_OLLAMA=1 after starting a local Ollama model. You can "
        "also paste your own model call inside generate_with_your_model() in main.py."
    )


def generate_with_hf(
    messages: list[dict[str, str]],
    resume_text: str | None = None,
) -> str:
    if not HF_API_URL:
        return generate_with_hf_inference_client(messages, resume_text)

    prompt = build_prompt(messages, resume_text)
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
            {"role": "system", "content": build_system_prompt(resume_text)},
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
) -> str:
    payload = {
        "model": OPENAI_MODEL,
        "instructions": build_system_prompt(resume_text),
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
) -> str:
    prompt = build_prompt(messages, resume_text)
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


INDEX_HTML_PATH = os.path.join(os.path.dirname(__file__), "index.html")


def load_index_html() -> str:
    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as file:
        return file.read()


class ChatHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_common_headers("text/plain")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path != "/":
            self.send_error(404)
            return

        self._send(200, load_index_html(), "text/html; charset=utf-8")

    def _request_path(self) -> str:
        return urlparse(self.path).path.rstrip("/") or "/"

    def do_POST(self) -> None:
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

            reply = generate_with_your_model(cleaned_messages, resume_text)
            self._send_json(200, {"reply": reply})
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
    server = ThreadingHTTPServer((HOST, PORT), ChatHandler)
    print(f"PlacementPal is running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop the server.")
    server.serve_forever()


if __name__ == "__main__":
    main()
