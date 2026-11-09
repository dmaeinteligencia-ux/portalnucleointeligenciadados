FROM python:3.12-slim

ARG MODELO_URL=https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip \
 && curl -fsSL "$MODELO_URL" -o /tmp/modelo.zip \
 && unzip -q /tmp/modelo.zip -d /tmp/modelo \
 && mv /tmp/modelo/* /modelo \
 && rm -rf /tmp/modelo /tmp/modelo.zip \
 && apt-get purge -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

# Roda sem privilégios
RUN useradd --system --no-create-home voz
USER voz

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://localhost:8000/saude || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--ws-max-size", "65536", "--no-server-header"]
