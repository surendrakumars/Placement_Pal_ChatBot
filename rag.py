from __future__ import annotations

import base64
import io
import json
import math
import os
import re
import urllib.error
import urllib.request
from typing import Any

# Folder configuration
KNOWLEDGE_BASE_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base")
INDEX_PATH = os.path.join(KNOWLEDGE_BASE_DIR, "index.json")

# Ensure the directory exists
os.makedirs(KNOWLEDGE_BASE_DIR, exist_ok=True)


def tokenize(text: str) -> list[str]:
    """Lowercase and extract words for lexical indexing."""
    return re.findall(r"\b\w+\b", text.lower())


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 120) -> list[str]:
    """Split text into overlapping chunks, respecting boundaries (newlines, sentences)."""
    chunks = []
    text = text.strip()
    if not text:
        return chunks

    start = 0
    while start < len(text):
        if len(text) - start <= chunk_size:
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        end = start + chunk_size
        # Look back for logical boundary points in the latter section of the window
        best_boundary = -1
        for boundary in ["\n\n", "\n", ". ", " "]:
            idx = text.rfind(boundary, start + chunk_size - 120, end)
            if idx != -1:
                best_boundary = idx + len(boundary)
                break

        if best_boundary != -1:
            end = best_boundary

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap
        if start < 0 or start >= len(text):
            break

    return chunks


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Parse PDF bytes to plain text using pypdf, matching main.py logic."""
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install pypdf to process PDF documents: pip install pypdf") from exc

    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages: list[str] = []
    for idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text(extraction_mode="layout")
            # If layout mode returned nothing, try standard text extraction
            if not text or not text.strip():
                text = page.extract_text()
        except Exception as e:
            print(f"pypdf layout mode error on page {idx} (RAG): {e}")
            text = page.extract_text()

        if text:
            # Normalize smart quotes and standard characters
            text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
            text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]", "", text)
            text = re.sub(r"[ \t]{5,}", "    ", text)
            text = re.sub(r"\n{3,}", "\n\n", text)
            pages.append(text.strip())

    return "\n\n".join(pages).strip()


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude_v1 = math.sqrt(sum(a * a for a in v1))
    magnitude_v2 = math.sqrt(sum(b * b for b in v2))
    if not magnitude_v1 or not magnitude_v2:
        return 0.0
    return dot_product / (magnitude_v1 * magnitude_v2)


class BM25Retriever:
    """Zero-dependency BM25/TF-IDF text search retriever."""

    def __init__(self, chunks: list[dict[str, Any]]):
        self.chunks = chunks
        self.doc_frequencies: dict[str, int] = {}
        self.chunk_tokens: list[list[str]] = []
        self.chunk_lengths: list[int] = []
        self.vocab: set[str] = set()

        for chunk in chunks:
            tokens = tokenize(chunk["text"])
            self.chunk_tokens.append(tokens)
            self.chunk_lengths.append(len(tokens))
            unique = set(tokens)
            self.vocab.update(unique)
            for t in unique:
                self.doc_frequencies[t] = self.doc_frequencies.get(t, 0) + 1

        self.num_chunks = len(chunks)
        self.avg_chunk_len = sum(self.chunk_lengths) / max(self.num_chunks, 1)

    def retrieve(self, query: str, top_k: int = 3) -> list[tuple[float, dict[str, Any]]]:
        if not self.chunks or not query.strip():
            return []

        q_tokens = tokenize(query)
        k1 = 1.5
        b = 0.75
        scored_chunks = []

        for idx, chunk in enumerate(self.chunks):
            score = 0.0
            tokens = self.chunk_tokens[idx]
            token_counts: dict[str, int] = {}
            for t in tokens:
                token_counts[t] = token_counts.get(t, 0) + 1

            L = self.chunk_lengths[idx]

            for q_t in q_tokens:
                if q_t not in self.vocab:
                    continue
                tf = token_counts.get(q_t, 0)
                df = self.doc_frequencies.get(q_t, 0)

                # IDF
                idf = math.log((self.num_chunks - df + 0.5) / (df + 0.5) + 1.0)

                # Term Score
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1.0 - b + b * (L / self.avg_chunk_len))
                score += idf * (numerator / denominator)

            scored_chunks.append((score, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        return scored_chunks[:top_k]


class RAGManager:
    """Manages document chunking, embeddings, serialization, and retrieval."""

    def __init__(self) -> None:
        self.chunks: list[dict[str, Any]] = []
        self.file_metadata: dict[str, dict[str, Any]] = {}
        self.load_index()

    def load_index(self) -> None:
        """Load RAG index from JSON file if it exists."""
        if os.path.exists(INDEX_PATH):
            try:
                with open(INDEX_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.chunks = data.get("chunks", [])
                    self.file_metadata = data.get("metadata", {})
            except Exception as e:
                print(f"Error loading RAG index: {e}")
                self.chunks = []
                self.file_metadata = {}

    def save_index(self) -> None:
        """Save RAG index to JSON file."""
        try:
            with open(INDEX_PATH, "w", encoding="utf-8") as f:
                json.dump(
                    {"chunks": self.chunks, "metadata": self.file_metadata},
                    f,
                    indent=2,
                )
        except Exception as e:
            print(f"Error saving RAG index: {e}")

    def list_files(self) -> list[dict[str, Any]]:
        """List all files tracked by the knowledge base."""
        files = []
        for filename, meta in self.file_metadata.items():
            # count chunks for this file
            chunk_count = sum(1 for c in self.chunks if c["filename"] == filename)
            files.append({
                "filename": filename,
                "size": meta.get("size", 0),
                "modified": meta.get("modified", 0),
                "chunk_count": chunk_count,
            })
        return sorted(files, key=lambda x: x["filename"])

    def parse_file(self, file_path: str) -> str:
        """Parse text content from a text or PDF file."""
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".pdf":
            with open(file_path, "rb") as f:
                import io
                # We defer io import to function level
                return extract_pdf_text(f.read())
        else:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()

    def generate_embeddings_for_chunks(
        self,
        new_chunks: list[dict[str, Any]],
        env_vars: dict[str, str],
    ) -> None:
        """Compute semantic embeddings for a list of chunks using configured LLM APIs."""
        # Check if RAG config is enabled and strategy requires embeddings
        config_path = os.path.join(KNOWLEDGE_BASE_DIR, "config.json")
        strategy = "bm25"
        enabled = True
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    strategy = cfg.get("strategy", "bm25")
                    enabled = cfg.get("enabled", True)
            except Exception:
                pass

        if not enabled or strategy != "embeddings":
            # Skip generating embeddings if RAG is disabled or strategy is lexical (BM25)
            return

        openai_key = env_vars.get("OPENAI_API_KEY")
        hf_token = env_vars.get("HF_API_TOKEN") or env_vars.get("HF_TOKEN")
        use_ollama = env_vars.get("USE_OLLAMA") == "1"

        for idx, chunk in enumerate(new_chunks):
            embedding = None
            text = chunk["text"]

            try:
                if openai_key:
                    embedding = self._get_openai_embedding(text, openai_key, env_vars.get("OPENAI_EMBEDDING_MODEL"))
                elif use_ollama:
                    ollama_url = env_vars.get("OLLAMA_URL", "http://127.0.0.1:11434/api/embeddings")
                    ollama_model = env_vars.get("OLLAMA_MODEL", "llama3.1:8b")
                    embedding = self._get_ollama_embedding(text, ollama_url, ollama_model)
                elif hf_token:
                    hf_model = env_vars.get("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
                    embedding = self._get_hf_embedding(text, hf_token, hf_model)
            except Exception as e:
                print(f"Failed to generate embedding for chunk {idx}: {e}")

            if embedding:
                chunk["embedding"] = embedding

    def _get_openai_embedding(self, text: str, key: str, model: str | None = None) -> list[float] | None:
        payload = {
            "input": text,
            "model": model or "text-embedding-3-small",
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        res = self._post_json("https://api.openai.com/v1/embeddings", payload, headers)
        if "data" in res and len(res["data"]) > 0:
            return res["data"][0]["embedding"]
        return None

    def _get_ollama_embedding(self, text: str, url: str, model: str) -> list[float] | None:
        # Standardize URL to embeddings endpoint
        if "/api/generate" in url:
            url = url.replace("/api/generate", "/api/embeddings")
        elif "/api/chat" in url:
            url = url.replace("/api/chat", "/api/embeddings")
        elif not url.endswith("/api/embeddings"):
            url = url.rstrip("/") + "/api/embeddings"

        payload = {
            "model": model,
            "prompt": text,
        }
        res = self._post_json(url, payload)
        if "embedding" in res:
            return res["embedding"]
        return None

    def _get_hf_embedding(self, text: str, token: str, model: str) -> list[float] | None:
        url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        # Payload for feature-extraction is just text or list of texts in JSON
        payload = {"inputs": [text]}
        res = self._post_json(url, payload, headers)
        # Hugging Face usually returns list of floats (embedding) for list input
        if isinstance(res, list) and len(res) > 0:
            if isinstance(res[0], list):
                return res[0] # first element's embedding
            return res # flat list
        return None

    def _post_json(
        self,
        url: str,
        payload: dict[str, Any] | list[Any],
        headers: dict[str, str] | None = None,
    ) -> Any:
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
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            # Let it bubble or return empty
            raise RuntimeError(f"Embedding request failed: {e}")

    def add_file(self, filename: str, file_bytes: bytes, env_vars: dict[str, str]) -> dict[str, Any]:
        """Save a new file to the knowledge base folder and re-index it."""
        # Sanitize filename
        safe_name = os.path.basename(filename)
        dest_path = os.path.join(KNOWLEDGE_BASE_DIR, safe_name)

        # Write file
        with open(dest_path, "wb") as f:
            f.write(file_bytes)

        # Parse text content
        text_content = self.parse_file(dest_path)
        file_size = len(file_bytes)
        mod_time = int(os.path.getmtime(dest_path) * 1000)

        # Remove old chunks for this file if it already existed
        self.chunks = [c for c in self.chunks if c["filename"] != safe_name]

        # Chunk and Index
        new_chunks_text = chunk_text(text_content)
        new_chunks = []
        for idx, text in enumerate(new_chunks_text):
            new_chunks.append({
                "id": f"{safe_name}_{idx}",
                "filename": safe_name,
                "text": text,
            })

        # Generate embeddings if settings specify
        self.generate_embeddings_for_chunks(new_chunks, env_vars)

        self.chunks.extend(new_chunks)
        self.file_metadata[safe_name] = {
            "size": file_size,
            "modified": mod_time,
        }
        self.save_index()

        return {
            "filename": safe_name,
            "size": file_size,
            "chunk_count": len(new_chunks),
        }

    def delete_file(self, filename: str) -> bool:
        """Remove a file from the knowledge base folder and index."""
        safe_name = os.path.basename(filename)
        file_path = os.path.join(KNOWLEDGE_BASE_DIR, safe_name)

        if os.path.exists(file_path):
            os.remove(file_path)

        # Remove from index
        initial_chunk_count = len(self.chunks)
        self.chunks = [c for c in self.chunks if c["filename"] != safe_name]
        
        if safe_name in self.file_metadata:
            del self.file_metadata[safe_name]
            self.save_index()
            return True
            
        return len(self.chunks) < initial_chunk_count

    def scan_and_rebuild(self, env_vars: dict[str, str]) -> None:
        """Scan folder for any files added/removed directly and rebuild index."""
        existing_files = [
            f for f in os.listdir(KNOWLEDGE_BASE_DIR)
            if os.path.isfile(os.path.join(KNOWLEDGE_BASE_DIR, f)) and f != "index.json"
        ]

        # Check for deleted files
        for filename in list(self.file_metadata.keys()):
            if filename not in existing_files:
                del self.file_metadata[filename]
                self.chunks = [c for c in self.chunks if c["filename"] != filename]

        # Check for new or modified files
        for filename in existing_files:
            file_path = os.path.join(KNOWLEDGE_BASE_DIR, filename)
            mod_time = int(os.path.getmtime(file_path) * 1000)
            file_size = os.path.getsize(file_path)

            meta = self.file_metadata.get(filename)
            if not meta or meta.get("modified") != mod_time or meta.get("size") != file_size:
                # File is new or changed
                try:
                    text_content = self.parse_file(file_path)
                    self.chunks = [c for c in self.chunks if c["filename"] != filename]

                    new_chunks_text = chunk_text(text_content)
                    new_chunks = []
                    for idx, text in enumerate(new_chunks_text):
                        new_chunks.append({
                            "id": f"{filename}_{idx}",
                            "filename": filename,
                            "text": text,
                        })

                    self.generate_embeddings_for_chunks(new_chunks, env_vars)
                    self.chunks.extend(new_chunks)
                    self.file_metadata[filename] = {
                        "size": file_size,
                        "modified": mod_time,
                    }
                except Exception as e:
                    print(f"Failed to scan/index file {filename}: {e}")

        self.save_index()

    def query(
        self,
        query_text: str,
        top_k: int = 3,
        strategy: str = "bm25",
        env_vars: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve top_k most relevant chunks using BM25 or semantic embeddings."""
        if not self.chunks or not query_text.strip():
            return []

        if strategy == "embeddings" and env_vars:
            # Try semantic retrieval
            query_embedding = None
            openai_key = env_vars.get("OPENAI_API_KEY")
            hf_token = env_vars.get("HF_API_TOKEN") or env_vars.get("HF_TOKEN")
            use_ollama = env_vars.get("USE_OLLAMA") == "1"

            try:
                if openai_key:
                    query_embedding = self._get_openai_embedding(
                        query_text, openai_key, env_vars.get("OPENAI_EMBEDDING_MODEL")
                    )
                elif use_ollama:
                    ollama_url = env_vars.get("OLLAMA_URL", "http://127.0.0.1:11434/api/embeddings")
                    ollama_model = env_vars.get("OLLAMA_MODEL", "llama3.1:8b")
                    query_embedding = self._get_ollama_embedding(query_text, ollama_url, ollama_model)
                elif hf_token:
                    hf_model = env_vars.get("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
                    query_embedding = self._get_hf_embedding(query_text, hf_token, hf_model)
            except Exception as e:
                print(f"RAG query embedding generation failed, falling back to BM25: {e}")

            if query_embedding:
                scored = []
                for chunk in self.chunks:
                    chunk_emb = chunk.get("embedding")
                    if chunk_emb:
                        sim = cosine_similarity(query_embedding, chunk_emb)
                        scored.append((sim, chunk))
                scored.sort(key=lambda x: x[0], reverse=True)
                # Filter out formatting variables (like embedding floats) to save bandwidth/prompt tokens
                results = []
                for score, chunk in scored[:top_k]:
                    results.append({
                        "score": score,
                        "filename": chunk["filename"],
                        "text": chunk["text"],
                    })
                return results

        # Fallback to BM25 lexical search
        retriever = BM25Retriever(self.chunks)
        results_raw = retriever.retrieve(query_text, top_k=top_k)
        return [
            {
                "score": score,
                "filename": chunk["filename"],
                "text": chunk["text"],
            }
            for score, chunk in results_raw
        ]
