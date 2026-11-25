FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agentes ./agentes
COPY setores ./setores

# Roda sem privilégios
RUN useradd --system --create-home agentes && mkdir -p /app/dados && chown agentes /app/dados
USER agentes

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "agentes.chat"]
