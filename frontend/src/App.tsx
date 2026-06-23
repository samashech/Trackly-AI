import { useState, useEffect, FormEvent } from 'react';
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

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tasks, setTasks] = useState<TaskWithRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('1');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');

  // Apply theme on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchTasksAndAnalyze = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/tasks');
      const data: Task[] = await response.json();
      
      // Initialize tasks as analyzing
      const initialTasks = data.map(task => ({
        ...task,
        isAnalyzing: true
      }));
      setTasks(initialTasks);
      setLoading(false);

      // Kick off asynchronous risk analysis for each task
      initialTasks.forEach(async (task) => {
        try {
          const riskResponse = await fetch('http://localhost:8000/api/analyze_risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: task.id,
              title: task.title,
              description: task.description,
              estimated_hours: task.estimated_hours,
              due_date: task.due_date,
              priority: task.priority
            })
          });
          
          const analysis: RiskAnalysis = await riskResponse.json();
          
          setTasks(prevTasks => 
            prevTasks.map(t => 
              t.id === task.id ? { ...t, riskAnalysis: analysis, isAnalyzing: false } : t
            )
          );
        } catch (error) {
          console.error(`Failed to analyze risk for task ${task.id}:`, error);
          setTasks(prevTasks => 
            prevTasks.map(t => 
              t.id === task.id ? { ...t, isAnalyzing: false, riskAnalysis: { risk_score: -1, recommendation: "Analysis failed", breakdown: [] } } : t
            )
          );
        }
      });

    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndAnalyze();
  }, []);

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    
    // Fallback date if none provided
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
      
      // Reset form and close modal
      setNewTaskTitle('');
      setNewTaskHours('1');
      setNewTaskDate('');
      setNewTaskPriority('medium');
      setShowModal(false);
      
      // Refresh tasks
      fetchTasksAndAnalyze();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const criticalTask = tasks.find(t => !t.isAnalyzing && t.riskAnalysis && t.riskAnalysis.risk_score > 70);

  const renderContent = () => {
    if (loading) {
      return <p style={{ color: 'var(--text-secondary)' }}>Loading tasks from backend...</p>;
    }

    if (activeTab === 'dashboard' || activeTab === 'tasks') {
      return (
        <>
          {/* AI Intervention Banner */}
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
                <button className="btn-primary" style={{ background: 'var(--priority-critical)', boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.39)' }}>
                  Generate Recovery Plan
                </button>
              </div>
            </div>
          )}

          {/* Task Priority Matrix */}
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
                
                {/* AI Risk Score Analysis Result */}
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
    
    // Placeholder for other tabs
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '16px', textTransform: 'capitalize' }}>{activeTab} View</h2>
        <p>This module is under construction. Check back soon!</p>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
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
                border: 'none',
                padding: '12px 16px',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s',
                borderLeft: activeTab === tab.toLowerCase() ? '3px solid var(--accent-primary)' : '3px solid transparent'
              }}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Theme Selector */}
        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Theme Options</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['dark', 'light', 'ocean'].map(t => (
              <button
                key={t}
                onClick={() => setTheme(t as Theme)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: '6px',
                  border: theme === t ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textTransform: 'capitalize'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Good evening, Sameer.</h1>
            <p style={{ color: 'var(--text-secondary)' }}>You have {tasks.length} active tasks.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Task</button>
        </header>

        {renderContent()}

      </main>

      {/* AI Assistant Chat Widget Overlay */}
      {activeTab !== 'ai coach' && (
        <div className="glass-panel" style={{ 
          position: 'fixed', 
          bottom: '32px', 
          right: '32px', 
          width: '350px', 
          height: '450px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          zIndex: 100
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-glass)' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }}></span>
              AI Accountability Coach
            </h4>
          </div>
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', borderBottomLeftRadius: '2px', fontSize: '0.9rem' }}>
              Hey Sameer. I'm monitoring your tasks using the local AI model. Let me know if you need help planning.
            </div>
            
            {/* Dynamically show breakdown if a critical task is found */}
            {criticalTask && criticalTask.riskAnalysis && criticalTask.riskAnalysis.breakdown && (
               <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--accent-primary)', padding: '12px', borderRadius: '12px', borderBottomLeftRadius: '2px', fontSize: '0.9rem', animation: 'fadeIn 0.5s ease-in-out' }}>
                 <p style={{ marginBottom: '8px', fontWeight: 600 }}>Action Plan for {criticalTask.title}:</p>
                 <ul style={{ paddingLeft: '16px', margin: 0, color: 'var(--text-secondary)' }}>
                   {criticalTask.riskAnalysis.breakdown.map((step, idx) => (
                     <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
                   ))}
                 </ul>
               </div>
            )}
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-glass)' }}>
            <input 
              type="text" 
              placeholder="Ask your coach..." 
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                background: 'var(--bg-primary)', 
                color: 'var(--text-primary)',
                outline: 'none'
              }} 
            />
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '400px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Create New Task</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateTask} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Task Title</label>
                <input 
                  required
                  type="text" 
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                  placeholder="e.g. Finish Data Structures project"
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Est. Hours</label>
                  <input 
                    required
                    type="number" 
                    step="0.5"
                    min="0"
                    value={newTaskHours}
                    onChange={e => setNewTaskHours(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Priority</label>
                  <select 
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as Priority)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Due Date & Time</label>
                <input 
                  required
                  type="datetime-local" 
                  value={newTaskDate}
                  onChange={e => setNewTaskDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                />
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline styles */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default App;
