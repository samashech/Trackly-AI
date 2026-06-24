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

MOCK_TASKS = []

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
    return new_task

@app.put("/api/tasks/{task_id}")
def update_task_status(task_id: str, payload: dict):
    for t in MOCK_TASKS:
        if t["id"] == task_id:
            t["status"] = payload.get("status", t["status"])
            if "due_date" in payload:
                t["due_date"] = payload["due_date"]
            if "estimated_hours" in payload:
                t["estimated_hours"] = payload["estimated_hours"]
            return t
    return {"error": "not found"}

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

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    tasks_context: str

@app.post("/api/chat")
def chat_with_ai(req: ChatRequest):
    system_prompt = f"""
    You are an aggressive but supportive AI Execution Coach.
    You have direct access to the user's task list: {req.tasks_context}
    
    Answer the user's questions based on their tasks. If they ask what to do, prioritize tasks with high risk scores.
    Be concise, direct, and actionable.
    """
    
    # Prepend system prompt to the messages
    ollama_messages = [{'role': 'system', 'content': system_prompt}]
    for msg in req.messages:
        ollama_messages.append({'role': msg.role, 'content': msg.content})
        
    try:
        response = ollama.chat(model='fluffy/l3-8b-stheno-v3.2:q4_k_m', messages=ollama_messages)
        return {"reply": response['message']['content']}
    except Exception as e:
        print(f"Ollama Chat Error: {e}")
        return {"reply": "I'm having trouble connecting to my local brain. Ensure Ollama is running."}

class PlannerChatRequest(BaseModel):
    messages: List[ChatMessage]

@app.post("/api/planner_chat")
def planner_chat(req: PlannerChatRequest):
    current_time = datetime.now().isoformat()
    system_prompt = f"""
    You are an AI Task Planner. Your goal is to help the user create a highly specific task for their execution dashboard.
    The current date and time is: {current_time}.
    
    You must gather 4 pieces of information from the user:
    1. Title (What they want to do)
    2. Estimated Hours (How long it will take, a float number e.g. 2.5)
    3. Priority (must be exactly one of: "critical", "high", "medium", "low")
    4. Due Date: Accept ANY natural language format from the user (e.g. "25 june 8 pm", "tomorrow"). Do NOT ask them to reformat it. You must silently convert their answer into a strict ISO datetime string based on the current time.

    CRITICAL RULES:
    - DO NOT use long conversational paragraphs.
    - If you are missing information, reply ONLY with a concise bulleted list of what you still need. Example:
      "Got it. I still need:
      - Estimated duration in hours
      - Due date/time
      - Priority level"
    - NEVER mention the word "JSON", "code", or "compiling" to the user.
    
    IMPORTANT TRIGGER: ONCE you have gathered ALL 4 pieces of information, you MUST output ONLY a JSON block like this, surrounded by triple backticks:
    ```json
    {{
      "action": "CREATE_TASK",
      "task": {{
        "title": "Study Biology",
        "estimated_hours": 2.5,
        "priority": "high",
        "due_date": "2026-06-25T15:00:00"
      }}
    }}
    ```
    Do not add ANY conversational text before or after the JSON block. Output ONLY the JSON block.
    """
    
    ollama_messages = [{'role': 'system', 'content': system_prompt}]
    for msg in req.messages:
        ollama_messages.append({'role': msg.role, 'content': msg.content})
        
    try:
        response = ollama.chat(model='fluffy/l3-8b-stheno-v3.2:q4_k_m', messages=ollama_messages)
        return {"reply": response['message']['content']}
    except Exception as e:
        print(f"Ollama Chat Error: {e}")
        return {"reply": "I'm having trouble connecting to the local brain. Ensure Ollama is running."}

@app.post("/api/interrogation_chat")
def interrogation_chat(req: PlannerChatRequest):
    current_time = datetime.now().isoformat()
    system_prompt = f"""
    You are an aggressive, strict AI Accountability Coach. The user has FAILED to meet their deadline.
    The current date and time is: {current_time}.
    
    Your goal is to:
    1. Interrogate them on WHY they failed.
    2. Force them to commit to a NEW deadline (Date/Time) and NEW estimated hours to finish the task.
    
    CRITICAL RULES:
    - Keep responses short, direct, and slightly scolding but constructive.
    - Accept any natural language date for the new deadline (e.g. "tomorrow 5pm") and silently convert it to ISO format.
    - NEVER mention the word "JSON", "code", or "compiling".
    
    IMPORTANT TRIGGER: ONCE the user has explained themselves AND provided a new deadline and estimated hours, you MUST output ONLY a JSON block like this, surrounded by triple backticks:
    ```json
    {{
      "action": "RESCHEDULE_TASK",
      "task": {{
        "due_date": "2026-06-25T15:00:00",
        "estimated_hours": 2.5
      }}
    }}
    ```
    Do not add ANY conversational text before or after the JSON block. Output ONLY the JSON block.
    """
    
    ollama_messages = [{'role': 'system', 'content': system_prompt}]
    for msg in req.messages:
        ollama_messages.append({'role': msg.role, 'content': msg.content})
        
    try:
        response = ollama.chat(model='fluffy/l3-8b-stheno-v3.2:q4_k_m', messages=ollama_messages)
        return {"reply": response['message']['content']}
    except Exception as e:
        print(f"Ollama Chat Error: {e}")
        return {"reply": "I'm having trouble connecting to the local brain. Ensure Ollama is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
