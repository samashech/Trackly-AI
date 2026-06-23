import { useState, useEffect, FormEvent, KeyboardEvent, useRef } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';
import type { User } from 'firebase/auth';
import './index.css';

// Types
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Theme = 'dark' | 'light' | 'ocean';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  estimated_hours: number;
  due_date: string;
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

function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tasks, setTasks] = useState<TaskWithRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('1');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');

  // Listen to Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchTasksAndAnalyze();
      }
    });
    return () => unsubscribe();
  }, []);

  // Apply theme on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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

  const fetchTasksAndAnalyze = async () => {
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

      initialTasks.forEach(async (task) => {
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
      console.error("Failed to fetch tasks:", error);
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    const dueDate = newTaskDate ? new Date(newTaskDate).toISOString() : new Date().toISOString();
    
    const taskData: Task = {
      id: Math.random().toString(36).substring(7),
      title: newTaskTitle,
      estimated_hours: parseFloat(newTaskHours),
      due_date: dueDate,
      priority: newTaskPriority,
    };

    try {
      await fetch('http://localhost:8000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      
      setNewTaskTitle('');
      setNewTaskHours('1');
      setNewTaskDate('');
      setNewTaskPriority('medium');
      setShowModal(false);
      fetchTasksAndAnalyze();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  const handleChatSubmit = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && chatInput.trim()) {
      const userMessage = chatInput.trim();
      setChatInput('');
      setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      setIsChatting(true);

      const tasksContext = tasks.map(t => `[${t.priority.toUpperCase()}] ${t.title} (Risk: ${t.riskAnalysis?.risk_score}%, Due: ${t.due_date})`).join(' | ');

      try {
        const response = await fetch('http://localhost:8000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...chatMessages, { role: 'user', content: userMessage }],
            tasks_context: tasksContext
          })
        });
        
        const data = await response.json();
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } catch (err) {
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

  const criticalTask = tasks.find(t => !t.isAnalyzing && t.riskAnalysis && t.riskAnalysis.risk_score > 70);

  const renderContent = () => {
    if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading tasks from backend...</p>;

    if (activeTab === 'dashboard' || activeTab === 'tasks') {
      return (
        <>
          {criticalTask && criticalTask.riskAnalysis && (
            <div className="glass-panel animate-fade-in" style={{ padding: '24px', marginBottom: '32px', borderLeft: '4px solid var(--priority-critical)', background: 'rgba(239, 68, 68, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: 'var(--priority-critical)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="priority-dot critical"></span> Intervention Needed
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    You have an <strong style={{color: 'var(--text-primary)'}}>{criticalTask.riskAnalysis.risk_score}% chance</strong> of missing your <strong>{criticalTask.title}</strong> deadline. 
                  </p>
                  <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--priority-high)' }}>
                    <strong>AI Recommendation:</strong> {criticalTask.riskAnalysis.recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          <h3 style={{ marginBottom: '16px' }}>Dynamic Priority List</h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            {tasks.length > 0 ? tasks.map(task => (
              <div key={task.id} className="glass-panel hover-lift animate-fade-in" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  <span className={`priority-dot ${task.priority}`}></span>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{task.title}</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Due: {formatDate(task.due_date)} • Est. Effort: {task.estimated_hours}h
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
            )) : (
              <p style={{ color: 'var(--text-secondary)' }}>No tasks found. Add one to get started!</p>
            )}
          </div>
        </>
      );
    }
    
    if (activeTab === 'calendar') {
      return (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <h2 style={{ marginBottom: '24px' }}>Timeline & Schedule</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--border-color)', paddingLeft: '24px', marginLeft: '12px' }}>
            {tasks.sort((a,b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map(task => (
              <div key={task.id} style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-33px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', background: `var(--priority-${task.priority})`, border: '3px solid var(--bg-primary)' }}></div>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{task.title}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '4px 0 0' }}>Due {formatDate(task.due_date)}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'habits') {
      const mockHabits = [
        { name: "LeetCode Daily", streaks: [true, true, false, true, true, false, false] },
        { name: "Read 10 Pages", streaks: [true, true, true, true, true, true, true] },
        { name: "Workout", streaks: [false, true, false, true, false, true, false] }
      ];
      return (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <h2 style={{ marginBottom: '24px' }}>Habit Tracker (Last 7 Days)</h2>
          <div style={{ display: 'grid', gap: '20px' }}>
            {mockHabits.map(habit => (
              <div key={habit.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: 0, width: '150px' }}>{habit.name}</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {habit.streaks.map((done, i) => (
                    <div key={i} style={{ width: '20px', height: '20px', borderRadius: '50%', background: done ? 'var(--accent-primary)' : 'var(--bg-secondary)', boxShadow: done ? '0 0 8px var(--accent-primary)' : 'none' }}></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'ai coach') {
      return (
        <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--priority-low)', boxShadow: '0 0 8px var(--priority-low)' }}></div>
            <h2 style={{ margin: 0 }}>Execution Coach</h2>
          </div>
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ alignSelf: 'flex-start', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', borderBottomLeftRadius: '4px', maxWidth: '80%' }}>
              Welcome to your dedicated coaching session. I have full context of your calendar and tasks. What's blocking you today?
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
          {['Dashboard', 'Tasks', 'Calendar', 'Habits', 'AI Coach'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              style={{
                background: activeTab === tab.toLowerCase() ? 'var(--bg-glass)' : 'transparent',
                color: activeTab === tab.toLowerCase() ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', padding: '12px 16px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s',
                borderLeft: activeTab === tab.toLowerCase() ? '3px solid var(--accent-primary)' : '3px solid transparent'
              }}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            {['dark', 'light', 'ocean'].map(t => (
              <button key={t} onClick={() => setTheme(t as Theme)} style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: theme === t ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Good evening, {user?.displayName ? user.displayName.split(' ')[0] : 'there'}.</h1>
            <p style={{ color: 'var(--text-secondary)' }}>You have {tasks.length} active tasks.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Task</button>
        </header>
        {renderContent()}
      </main>

      {/* Floating Chat Widget - Hidden on AI Coach tab */}
      {activeTab !== 'ai coach' && (
        <div className="glass-panel" style={{ position: 'fixed', bottom: '32px', right: '32px', width: '350px', height: '450px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 100 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-glass)' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }}></span>
              AI Accountability Coach
            </h4>
          </div>
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', borderBottomLeftRadius: '2px', fontSize: '0.9rem' }}>
              Hey {user?.displayName ? user.displayName.split(' ')[0] : 'there'}. Need an emergency action plan? Just ask!
            </div>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '12px', borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px', borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '12px', fontSize: '0.9rem' }}>
                {msg.content}
              </div>
            ))}
            {isChatting && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '12px', borderBottomLeftRadius: '4px', fontSize: '0.9rem' }}><span style={{ animation: 'pulse 1.5s infinite' }}>Thinking...</span></div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-glass)' }}>
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleChatSubmit} placeholder="Press Enter to send..." style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '400px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Create New Task</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            <form onSubmit={handleCreateTask} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Task Title</label><input required type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} /></div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Est. Hours</label><input required type="number" step="0.5" min="0" value={newTaskHours} onChange={e => setNewTaskHours(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} /></div>
                <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Priority</label><select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as Priority)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
              </div>
              <div><label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Due Date & Time</label><input required type="datetime-local" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} /></div>
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}><button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button type="submit" className="btn-primary">Create Task</button></div>
            </form>
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }`}</style>
    </div>
  );
}

export default App;
