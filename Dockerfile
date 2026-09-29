# Python >= 3.12 is mandatory: requirements.txt pins numpy==2.5.2 and scipy==1.18.1,
# both of which declare Requires-Python >=3.12. 3.14 matches the verified local venv (3.14.2).
FROM python:3.14-slim

WORKDIR /app

# Install system dependencies (build-essential for C extensions, libpq for postgres, tesseract for OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and data
COPY backend/ ./backend/
COPY data/ ./data/
COPY scripts/ ./scripts/

# Default port for Hugging Face Spaces is 7860
ENV PORT=7860
EXPOSE 7860

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
