# ==========================================
# Stage 1: Build the frontend React application
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package configurations and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy the frontend source and build static assets
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Create the Python backend execution environment
# ==========================================
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies if any are needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source files
COPY main.py rag.py generate_kb.py verify_rag.py ./

# Copy built frontend assets from Stage 1 to the backend's expected directory
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose default backend port
EXPOSE 5000

# Set environment variables defaults
ENV PORT=5000
ENV HOST=0.0.0.0

# Start command
CMD ["python", "main.py"]
