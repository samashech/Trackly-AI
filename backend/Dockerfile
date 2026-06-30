FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install google-generativeai

COPY . .

# Run the FastAPI server
# Cloud Run sets the PORT environment variable dynamically
CMD exec uvicorn main:app --host 0.0.0.0 --port 7860
