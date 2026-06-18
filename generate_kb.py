import os
import sys

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

load_env_file(".env")

# SSL Setup for Windows
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
    
# Disabling SSL warning/verification for requests if needed, but huggingface_hub uses standard libraries or requests.
# We also try to patch ssl directly:
import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

from huggingface_hub import InferenceClient

HF_TOKEN = os.getenv("HF_TOKEN")
HF_MODEL = os.getenv("HF_MODEL", "meta-llama/Llama-3.1-8B-Instruct")
HF_PROVIDER = os.getenv("HF_PROVIDER", "auto")

if not HF_TOKEN:
    print("Error: HF_TOKEN not found in environment or .env file.")
    sys.exit(1)

client = InferenceClient(provider=HF_PROVIDER, api_key=HF_TOKEN)

topics = {
    "dsa_guide.txt": (
        "Write a detailed reference guide for Data Structures and Algorithms (DSA) targeted at campus placement prep. "
        "Include definitions, key operations, time complexities (Big-O) for Arrays, Linked Lists, Stacks, Queues, Binary Trees, BSTs, Graphs, and Hash Tables. "
        "Also describe common algorithm patterns like Two Pointers, Sliding Window, Recursion, Binary Search, and Dynamic Programming."
    ),
    "aptitude_guide.txt": (
        "Write a comprehensive reference guide for quantitative aptitude and logical reasoning topics commonly asked in campus recruitment. "
        "Include key formulas, shortcuts, and quick guides for: Percentages, Profit & Loss, Simple & Compound Interest, Ratio & Proportion, Time & Work, Speed-Time-Distance, Probability, Permutations & Combinations, and Number Systems."
    ),
    "hr_interview_guide.txt": (
        "Write a comprehensive guide for HR and Behavioral Interviews for college graduates. "
        "Explain the STAR (Situation, Task, Action, Result) method in detail. "
        "Provide model answer structures and key tips for common HR questions: 'Tell me about yourself', 'Why do you want to join our company?', 'What are your strengths and weaknesses?', and 'Describe a time you resolved a team conflict'."
    ),
    "resume_guide.txt": (
        "Write a detailed guideline document on how to build a high-scoring resume for entry-level software engineering and technology placement roles. "
        "Explain resume structure (Contact, Summary, Education, Experience, Projects, Skills), the use of action verbs, how to quantify achievements, and what mistakes to avoid (like generic summaries or lack of metrics)."
    )
}

os.makedirs("knowledge_base", exist_ok=True)

print("Starting artificial generation of placement knowledge base guides using Llama-3.1...")

for filename, prompt in topics.items():
    dest_path = os.path.join("knowledge_base", filename)
    print(f"Generating {filename}...")
    
    try:
        completion = client.chat.completions.create(
            model=HF_MODEL,
            messages=[
                {"role": "system", "content": "You are a professional campus placement expert and technical content writer. Output detailed, well-structured, clean educational text with headings and bullet points. Do not include markdown code block styling or meta-intro/outro remarks, just output the content directly."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            temperature=0.3
        )
        
        content = completion.choices[0].message.content.strip()
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Successfully saved {filename} ({len(content)} characters).")
        
    except Exception as e:
        print(f"Failed to generate {filename}: {e}")

print("\nFinished generating knowledge base files! Next, run 'python verify_rag.py' to rebuild the search index.")
