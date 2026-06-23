from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import ollama
import json

app = FastAPI(title="Deadline Guardian AI API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Task(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: str
    estimated_hours: float
    status: str = "pending"
    priority: str = "medium"

MOCK_TASKS = [
    { "id": "1", "title": "DSA Assignment", "priority": "critical", "estimated_hours": 5.0, "due_date": datetime.now().isoformat() },
    { "id": "2", "title": "Review System Design", "priority": "high", "estimated_hours": 3.0, "due_date": datetime.now().isoformat() },
    { "id": "3", "title": "Pay Electricity Bill", "priority": "medium", "estimated_hours": 0.5, "due_date": datetime.now().isoformat() },
]

@app.get("/")
def read_root():
    return {"message": "Welcome to the Deadline Guardian AI API"}

@app.get("/api/tasks")
def get_tasks():
    # Return mock data
    return MOCK_TASKS

@app.post("/api/tasks", response_model=Task)
def create_task(task: Task):
    # For now, append to our in-memory list
    new_task = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "priority": task.priority
    }
    MOCK_TASKS.append(new_task)
    return task

@app.post("/api/analyze_risk")
def analyze_risk(task: Task):
    # Prepare the prompt for Ollama
    prompt = f"""
    You are an AI Productivity Coach. Analyze the following task and predict the risk of missing the deadline.
    
    Task: {task.title}
    Description: {task.description or 'No description provided'}
    Estimated Hours to Complete: {task.estimated_hours}
    Due Date: {task.due_date}
    
    Calculate a 'risk_score' (0-100) indicating the probability of failing to complete the task on time.
    Provide a 'recommendation' on what the user should do immediately.
    Break the task down into a 'breakdown' array of 3-5 smaller actionable steps.
    
    Respond STRICTLY in JSON format with exactly these keys: "risk_score" (integer), "recommendation" (string), "breakdown" (list of strings).
    """
    
    try:
        response = ollama.chat(model='fluffy/l3-8b-stheno-v3.2:q4_k_m', messages=[
            {
                'role': 'system',
                'content': 'You are a precise JSON-generating assistant. Only output valid JSON.'
            },
            {
                'role': 'user',
                'content': prompt
            }
        ], format='json')
        
        result_content = response['message']['content']
        return json.loads(result_content)
    except Exception as e:
        # Fallback if Ollama isn't running or fails
        print(f"Ollama Error: {e}")
        return {
            "risk_score": 50,
            "recommendation": "Unable to connect to local Ollama instance. Please ensure Ollama is running and the model is pulled.",
            "breakdown": ["Check Ollama connection", "Pull the required model", "Retry task"]
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
