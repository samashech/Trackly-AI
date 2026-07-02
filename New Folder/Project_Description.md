# Trackly (formerly ActionMate AI)
**Gemini API Developer Competition Submission**

---

## 1. Project Overview
**Trackly** is an autonomous, ruthless productivity application designed to cure extreme procrastination. Unlike passive to-do lists that allow users to ignore missed deadlines without consequence, Trackly takes a hostile, proactive approach. It combines an intelligent task planner, an aggressive AI accountability coach, and a custom browser enforcer to forcefully keep users on track. 

By leveraging the cutting-edge reasoning and multimodal vision capabilities of **Google's Gemini 1.5 Flash**, Trackly completely redefines how a productivity app interacts with its user.

---

## 2. The Problem Statement
Modern productivity tools suffer from a critical flaw: they are passive. When a user creates a task in a traditional to-do app and subsequently misses the deadline, the system does nothing. The user feels a brief moment of guilt, clears the notification, and immediately opens YouTube, Instagram, or Reddit. 

The software enables the user's procrastination rather than actively fighting it. There are website blockers available, but they are rigid and easily bypassed by turning them off. There is a desperate need for a dynamic accountability partner that can adapt to the user's behavior, enforce real consequences for missing deadlines, and visually verify that positive habits are actually being formed.

---

## 3. Our Solution
Trackly is a dynamic, AI-driven accountability system with three core features:

1. **Nuclear Lockdown (The Enforcer):** When setting a task, the user specifies a deadline and a list of their specific distraction websites (e.g., `youtube.com`). If the deadline is missed, the backend triggers a "Nuclear Lockdown". A custom Chrome Extension acts as a digital bodyguard, actively intercepting the user's web requests and forcefully redirecting them away from their assigned distractions until they address the overdue task.
2. **Aggressive AI Interrogation:** During a lockdown, the user cannot simply click a button to dismiss the alert. They must interact with the Gemini-powered AI Coach. The AI interrogates the user on why they failed, analyzes their excuses in real-time, and forces them to negotiate a new, realistic deadline before the browser lock is lifted.
3. **Visual Habit Verification:** Instead of honor-system checkboxes, Trackly enforces habits through visual proof. If the user commits to "Reading a book for 30 minutes", they must upload a live photo of the book. Gemini's multimodal vision API instantly analyzes the image to verify compliance before awarding credit.

---

## 4. How We Built It (Architecture & Tech Stack)
We built Trackly as a distributed, full-stack application that seamlessly blends a modern web interface with a powerful AI backend and browser-level enforcement.

### The Backend (The Brain)
* **Framework:** Python FastAPI
* **AI Integration:** Google Generative AI SDK (`gemini-1.5-flash-latest`)
* **Functionality:** The backend acts as the central nervous system. It receives natural language inputs from the user and uses Gemini to structure them into JSON task objects. It handles the continuous polling for overdue tasks, manages the database, and processes image uploads, passing them directly to Gemini 1.5 Flash for rapid multimodal analysis.

### The Frontend (The Dashboard)
* **Framework:** React + Vite + TypeScript
* **Styling:** Custom CSS with a sleek, premium Glassmorphism aesthetic.
* **Functionality:** We built a highly interactive Single Page Application (SPA). The frontend handles the visual representation of the "Nuclear Lockdown", the interactive AI chat interface, and a dynamic "Scavenger Hunt" feature tour that guides new users through the application by physically highlighting UI elements.

### The Chrome Extension (The Muscle)
* **Framework:** Vanilla JavaScript (Manifest V3)
* **Functionality:** A custom Chrome Extension runs quietly in the background, constantly communicating with the FastAPI backend. The moment the backend flags a task as overdue, the extension dynamically extracts the `blocked_sites` array and begins intercepting web traffic, executing the physical lockdown on the user's browser.

---

## 5. Overcoming Challenges
Our biggest technical challenge was seamlessly integrating the AI logic with the real-time browser extension. We needed the system to instantly recognize an overdue task, trigger the Chrome extension to block specific sites, and simultaneously launch a conversational AI interface on the dashboard to negotiate a new deadline. 

We solved this by establishing a robust polling mechanism between the extension and the FastAPI backend, ensuring the AI state (locked down vs. negotiating vs. free) was perfectly synchronized across the user's entire operating system. Furthermore, ensuring that Gemini 1.5 Flash could accurately and strictly judge user-submitted habit photos required extensive prompt engineering to prevent the AI from accepting fake or ambiguous proof.

---

## 6. What's Next?
In the future, we plan to expand Trackly by integrating Gemini's real-time audio capabilities, allowing the AI Coach to literally yell at the user through their computer speakers when a deadline is missed. We also plan to release a mobile companion app that can enforce app-level blocking on iOS and Android during a Nuclear Lockdown.
