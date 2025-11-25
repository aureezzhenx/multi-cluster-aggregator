FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY cluster.json .
COPY users.json .

EXPOSE 8000

ENV CLUSTERS_FILE=/app/cluster.json

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
