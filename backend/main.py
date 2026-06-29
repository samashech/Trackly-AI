from fastapi import FastAPI, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import ollama
import json
import os

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
    blocked_sites: List[str] = []
    created_at: Optional[str] = None
    completed_at: Optional[str] = None

class Habit(BaseModel):
    id: str
    title: str
    streak: int = 0
    completed_today: bool = False
    tracked_domains: List[str] = []
    requires_proof: bool = False


DB_FILE = "actionmate_db.json"
def load_db():
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"tasks": {}, "habits": {}, "usage": {}}

def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f)

DB = load_db()
ACTIVE_USER_ID = "default"

def get_user_id(x_user_id: Optional[str] = Header(None)):
    global ACTIVE_USER_ID
    if x_user_id:
        ACTIVE_USER_ID = x_user_id
    return ACTIVE_USER_ID


@app.get("/")
def read_root():
    return {"message": "Welcome to the Deadline Guardian AI API"}

@app.get("/api/tasks")
def get_tasks(user_id: str = Depends(get_user_id)):
    now = datetime.now()
    valid_tasks = []
    for t in DB['tasks'].get(user_id, []):
        if t.get("status") == "completed" and t.get("completed_at"):
            completed_date = datetime.fromisoformat(t["completed_at"])
            if (now - completed_date).days > 7:
                continue # Auto-cleanup
        valid_tasks.append(t)
    DB['tasks'][user_id] = valid_tasks
    save_db(DB)
    return valid_tasks

@app.post("/api/tasks", response_model=Task)
def create_task(task: Task, user_id: str = Depends(get_user_id)):
    new_task = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "priority": task.priority,
        "blocked_sites": task.blocked_sites,
        "created_at": task.created_at or datetime.now().isoformat(),
        "completed_at": None
    }
    if user_id not in DB['tasks']: DB['tasks'][user_id] = []
    DB['tasks'][user_id].append(new_task)
    save_db(DB)
    return new_task

@app.put("/api/tasks/{task_id}")
def update_task_status(task_id: str, payload: dict, user_id: str = Depends(get_user_id)):
    for t in DB['tasks'].get(user_id, []):
        if t["id"] == task_id:
            old_status = t.get("status")
            if "status" in payload:
                t["status"] = payload["status"]
            
            # Record completed_at time when marked as completed
            if payload.get("status") == "completed" and old_status != "completed":
                t["completed_at"] = datetime.now().isoformat()
                
            if "due_date" in payload: t["due_date"] = payload["due_date"]
            if "estimated_hours" in payload: t["estimated_hours"] = payload["estimated_hours"]
            if "title" in payload: t["title"] = payload["title"]
            if "priority" in payload: t["priority"] = payload["priority"]
            if "blocked_sites" in payload: t["blocked_sites"] = payload["blocked_sites"]
            
            save_db(DB)
            return t
    return {"error": "not found"}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str, user_id: str = Depends(get_user_id)):
    if user_id in DB['tasks']:
        DB['tasks'][user_id] = [t for t in DB['tasks'][user_id] if t["id"] != task_id]
        save_db(DB)
    return {"status": "ok"}



class UsagePayload(BaseModel):
    domain: str
    seconds: int

@app.post("/api/usage")
def report_usage(payload: UsagePayload, user_id: str = Depends(get_user_id)):
    if user_id not in DB['usage']: DB['usage'][user_id] = {}
    DB['usage'][user_id][payload.domain] = DB['usage'][user_id].get(payload.domain, 0) + payload.seconds
    save_db(DB)
    return {"status": "ok"}

@app.get("/api/usage")
def get_usage(user_id: str = Depends(get_user_id)):
    return DB['usage'].get(user_id, {})

@app.get("/api/habits")
def get_habits(user_id: str = Depends(get_user_id)):
    return DB['habits'].get(user_id, [])

@app.post("/api/habits")
def create_habit(habit: Habit, user_id: str = Depends(get_user_id)):
    new_h = habit.dict()
    if user_id not in DB['habits']: DB['habits'][user_id] = []
    DB['habits'][user_id].append(new_h)
    save_db(DB)
    return new_h

@app.put("/api/habits/{habit_id}/toggle")
def toggle_habit(habit_id: str, user_id: str = Depends(get_user_id)):
    for h in DB['habits'].get(user_id, []):
        if h["id"] == habit_id:
            h["completed_today"] = not h["completed_today"]
            if h["completed_today"]:
                h["streak"] += 1
            else:
                h["streak"] = max(0, h["streak"] - 1)
            save_db(DB)
            return h
    return {"error": "not found"}

@app.put("/api/habits/{habit_id}")
def update_habit(habit_id: str, payload: dict, user_id: str = Depends(get_user_id)):
    for h in DB['habits'].get(user_id, []):
        if h["id"] == habit_id:
            if "title" in payload:
                h["title"] = payload["title"]
            save_db(DB)
            return h
    return {"error": "not found"}

@app.delete("/api/habits/{habit_id}")
def delete_habit(habit_id: str, user_id: str = Depends(get_user_id)):
    if user_id in DB['habits']:
        DB['habits'][user_id] = [h for h in DB['habits'][user_id] if h["id"] != habit_id]
    save_db(DB)
    return {"status": "deleted"}

class VerifyPayload(BaseModel):
    image_base64: str

@app.post("/api/habits/{habit_id}/verify")
def verify_habit(habit_id: str, payload: VerifyPayload, user_id: str = Depends(get_user_id)):
    target_habit = next((h for h in DB['habits'].get(user_id, []) if h["id"] == habit_id), None)
    if not target_habit:
        return {"error": "not found"}

    b64_data = payload.image_base64
    if "base64," in b64_data:
        b64_data = b64_data.split("base64,")[1]

    try:
        # Step 1: The "Eyes" (Moondream describes the image)
        vision_response = ollama.generate(
            model='moondream',
            prompt="Describe exactly what is happening in this image in detail.",
            images=[b64_data]
        )
        image_description = vision_response['response'].strip()
        
        # Step 2: The "Judge" (Stheno evaluates the description)
        judge_prompt = f"""
        You are a strict AI judge. The user is trying to prove they completed the habit: "{target_habit['title']}".
        Here is what the camera sees: {image_description}
        
        Did the user complete the habit based on this description? 
        Answer strictly with the word YES or NO, followed by a one-sentence sassy explanation.
        """
        judge_response = ollama.chat(
            model="fluffy/l3-8b-stheno-v3.2:q4_k_m",
            messages=[{"role": "user", "content": judge_prompt}]
        )
        resp_text = judge_response['message']['content'].strip()
        
        if resp_text.upper().startswith("YES"):
            result = {"verified": True, "sassy_reason": resp_text}
        else:
            result = {"verified": False, "sassy_reason": resp_text}
            
        if result.get("verified"):
            target_habit["completed_today"] = True
            target_habit["streak"] += 1
            save_db(DB)
        return result
    except Exception as e:
        return {"verified": False, "sassy_reason": f"AI Verification failed: {str(e)}"}

class OnboardingRequest(BaseModel):
    user_mission: str

@app.post("/api/onboarding_generate")
def onboarding_generate(req: OnboardingRequest):
    now_iso = datetime.now().isoformat()
    prompt = f"""
    Current Date and Time: {now_iso}
    
    You are an AI onboarding assistant for Trackly. A new user just joined and stated their primary mission: "{req.user_mission}".
    Generate a "Starter Pack" of exactly 3 realistic, specific tasks to help them get started right now.
    
    You MUST output ONLY a raw JSON array of objects. Do NOT use markdown code blocks like ```json.
    Format exactly like this:
    [
      {{
        "title": "Task 1",
        "estimated_hours": 1.5,
        "due_date": "2026-06-30T20:00:00",
        "priority": "high",
        "blocked_sites": ["youtube.com", "instagram.com"]
      }}
    ]
    """
    try:
        response = ollama.chat(
            model="fluffy/l3-8b-stheno-v3.2:q4_k_m",
            messages=[{"role": "user", "content": prompt}]
        )
        return {"tasks_json": response['message']['content']}
    except Exception as e:
        return {"error": str(e)}

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
    
    CRITICAL FORMATTING RULE: ALWAYS respond using clear bullet points. Every single point must be on a new line. Never use long paragraphs.
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
    
    You need to collect 5 details from the user:
    1. Title
    2. Estimated Hours
    3. Priority level
    4. Due Date
    5. Blocked Sites
    
    CRITICAL RULES:
    - If the user provides a natural language due date (e.g., "tomorrow at 5pm"), you MUST accept it. DO NOT ask them to format it as an ISO string. You will do the conversion yourself at the end.
    - If the user says "1 hour", accept it. DO NOT ask them to format it as a float.
    - If you are missing any of the 5 pieces of information, reply ONLY with a concise bulleted list of what you still need. DO NOT ask for exact formats.
      Example:
      "Got it. I still need:
      - Estimated duration
      - Any websites to block"
    - NEVER mention the word "JSON", "ISO format", or "float" to the user.
    
    IMPORTANT TRIGGER: ONCE you have all 5 pieces of information (even in casual language), you MUST STOP conversing and output ONLY a JSON block, surrounded by triple backticks, where YOU format the data correctly:
    ```json
    {{
      "action": "CREATE_TASK",
      "task": {{
        "title": "Study Biology",
        "estimated_hours": 2.5,
        "priority": "high",
        "due_date": "2026-06-25T15:00:00",
        "blocked_sites": ["youtube.com", "instagram.com"]
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
