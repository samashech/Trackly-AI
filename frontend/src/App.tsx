import { useState, useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';
import type { User } from 'firebase/auth';
import './index.css';

// Types
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Theme = 'dark' | 'light' | 'ocean' | 'cyberpunk' | 'midnight' | 'custom' | 'nuclear';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  estimated_hours: number;
  due_date: string;
  status: 'pending' | 'completed';
  blocked_sites?: string[];
}

interface Habit {
  id: string;
  title: string;
  streak: number;
  completed_today: boolean;
}

interface RiskAnalysis {
  risk_score: number;
  recommendation: string;
  breakdown: string[];
}

interface TaskWithRisk extends Task {
  riskAnalysis?: RiskAnalysis;
  isAnalyzing: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function TaskModal({ task, onClose }: { task: TaskWithRisk; onClose: () => void }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 480);
  };

  return (
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-dialog ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 24px 0 24px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Task Details</h2>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
          </div>
        </div>
        <div style={{ padding: '24px' }}>
          <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--text-primary)', lineHeight: 1.8 }}>
            <li><strong>Name:</strong> {task.title}</li>
            <li><strong>Priority:</strong> <span style={{ color: `var(--priority-${task.priority})`, textTransform: 'capitalize' }}>{task.priority}</span></li>
            <li><strong>Due Date:</strong> {new Date(task.due_date).toLocaleString()}</li>
            <li><strong>Estimated Hours:</strong> {task.estimated_hours}h</li>
            {task.riskAnalysis && task.riskAnalysis.risk_score !== -1 && (
              <li><strong>Risk Score:</strong> {task.riskAnalysis.risk_score}% chance of failure</li>
            )}
            {task.blocked_sites && task.blocked_sites.length > 0 && (
              <li><strong>Blocked Sites:</strong> {task.blocked_sites.join(', ')}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskWithRisk[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showHabitInput, setShowHabitInput] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editingHabitTitle, setEditingHabitTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingInput, setOnboardingInput] = useState('');
  const [isGeneratingOnboarding, setIsGeneratingOnboarding] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });
  const [customColors, setCustomColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('customColors');
    return saved ? JSON.parse(saved) : {
      '--bg-primary': '#1e1e2f',
      '--bg-secondary': '#2a2a40',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#b9b9c9',
      '--accent-primary': '#ff79c6',
      '--accent-secondary': '#bd93f9',
    };
  });
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithRisk | null>(null);
  const [modalTab, setModalTab] = useState<'manual' | 'ai'>('manual');
  
  // Manual Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('1');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskBlockedSites, setNewTaskBlockedSites] = useState('');

  // AI Planner State
  const [plannerMessages, setPlannerMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'What do you need to get done? Brain dump it here, and I will help you turn it into an actionable task.' }
  ]);
  const [plannerInput, setPlannerInput] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const plannerEndRef = useRef<HTMLDivElement>(null);

  // Lockdown State
  const [lockdownChat, setLockdownChat] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'You have failed to meet a deadline. Explain what happened before I unlock the dashboard.' }
  ]);
  const [lockdownInput, setLockdownInput] = useState('');
  const lockdownEndRef = useRef<HTMLDivElement>(null);

  // Listen to Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchTasksAndAnalyze();
        fetchHabits();
      }
    });
    return () => unsubscribe();
  }, []);

  // Calculate overdue tasks to trigger lockdown
  const overdueTasks = tasks.filter(t => t.status !== 'completed' && new Date(t.due_date) < new Date());
  const isLockdown = overdueTasks.length > 0;

  // Apply theme on change (or force nuclear if lockdown)
  useEffect(() => {
    if (isLockdown) {
      document.documentElement.setAttribute('data-theme', 'nuclear');
      document.documentElement.removeAttribute('style');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      if (theme === 'custom') {
        Object.keys(customColors).forEach(key => {
          document.documentElement.style.setProperty(key, customColors[key]);
        });
      } else {
        document.documentElement.removeAttribute('style');
      }
    }
  }, [theme, isLockdown, customColors]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => { plannerEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [plannerMessages]);
  useEffect(() => { lockdownEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lockdownChat]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setTasks([]);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  async function fetchTasksAndAnalyze() {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/tasks');
      const data: Task[] = await response.json();
      
      const initialTasks = data.map(task => ({
        ...task,
        isAnalyzing: true
      }));
      setTasks(initialTasks);
      setLoading(false);

      if (initialTasks.length === 0 && !localStorage.getItem('hasCompletedOnboarding')) {
        setIsOnboarding(true);
      }

      initialTasks.forEach(async (task) => {
        if (task.status === 'completed') {
          setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? { ...t, isAnalyzing: false } : t));
          return;
        }
        try {
          const riskResponse = await fetch('http://localhost:8000/api/analyze_risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
          });
          const analysis: RiskAnalysis = await riskResponse.json();
          setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? { ...t, riskAnalysis: analysis, isAnalyzing: false } : t));
        } catch (error) {
          console.error(`Failed to analyze risk for task ${task.id}:`, error);
          setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? { ...t, isAnalyzing: false, riskAnalysis: { risk_score: -1, recommendation: "Analysis failed", breakdown: [] } } : t));
        }
      });
    } catch (error) {
      console.error("Failed to fetch tasks", error);
      setLoading(false);
    }
  };

  async function fetchHabits() {
    try {
      const response = await fetch('http://localhost:8000/api/habits');
      const data = await response.json();
      setHabits(data);
    } catch (err) {
      console.error("Failed to fetch habits", err);
    }
  };

  async function createHabitAPI(title: string) {
    try {
      await fetch('http://localhost:8000/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          title: title,
          streak: 0,
          completed_today: false
        })
      });
      setShowHabitInput(false);
      setNewHabitTitle('');
      fetchHabits();
    } catch (err) {
      console.error("Failed to create habit", err);
    }
  };

  const toggleHabitAPI = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/habits/${id}/toggle`, {
        method: 'PUT'
      });
      fetchHabits();
    } catch (err) {
      console.error("Failed to toggle habit", err);
    }
  };

  const deleteHabitAPI = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/habits/${id}`, { method: 'DELETE' });
      fetchHabits();
    } catch (err) {
      console.error("Failed to delete habit", err);
    }
  };

  const updateHabitAPI = async (id: string, title: string) => {
    try {
      await fetch(`http://localhost:8000/api/habits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      setEditingHabitId(null);
      fetchHabits();
    } catch (err) {
      console.error("Failed to update habit", err);
    }
  };

  const createNewTaskAPI = async (taskPayload: Task) => {
    try {
      await fetch('http://localhost:8000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload)
      });
      setShowModal(false);
      setPlannerMessages([{ role: 'assistant', content: 'What do you need to get done? Brain dump it here, and I will help you turn it into an actionable task.' }]);
      setNewTaskTitle('');
      setNewTaskHours('1');
      setNewTaskDate('');
      setNewTaskPriority('medium');
      setNewTaskBlockedSites('');
      fetchTasksAndAnalyze();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  const updateTaskAPI = async (taskId: string, payload: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...payload } : t));
    try {
      await fetch(`http://localhost:8000/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (payload.status !== 'completed') {
        fetchTasksAndAnalyze();
      }
    } catch (err) {
      console.error("Failed to update task", err);
    }
  };

  const handleManualCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    const dueDate = newTaskDate ? new Date(newTaskDate).toISOString() : new Date().toISOString();
    
    // Clean up blocked sites input (append .com if no dot is present)
    const blockedSitesArray = newTaskBlockedSites
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.includes('.') ? s : `${s}.com`);

    const taskData: Task = {
      id: Math.random().toString(36).substring(7),
      title: newTaskTitle,
      estimated_hours: parseFloat(newTaskHours),
      due_date: dueDate,
      priority: newTaskPriority,
      status: 'pending',
      blocked_sites: blockedSitesArray
    };
    await createNewTaskAPI(taskData);
  };

  const handlePlannerSubmit = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && plannerInput.trim()) {
      const userMessage = plannerInput.trim();
      setPlannerInput('');
      const newMessages: ChatMessage[] = [...plannerMessages, { role: 'user', content: userMessage }];
      setPlannerMessages(newMessages);
      setIsPlanning(true);

      try {
        const response = await fetch('http://localhost:8000/api/planner_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages })
        });
        
        const data = await response.json();
        const replyText = data.reply as string;

        if (replyText.includes('"CREATE_TASK"')) {
          const jsonMatch = replyText.match(/\{[\s\S]*"CREATE_TASK"[\s\S]*\}/);
          if (jsonMatch && jsonMatch[0]) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.action === 'CREATE_TASK' && parsed.task) {
                setPlannerMessages(prev => [...prev, { role: 'assistant', content: "Got it! Adding this to your dashboard now..." }]);
                const aiTask: Task = {
                  id: Math.random().toString(36).substring(7),
                  title: parsed.task.title,
                  estimated_hours: parseFloat(parsed.task.estimated_hours),
                  due_date: parsed.task.due_date,
                  priority: parsed.task.priority,
                  status: 'pending',
                  blocked_sites: parsed.task.blocked_sites || []
                };
                setTimeout(() => { createNewTaskAPI(aiTask); }, 1500);
                return;
              }
            } catch (e) {
              console.error("Failed to parse AI JSON output", e);
            }
          }
        } 
        setPlannerMessages(prev => [...prev, { role: 'assistant', content: replyText }]);
      } catch {
        setPlannerMessages(prev => [...prev, { role: 'assistant', content: "Network error communicating with local AI." }]);
      } finally {
        setIsPlanning(false);
      }
    }
  };

  const handleLockdownSubmit = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && lockdownInput.trim()) {
      const userMessage = lockdownInput.trim();
      setLockdownInput('');
      const newMessages: ChatMessage[] = [...lockdownChat, { role: 'user', content: userMessage }];
      setLockdownChat(newMessages);
      
      try {
        const response = await fetch('http://localhost:8000/api/interrogation_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages })
        });
        const data = await response.json();
        const replyText = data.reply as string;

        if (replyText.includes('"RESCHEDULE_TASK"')) {
          const jsonMatch = replyText.match(/\{[\s\S]*"RESCHEDULE_TASK"[\s\S]*\}/);
          if (jsonMatch && jsonMatch[0]) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.action === 'RESCHEDULE_TASK' && parsed.task) {
                setLockdownChat(prev => [...prev, { role: 'assistant', content: "Extension granted. Rebuilding dashboard schedule..." }]);
                setTimeout(() => { 
                  updateTaskAPI(overdueTasks[0].id, {
                    due_date: parsed.task.due_date,
                    estimated_hours: parseFloat(parsed.task.estimated_hours)
                  });
                  // Reset lockdown chat for next time
                  setLockdownChat([{ role: 'assistant', content: 'You have failed to meet a deadline. Explain what happened before I unlock the dashboard.' }]);
                }, 1500);
                return;
              }
            } catch (e) {
              console.error("Failed to parse AI JSON output", e);
            }
          }
        }
        setLockdownChat(prev => [...prev, { role: 'assistant', content: replyText }]);
      } catch {
        setLockdownChat(prev => [...prev, { role: 'assistant', content: "System error communicating with AI Coach." }]);
      }
    }
  };

  const handleChatSubmit = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && chatInput.trim()) {
      const userMessage = chatInput.trim();
      setChatInput('');
      setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      setIsChatting(true);

      const tasksContext = tasks.filter(t => t.status !== 'completed').map(t => `[${t.priority.toUpperCase()}] ${t.title} (Risk: ${t.riskAnalysis?.risk_score}%, Due: ${t.due_date})`).join(' | ');

      try {
        const response = await fetch('http://localhost:8000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...chatMessages, { role: 'user', content: userMessage }],
            tasks_context: tasksContext || "User has no tasks currently."
          })
        });
        
        const data = await response.json();
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } catch {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "Network error. Make sure the FastAPI server is running." }]);
      } finally {
        setIsChatting(false);
      }
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (authLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Loading ActionMate AI...</div>;
  }

  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="glass-panel" style={{ padding: '40px', width: '400px', textAlign: 'center', background: 'var(--bg-secondary)' }}>
          <div style={{ margin: '0 auto 24px', width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}></div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>ActionMate AI</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Your AI Execution Operating System</p>
          <button onClick={handleLogin} className="btn-primary hover-lift" style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  if (isOnboarding) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column' }}>
        <div className="glass-panel animate-fade-in" style={{ width: '600px', padding: '48px', textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)' }}>
          <div style={{ margin: '0 auto 24px', width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🎯</div>
          <h1 style={{ fontSize: '2rem', marginBottom: '16px' }}>Welcome to ActionMate AI.</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '32px', lineHeight: 1.6 }}>
            I am your personal AI execution coach. Before we begin, what is your primary mission right now? <br/><br/>
            <em>(e.g., "I am a student studying for finals", or "I am building a tech startup")</em>
          </p>
          
          <input 
            type="text" 
            value={onboardingInput} 
            onChange={e => setOnboardingInput(e.target.value)} 
            onKeyDown={async e => {
              if (e.key === 'Enter' && onboardingInput.trim() && !isGeneratingOnboarding) {
                setIsGeneratingOnboarding(true);
                try {
                  const res = await fetch('http://localhost:8000/api/onboarding_generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_mission: onboardingInput.trim() })
                  });
                  const data = await res.json();
                  const rawJson = data.tasks_json.replace(/```json/g, '').replace(/```/g, '').trim();
                  const generatedTasks = JSON.parse(rawJson);
                  
                  for (const t of generatedTasks) {
                    await fetch('http://localhost:8000/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        id: Math.random().toString(36).substring(7),
                        title: t.title,
                        estimated_hours: parseFloat(t.estimated_hours) || 1,
                        due_date: t.due_date,
                        priority: t.priority || 'medium',
                        status: 'pending',
                        blocked_sites: t.blocked_sites || []
                      })
                    });
                  }
                  
                  localStorage.setItem('hasCompletedOnboarding', 'true');
                  setIsOnboarding(false);
                  fetchTasksAndAnalyze();
                } catch (err) {
                  console.error(err);
                  setIsGeneratingOnboarding(false);
                }
              }
            }}
            disabled={isGeneratingOnboarding}
            placeholder="Type your mission and press Enter..." 
            style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid var(--accent-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1.1rem', outline: 'none', textAlign: 'center' }} 
            autoFocus
          />
          
          {isGeneratingOnboarding && (
            <div style={{ marginTop: '24px', color: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }}>
              Analyzing your mission and generating your Starter Pack...
            </div>
          )}
          
          <div style={{ marginTop: '24px' }}>
            <button onClick={() => {
              localStorage.setItem('hasCompletedOnboarding', 'true');
              setIsOnboarding(false);
            }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer' }}>
              Skip Tour
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // NUCLEAR LOCKDOWN SCREEN
  // ----------------------------------------------------
  if (isLockdown) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column' }}>
        <h1 style={{ color: 'var(--priority-critical)', fontSize: '3rem', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '4px', animation: 'pulse 2s infinite' }}>System Lockdown</h1>
        <p style={{ fontSize: '1.2rem', marginBottom: '32px' }}>You failed to meet your deadline for: <strong>{overdueTasks[0].title}</strong></p>
        
        <div className="glass-panel" style={{ width: '600px', height: '400px', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '2px solid var(--border-color)', boxShadow: '0 0 50px rgba(239, 68, 68, 0.4)' }}>
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {lockdownChat.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-primary)', border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none', padding: '16px', borderRadius: '16px', maxWidth: '80%', borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px', borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px', lineHeight: 1.5 }}>
                {msg.content}
              </div>
            ))}
            <div ref={lockdownEndRef} />
          </div>
          <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" value={lockdownInput} onChange={e => setLockdownInput(e.target.value)} onKeyDown={handleLockdownSubmit} placeholder="Explain yourself and negotiate an extension..." style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid var(--accent-primary)', background: 'var(--bg-primary)', color: 'white', fontSize: '1rem', outline: 'none' }} />
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Or did you actually finish it and forget to check it off? <button onClick={() => updateTaskAPI(overdueTasks[0].id, { status: 'completed' })} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textDecoration: 'underline', cursor: 'pointer' }}>Force Complete</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN APP
  // ----------------------------------------------------
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const criticalTask = pendingTasks.find(t => !t.isAnalyzing && t.riskAnalysis && t.riskAnalysis.risk_score > 70);

  const getDynamicGreeting = () => {
    if (pendingTasks.length === 0) return `Good evening, ${user?.displayName ? user.displayName.split(' ')[0] : 'there'}.`;
    const sorted = [...pendingTasks].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const closest = sorted[0];
    const minsLeft = (new Date(closest.due_date).getTime() - new Date().getTime()) / (1000 * 60);

    if (minsLeft <= 0) return "Lockdown initiated.";
    if (minsLeft <= 15) return `Tick tock. You have ${Math.ceil(minsLeft)} mins left to finish "${closest.title}".`;
    if (minsLeft <= 60) return `You are running out of time for "${closest.title}". Focus.`;
    if (closest.riskAnalysis && closest.riskAnalysis.risk_score > 70) return `My analysis shows a ${closest.riskAnalysis.risk_score}% chance you fail "${closest.title}". Prove me wrong.`;
    return `Good evening, ${user?.displayName ? user.displayName.split(' ')[0] : 'there'}.`;
  };

  const getSuggestedRecurringTasks = () => {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const titleCounts: Record<string, number> = {};
    completedTasks.forEach(t => {
      titleCounts[t.title] = (titleCounts[t.title] || 0) + 1;
    });
    
    // Find titles done at least twice
    const recurringTitles = Object.keys(titleCounts).filter(title => titleCounts[title] >= 2);
    
    // Filter out if currently pending or manually ignored
    const pendingTitles = new Set(pendingTasks.map(t => t.title));
    return recurringTitles.filter(title => !pendingTitles.has(title) && !ignoredSuggestions.includes(title));
  };
  const suggestedTasks = getSuggestedRecurringTasks();

  const renderContent = () => {
    if (loading && tasks.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>Loading tasks from backend...</p>;

    if (activeTab === 'dashboard') {
      return (
        <>
          {suggestedTasks.length > 0 && activeTab === 'dashboard' && (
            <div className="glass-panel animate-fade-in" style={{ padding: '20px', marginBottom: '32px', borderLeft: '4px solid var(--accent-primary)', background: 'var(--bg-secondary)' }}>
              <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔁</span> Daily Routine Detected
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.95rem' }}>
                You frequently complete these tasks. Want to add them for today?
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {suggestedTasks.map(title => (
                  <div key={title} style={{ display: 'flex', background: 'var(--bg-primary)', border: '1px solid var(--accent-primary)', borderRadius: '8px', overflow: 'hidden' }} className="hover-lift">
                    <button onClick={() => {
                      setNewTaskTitle(title);
                      setShowModal(true);
                    }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>+</span> {title}
                    </button>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setIgnoredSuggestions(prev => [...prev, title]);
                    }} style={{ background: 'rgba(255,0,0,0.1)', border: 'none', borderLeft: '1px solid var(--accent-primary)', color: 'var(--priority-critical)', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Dismiss suggestion">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}



          <h3 style={{ marginBottom: '16px' }}>Dynamic Priority List</h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            {pendingTasks.length > 0 ? pendingTasks.map(task => {
              const diffMins = (new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60);
              let heartbeatClass = "";
              if (diffMins > 0 && diffMins <= 30) heartbeatClass = "heartbeat-red";
              else if (diffMins > 30 && diffMins <= 120) heartbeatClass = "heartbeat-orange";
              
              return (
              <div key={task.id} onClick={() => setSelectedTask(task)} className={`glass-panel hover-lift animate-fade-in ${heartbeatClass}`} style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                {completingTaskId === task.id && (
                  <>
                    <div className="task-completion-slider"></div>
                    <div className="task-completion-text">Done ✅</div>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setCompletingTaskId(task.id);
                      setTimeout(() => {
                        updateTaskAPI(task.id, { status: 'completed' });
                        setCompletingTaskId(null);
                      }, 1000);
                    }}
                    style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid var(--priority-${task.priority})`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12 }}
                    className="hover-lift"
                    title="Mark as complete"
                  ></button>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{task.title}</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span>Due: {formatDate(task.due_date)}</span>
                      <span>• Est: {task.estimated_hours}h</span>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab('ai tutor');
                        setChatInput(`I need guidance on my task: "${task.title}". Can you break it down or help me start?`);
                      }} className="hover-lift" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🤖 Ask AI Tutor
                      </button>
                    </p>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right', minWidth: '100px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Miss Risk</div>
                  {task.isAnalyzing ? (
                    <div style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <span style={{ animation: 'pulse 1.5s infinite' }}>●</span> Analyzing...
                    </div>
                  ) : (
                    <div style={{ 
                      fontWeight: 600, 
                      color: task.riskAnalysis && task.riskAnalysis.risk_score > 75 ? 'var(--priority-critical)' : 
                             task.riskAnalysis && task.riskAnalysis.risk_score > 40 ? 'var(--priority-high)' : 'var(--priority-low)' 
                    }}>
                      {task.riskAnalysis && task.riskAnalysis.risk_score !== -1 ? `${task.riskAnalysis.risk_score}%` : 'Error'}
                    </div>
                  )}
                </div>
              </div>
            )}) : (
              <div style={{ textAlign: 'center', padding: '64px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px dashed var(--border-color)', animation: 'fadeIn 0.5s' }}>
                <div style={{ width: '64px', height: '64px', background: 'var(--bg-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>🎯</div>
                <h3 style={{ marginBottom: '8px' }}>Your dashboard is completely clear</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Add a new task to let your local Ollama AI coach analyze your schedule and predict failure risks.</p>
                <button className="btn-primary hover-lift" onClick={() => setShowModal(true)}>+ Create First Task</button>
              </div>
            )}
          </div>
        </>
      );
    }
    
    if (activeTab === 'calendar') {
      return (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <h2 style={{ marginBottom: '24px' }}>Timeline & Schedule</h2>
          {pendingTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p>No upcoming deadlines. Your schedule is wide open!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--border-color)', paddingLeft: '24px', marginLeft: '12px' }}>
              {pendingTasks.sort((a,b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map(task => (
                <div key={task.id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-33px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', background: `var(--priority-${task.priority})`, border: '3px solid var(--bg-primary)' }}></div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{task.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '4px 0 0' }}>Due {formatDate(task.due_date)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'habits') {
      return (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <h2 style={{ marginBottom: '24px' }}>Habit Tracker</h2>
          
          <div style={{ display: 'grid', gap: '16px', marginBottom: '32px' }}>
            {habits.map(habit => (
              <div key={habit.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                {editingHabitId === habit.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                    <input type="text" value={editingHabitTitle} onChange={e => setEditingHabitTitle(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }} autoFocus />
                    <button onClick={() => updateHabitAPI(habit.id, editingHabitTitle)} className="btn-primary hover-lift">Save</button>
                    <button onClick={() => setEditingHabitId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: '0 0 8px 0' }}>{habit.title}</h3>
                      <button onClick={() => { setEditingHabitId(habit.id); setEditingHabitTitle(habit.title); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }} title="Edit Habit">✏️</button>
                      <button onClick={() => deleteHabitAPI(habit.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }} title="Delete Habit">❌</button>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔥 {habit.streak} day streak</div>
                  </div>
                )}
                <button 
                  onClick={() => toggleHabitAPI(habit.id)}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: habit.completed_today ? 'var(--accent-primary)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.2rem', transition: 'all 0.2s', flexShrink: 0 }}
                  className="hover-lift"
                >
                  {habit.completed_today ? '✓' : ''}
                </button>
              </div>
            ))}
          </div>

          {!showHabitInput ? (
            <div style={{ textAlign: 'center' }}>
              {habits.length === 0 && <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>You aren't tracking any habits yet.</p>}
              <button className="btn-primary hover-lift" onClick={() => setShowHabitInput(true)}>+ Track New Habit</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px' }}>
              <input 
                type="text" 
                value={newHabitTitle} 
                onChange={e => setNewHabitTitle(e.target.value)} 
                placeholder="e.g. Stop scrolling on Tiktok" 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && newHabitTitle.trim()) createHabitAPI(newHabitTitle); }}
              />
              <button className="btn-primary hover-lift" onClick={() => { if(newHabitTitle.trim()) createHabitAPI(newHabitTitle); }}>Save</button>
              <button onClick={() => setShowHabitInput(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0 16px', borderRadius: '8px', cursor: 'pointer' }} className="hover-lift">Cancel</button>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'history') {
      const completedTasks = tasks.filter(t => t.status === 'completed');
      return (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ margin: 0 }}>Completed Tasks</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Auto-cleans every 7 days</div>
          </div>
          {completedTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p>No completed tasks in the last 7 days. Time to get to work!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {completedTasks.sort((a,b) => b.id.localeCompare(a.id)).map(task => (
                <div key={task.id} className="glass-panel hover-lift animate-fade-in" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>✓</div>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', marginBottom: '4px', textDecoration: 'line-through', color: 'var(--text-secondary)' }}>{task.title}</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Completed</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'ai tutor') {
      return (
        <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--priority-low)', boxShadow: '0 0 8px var(--priority-low)' }}></div>
            <h2 style={{ margin: 0 }}>Execution Tutor</h2>
          </div>
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {criticalTask && criticalTask.riskAnalysis && (
              <div style={{ padding: '16px', marginBottom: '16px', borderLeft: '4px solid var(--priority-critical)', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ color: 'var(--priority-critical)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                  <span className="priority-dot critical"></span> High Risk Intervention Needed
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  You have an <strong style={{color: 'var(--text-primary)'}}>{criticalTask.riskAnalysis.risk_score}% chance</strong> of missing your <strong>{criticalTask.title}</strong> deadline. 
                </p>
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--priority-high)' }}>
                  <strong>Coach Recommendation:</strong> {criticalTask.riskAnalysis.recommendation}
                </p>
              </div>
            )}
            <div style={{ alignSelf: 'flex-start', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', borderBottomLeftRadius: '4px', maxWidth: '80%', border: '1px solid var(--border-color)' }}>
              {pendingTasks.length > 0 
                ? "Welcome to your dedicated tutoring session. I have full context of your tasks. Which task do you need guidance on?"
                : "Welcome! Your schedule is completely clear right now. Add some tasks, and I will help you formulate an execution strategy."}
            </div>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                padding: '16px', borderRadius: '16px', maxWidth: '80%',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                lineHeight: 1.5
              }}>
                {msg.content}
              </div>
            ))}
            {isChatting && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', borderBottomLeftRadius: '4px' }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>Thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)' }}>
            <input 
              type="text" 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleChatSubmit}
              placeholder="Ask for help planning your day (Press Enter to send)..." 
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white', fontSize: '1rem', outline: 'none' }} 
            />
          </div>
        </div>
      );
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}></div>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>ActionMate AI</h2>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {['Dashboard', 'Calendar', 'Habits', 'History', 'AI Tutor'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              className={`sidebar-tab ${activeTab === tab.toLowerCase() ? 'active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
             {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
             ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {user?.displayName ? user.displayName.charAt(0) : 'U'}
                </div>
             )}
             <div style={{ flex: 1, overflow: 'hidden' }}>
               <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.displayName || 'User'}</p>
               <button onClick={handleLogout} style={{ background: 'none', border: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>Log out</button>
             </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Theme Options</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['dark', 'light', 'ocean', 'cyberpunk', 'midnight', 'custom'].map(t => (
              <button key={t} onClick={() => setTheme(t as Theme)} style={{ flex: '1 1 calc(33.333% - 8px)', padding: '8px 0', borderRadius: '6px', border: theme === t ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          {theme === 'custom' && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Custom Colors</p>
              {Object.keys(customColors).map(key => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{key.replace('--', '')}</label>
                  <input type="color" value={customColors[key]} onChange={e => {
                    const newColors = { ...customColors, [key]: e.target.value };
                    setCustomColors(newColors);
                    localStorage.setItem('customColors', JSON.stringify(newColors));
                  }} style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--border-color)', width: '28px', height: '28px', padding: 0, borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', marginBottom: '8px' }}>{getDynamicGreeting()}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>You have {pendingTasks.length} active tasks.</p>
          </div>
          <button className="btn-primary hover-lift" onClick={() => setShowModal(true)}>+ New Task</button>
        </header>
        {renderContent()}
      </main>


      {/* New Task Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '450px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '24px 24px 0 24px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Create New Task</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setModalTab('manual')} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: modalTab === 'manual' ? '2px solid var(--accent-primary)' : '2px solid transparent', color: modalTab === 'manual' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Manual Entry</button>
                <button onClick={() => setModalTab('ai')} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: modalTab === 'ai' ? '2px solid var(--accent-primary)' : '2px solid transparent', color: modalTab === 'ai' ? 'var(--text-primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>✨ AI Task Planner</button>
              </div>
            </div>

            {modalTab === 'manual' && (
              <form onSubmit={handleManualCreateTask} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Task Title</label><input required type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} placeholder="e.g. Build an OS in 1 hour" /></div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Est. Hours</label><input required type="number" step="0.5" min="0" value={newTaskHours} onChange={e => setNewTaskHours(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} /></div>
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Priority</label><select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as Priority)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                </div>
                <div><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Due Date & Time</label><input required type="datetime-local" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} /></div>
                <div><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Blocked Sites (comma separated)</label><input type="text" value={newTaskBlockedSites} onChange={e => setNewTaskBlockedSites(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} placeholder="e.g. youtube, netflix.com" /></div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}><button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' }} className="hover-lift">Cancel</button><button type="submit" className="btn-primary hover-lift">Create Task</button></div>
              </form>
            )}

            {modalTab === 'ai' && (
              <div style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '400px' }}>
                <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {plannerMessages.map((msg, i) => (
                    <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-primary)', padding: '10px 14px', borderRadius: '12px', borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px', borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '12px', fontSize: '0.95rem', border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none' }}>
                      {msg.content}
                    </div>
                  ))}
                  {isPlanning && (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '12px', borderBottomLeftRadius: '4px', fontSize: '0.95rem' }}><span style={{ animation: 'pulse 1.5s infinite' }}>Thinking...</span></div>
                  )}
                  <div ref={plannerEndRef} />
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
                  <input type="text" value={plannerInput} onChange={e => setPlannerInput(e.target.value)} onKeyDown={handlePlannerSubmit} placeholder="Describe your task..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} disabled={isPlanning} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />}
      <style>{`@keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }`}</style>
    </div>
  );
}

export default App;
