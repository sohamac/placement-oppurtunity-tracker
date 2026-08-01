"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import styles from "./page.module.css";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Shortlisted' | 'Interviewing'>('all');
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [aiProvider, setAiProvider] = useState('auto');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [aiHealth, setAiHealth] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails");
      if (res.status === 401) {
        window.location.href = '/api/auth/signin?callbackUrl=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        if (data.hasGeminiKey !== undefined) {
          setHasGeminiKey(data.hasGeminiKey);
        }
        if (data.aiProvider) {
          setAiProvider(data.aiProvider);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchEmails();
      fetch('/api/ai-health').then(r => r.json()).then(setAiHealth);
    }
  }, [status]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncCount(0);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || "Failed to sync emails.");
      } else {
        setSyncCount(data.processedCount || 0);
        await fetchEmails(); // refresh list
      }
    } catch (err) {
      console.error(err);
      alert("Failed to sync emails.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveApiKey = async () => {
    setSavingKey(true);
    try {
      const res = await fetch("/api/user/ai-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiProvider, apiKey: geminiKeyInput }),
      });
      if (res.ok) {
        if (geminiKeyInput) {
          setHasGeminiKey(true);
        }
        setGeminiKeyInput(''); // clear input after saving
        alert("AI preferences saved securely!");
        setShowSettings(false);
      } else {
        alert("Failed to save preferences.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving preferences.");
    } finally {
      setSavingKey(false);
    }
  };

  const handleStatusChange = async (emailId: string, newStatus: string) => {
    // Optimistic update
    setEmails(emails.map(e => e.id === emailId ? { ...e, status: newStatus } : e));
    
    try {
      const res = await fetch(`/api/emails/${emailId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401) {
        window.location.href = '/api/auth/signin?callbackUrl=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (!res.ok) {
        // Revert on failure
        fetchEmails();
        alert("Failed to update status.");
      }
    } catch (err) {
      console.error(err);
      fetchEmails();
      alert("Error updating status.");
    }
  };

  const handleDelete = async (emailId: string) => {
    if (!confirm("Are you sure you want to delete this email from your dashboard and trash it in Gmail?")) return;

    // Optimistic UI update
    setEmails(emails.filter(e => e.id !== emailId));
    
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: "DELETE"
      });
      if (res.status === 401) {
        window.location.href = '/api/auth/signin?callbackUrl=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (!res.ok) {
        fetchEmails(); // Revert
        alert("Failed to delete email.");
      }
    } catch (err) {
      console.error(err);
      fetchEmails();
      alert("Error deleting email.");
    }
  };

  const openModal = (email: any) => {
    setSelectedEvent({ ...email });
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleApprove = async () => {
    try {
      const res = await fetch("/api/calendar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Interview: ${selectedEvent.company || 'Placement'} - ${selectedEvent.role || ''}`,
          date: selectedEvent.date,
          time: selectedEvent.time,
          description: selectedEvent.summary,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      
      if (res.ok) {
        alert(`Event for ${selectedEvent.company || 'the interview'} scheduled!`);
        closeModal();
      } else {
        alert("Failed to add to calendar.");
      }
    } catch (err) {
      console.error(err);
      alert("Error adding event.");
    }
  };

  if (status === "loading") {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }} className="animate-fade-in">
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '450px' }}>
          <h1 style={{ marginBottom: '1rem' }} className={styles.title}>Placement Tracker</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Log in with Google to automatically track your college placement emails and schedule interviews.
          </p>
          <button className="btn btn-primary" onClick={() => signIn('google')} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const filteredEmails =
    statusFilter === 'all'
      ? emails
      : emails.filter((e) => e.status?.toLowerCase() === statusFilter.toLowerCase());

  return (
    <>
      <div className={styles.dashboard}>
        <header className={`${styles.header} animate-fade-in`}>
          <div>
            <h1 className={styles.title}>Welcome, {session?.user?.name?.split(' ')[0] || 'User'}</h1>
            <p className={styles.subtitle}>AI-Powered Email Parsing & Calendar Sync</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              ⚙️ Settings
            </button>
            <button 
              className={`btn btn-primary ${styles.btnWithSpinner}`}
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <span className={styles.spinner}></span>
                  Syncing...
                </>
              ) : "Sync Emails"}
            </button>
            {!syncing && syncCount > 0 && (
              <span style={{ marginLeft: '12px', color: '#4ade80', fontSize: '14px', whiteSpace: 'nowrap' }}>
                ✓ {syncCount} emails synced
              </span>
            )}
            <button className="btn btn-secondary" onClick={() => signOut()}>
              Logout
            </button>
          </div>
        </header>

        {/* Stats Row */}
        <div className={styles.statsGrid}>
          {/* Total Applications — click to reset */}
          <div
            className={`glass-card ${styles.statCard} ${statusFilter === 'all' ? styles.activeCard : ''}`}
            onClick={() => setStatusFilter('all')}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statLabel}>Total Applications</div>
            <div className={styles.statValue}>{emails.length}</div>
          </div>

          {/* Shortlisted — click to filter */}
          <div
            className={`glass-card ${styles.statCard} ${statusFilter === 'Shortlisted' ? styles.activeCard : ''}`}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'Shortlisted' ? 'all' : 'Shortlisted'))
            }
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statLabel}>Shortlisted</div>
            <div className={styles.statValue}>
              {emails.filter((e) => e.status?.toLowerCase() === 'shortlisted').length}
            </div>
          </div>

          {/* Interviews — click to filter */}
          <div
            className={`glass-card ${styles.statCard} ${statusFilter === 'Interviewing' ? styles.activeCard : ''}`}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'Interviewing' ? 'all' : 'Interviewing'))
            }
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statLabel}>Interviews</div>
            <div className={styles.statValue}>
              {emails.filter((e) => e.status?.toLowerCase() === 'interviewing').length}
            </div>
          </div>
        </div>

        {/* Active filter indicator */}
        {statusFilter !== 'all' && (
          <div className={styles.filterBar}>
            Showing: <strong>{statusFilter}</strong>
            <button className={styles.clearFilter} onClick={() => setStatusFilter('all')}>
              Clear filter
            </button>
          </div>
        )}

        <section className="animate-fade-in">
          <h2 className={styles.sectionTitle}>Recent Updates</h2>
          <div className={`glass-panel ${styles.dataTableContainer}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Date / Time</th>
                  <th>AI Summary</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} style={{textAlign: 'center'}}>Loading...</td></tr>}
                {!loading && emails.length === 0 && (
                   <tr>
                     <td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>
                       No placement emails found in the last 2 months. Click "Sync Emails" to fetch.
                     </td>
                   </tr>
                )}
                {!loading && filteredEmails.length === 0 && statusFilter !== 'all' && (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      No {statusFilter.toLowerCase()} emails found.
                    </td>
                  </tr>
                )}
                {filteredEmails.map((email) => (
                  <tr key={email.id}>
                    <td className={styles.subjectCell}>
                      <a
                        href={`https://mail.google.com/mail/u/0/#all/${email.emailId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.gmailLink}
                        title="Open in Gmail"
                      >
                        <strong>{email.subject}</strong>
                      </a>

                      {email.company && email.company !== 'Unknown Company' && (
                        <div className={styles.metaLine}>
                          {email.company} {email.role ? `— ${email.role}` : ''}
                        </div>
                      )}
                    </td>
                  <td>
                    {email.date ? (
                      <>
                        <div>{email.date}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{email.time}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '300px', fontSize: '0.9rem' }}>
                    {email.summary}
                  </td>
                  <td>
                    <select 
                      className={styles.formInput}
                      style={{ padding: '0.4rem', fontSize: '0.9rem', width: 'auto' }}
                      value={email.status || 'Choose an option'}
                      onChange={(e) => handleStatusChange(email.id, e.target.value)}
                    >
                      <option value="Choose an option">Choose an option</option>
                      <option value="Applied">Applied</option>
                      <option value="Not Applied">Not Applied</option>
                      <option value="Not Eligible">Not Eligible</option>
                      <option value="Shortlisted">Shortlisted</option>
                      <option value="Interviewing">Interviewing</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {email.date ? (
                      <button className="btn btn-secondary" onClick={() => openModal(email)}>
                        Review & Schedule
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                        No Action
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(email.id)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        fontSize: '1.2rem',
                        opacity: 0.7,
                      }}
                      title="Delete email"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className={styles.modalOverlay}>
           <div className={`glass-panel ${styles.modal} animate-fade-in`}>
             <div className={styles.modalHeader}>
               <h3 className={styles.modalTitle}>🤖 AI Provider Settings</h3>
             </div>
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
               Choose how emails are analyzed. "Auto" picks the best available provider.
             </p>
             
             <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
               <label className={styles.formLabel}>AI Provider</label>
               <select 
                 className={styles.formInput} 
                 value={aiProvider} 
                 onChange={e => setAiProvider(e.target.value)}
                 style={{ padding: '0.8rem' }}
               >
                 <option value="auto">⚡ Auto (Recommended)</option>
                 <option value="ollama">🖥️ Ollama (Local - Unlimited, M2 Mac)</option>
                 <option value="groq">☁️ Groq (Cloud - Fast, 1K/day)</option>
                 <option value="openrouter">🌐 OpenRouter (Cloud - Free tier)</option>
                 <option value="gemini">🔑 Gemini (Cloud - Your own key)</option>
               </select>
             </div>

             {aiProvider === 'gemini' && (
               <div className={styles.formGroup}>
                 <label className={styles.formLabel}>Gemini API Key</label>
                 <input
                   className={styles.formInput}
                   type="password"
                   value={geminiKeyInput}
                   onChange={e => setGeminiKeyInput(e.target.value)}
                   placeholder={hasGeminiKey ? "•••••••• (key saved)" : "Paste your Gemini API key"}
                 />
                 {hasGeminiKey && !geminiKeyInput && (
                   <span style={{ color: '#10b981', fontSize: '0.8rem' }}>✓ Key already saved</span>
                 )}
               </div>
             )}

             <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
               <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Provider Status:</p>
               {Object.entries(aiHealth).map(([name, ok]) => (
                 <span key={name} style={{ 
                   display: 'inline-block',
                   marginRight: '0.75rem',
                   color: ok ? '#10b981' : '#ef4444'
                 }}>
                   {ok ? '🟢' : '🔴'} {name}
                 </span>
               ))}
             </div>
             
             <div className={styles.modalActions} style={{ marginTop: '1.5rem' }}>
               <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
               <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={savingKey}>
                 {savingKey ? "Saving..." : "Save AI Settings"}
               </button>
             </div>
           </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {selectedEvent && (
        <div className={styles.modalOverlay}>
          <div className={`glass-panel ${styles.modal} animate-fade-in`}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Confirm Calendar Event</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                Review the details extracted by AI before adding to Google Calendar.
              </p>
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Event Title</label>
              <input 
                type="text" 
                className={styles.formInput} 
                value={`Interview: ${selectedEvent.company || 'Placement'} - ${selectedEvent.role || ''}`}
                onChange={() => {}}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Date</label>
                <input 
                  type="date" 
                  className={styles.formInput} 
                  value={selectedEvent.date || ''}
                  onChange={(e) => setSelectedEvent({...selectedEvent, date: e.target.value})}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Time</label>
                <input 
                  type="time" 
                  className={styles.formInput} 
                  value={selectedEvent.time?.replace(' AM', '')?.replace(' PM', '') || ''}
                  onChange={(e) => setSelectedEvent({...selectedEvent, time: e.target.value})}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description (Extracted Summary)</label>
              <textarea 
                className={styles.formInput} 
                rows={3} 
                value={selectedEvent.summary}
                onChange={(e) => setSelectedEvent({...selectedEvent, summary: e.target.value})}
              />
            </div>

            <div className={styles.modalActions}>
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApprove}>Approve & Add</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
