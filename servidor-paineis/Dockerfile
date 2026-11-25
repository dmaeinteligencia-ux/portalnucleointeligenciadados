FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && apt-get update \
 && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY app ./app

# Roda sem privilégios
RUN useradd --system --no-create-home paineis
USER paineis

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD curl -fs http://localhost:8000/saude || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]
