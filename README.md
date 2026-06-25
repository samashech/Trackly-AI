# ActionMate AI 🚀

ActionMate AI is a ruthless, autonomous productivity application designed for extreme procrastinators. 

## 🚨 The Problem
Traditional to-do lists are passive. They let you write down tasks and then happily sit back while you completely ignore them. When you miss a deadline, nothing happens. You feel a tiny pang of guilt, and then you open YouTube. The system enables your procrastination instead of fighting it.

## 💡 Our Solution
ActionMate AI takes a hostile approach to productivity. It acts as an aggressive accountability partner with a built-in Chrome Extension "bodyguard". 

When you set a task, you assign a deadline and a list of websites you use to procrastinate (like `youtube.com` or `instagram.com`). If you miss that deadline, the entire system goes into **Nuclear Lockdown**:
1. Your dashboard is hijacked, replaced by a flashing red alert.
2. An AI Coach (powered locally by Ollama) interrogates you on why you failed.
3. The Chrome Extension actively intercepts and blocks you from accessing your assigned distraction websites, forcefully redirecting you back to the interrogation screen.
4. The lockdown *only* ends when you successfully negotiate a new deadline with the AI.

## ⚙️ How It Works
The architecture consists of three integrated systems running entirely on your local machine for maximum speed and privacy:
* **The Brain (Backend):** A Python **FastAPI** server that acts as our database and communicates with **Ollama** (a local AI model running `Llama 3`) to parse natural language into structured JSON tasks and run the interrogation chat.
* **The Dashboard (Frontend):** A beautiful glassmorphism **React + Vite** web app where you manage your tasks, view your AI Risk Analysis, and chat with the AI Planner.
* **The Enforcer (Chrome Extension):** A custom Google Chrome extension that quietly polls the backend. When a task goes overdue, it dynamically extracts the `blocked_sites` array for that specific task and instantly redirects your browser if you try to visit them.

## 🔒 Privacy & Security (100% Local)
**None of your personal data is stolen, tracked, or sent to the cloud.** 
Because this application uses **Ollama** to run the Artificial Intelligence directly on your computer's own hardware, you do not need an internet connection to use the AI Planner or the AI Interrogation features. Your tasks, your browsing history, and your conversations with the AI never leave your local system.

---

## 🚀 How to Run It on Your System

### Prerequisites
1. **Node.js & npm** (For the frontend)
2. **Python 3.10+** (For the backend)
3. **Ollama** (Installed locally and running the `Llama 3` model).

### Step 1: Install Dependencies
Open a terminal in the project root:
```bash
# Setup Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn pydantic ollama

# Setup Frontend
cd ../frontend
npm install
```

### Step 2: Boot Up the Servers
We have included a master startup script to easily boot both the Python and React servers in a single terminal.
```bash
# From the root project directory:
chmod +x start.sh
./start.sh
```
The website will now be live at `http://localhost:5173`.

### Step 3: Install the Chrome Enforcer
To enable the website blocking feature:
1. Open Google Chrome (or Brave/Edge).
2. Navigate to `chrome://extensions/` in your URL bar.
3. Toggle on **"Developer mode"** in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select the `extension/` folder located inside this project directory.

You're done! Create a task, set the deadline for 1 minute ago, assign `youtube.com` to the blocked sites, and watch the system go nuclear!
