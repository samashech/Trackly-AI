# Trackly 🚀

Trackly (formerly ActionMate AI) is a ruthless, autonomous productivity application designed for extreme procrastinators. 

## 🏆 Gemini API Developer Competition Submission
This project is powered entirely by **Google's Gemini 2.5 Flash** model, utilizing its lightning-fast multimodal reasoning capabilities to act as a task planner, an image-verifying habit judge, and a ruthless accountability coach.

**🔗 Live Deployed Link:** [https://actionmate-ai-79bd2.web.app](https://actionmate-ai-79bd2.web.app)  
*(Frontend hosted on Google Firebase, AI Backend hosted on Hugging Face Spaces. The live backend securely hosts our Gemini API key, so you can test the AI immediately without any setup!)*

## 🚨 The Problem
Traditional to-do lists are passive. They let you write down tasks and then happily sit back while you completely ignore them. When you miss a deadline, nothing happens. You feel a tiny pang of guilt, and then you open YouTube. The system enables your procrastination instead of fighting it.

## 💡 Our Solution
Trackly takes a hostile approach to productivity. It acts as an aggressive accountability partner. 

When you set a task, you assign a deadline and a list of websites you use to procrastinate (like `youtube.com` or `instagram.com`). If you miss that deadline, the entire system goes into **Nuclear Lockdown**:
1. Your dashboard is hijacked, replaced by a flashing red alert.
2. An **AI Coach** (powered by Gemini) interrogates you on why you failed, analyzing your excuses in real-time.
3. A custom Chrome Extension actively intercepts and blocks you from accessing your assigned distraction websites, forcefully redirecting you back to the interrogation screen.
4. The lockdown *only* ends when you successfully negotiate a new deadline with the AI.

Additionally, Trackly features **Visual Habit Verification**. Instead of simply checking a box to say you "Read a book", you must upload a photo of the book. Gemini 2.5 Flash's multimodal vision capabilities instantly analyze the image to verify if you are actually performing the habit before giving you credit!

## ⚙️ Architecture & Tech Stack
* **The Brain (Backend):** A Python **FastAPI** server that communicates with the **Google Gemini API** (`gemini-2.5-flash`) to parse natural language into structured JSON tasks, run the interrogation chat, and verify habit proof images.
* **The Dashboard (Frontend):** A beautiful glassmorphism **React + Vite** web app where you manage your tasks, view your AI Risk Analysis, and chat with the AI Planner.
* **The Enforcer (Chrome Extension):** A custom Google Chrome extension that quietly polls the backend. When a task goes overdue, it dynamically extracts the `blocked_sites` array for that specific task and instantly redirects your browser if you try to visit them.

---

## 🚀 How to Run It Locally (For Judges)

While the app is deployed live, you can easily run it on your local machine to test the Chrome Extension feature.

### Prerequisites
1. **Node.js & npm**
2. **Python 3.10+**
3. **Gemini API Key** (from Google AI Studio)

### Step 1: Start the Backend
Open a terminal in the project root:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt

# Set your Gemini API key
export GEMINI_API_KEY="your_api_key_here"

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 2: Start the Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
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
