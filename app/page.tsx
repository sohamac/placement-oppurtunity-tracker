"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import styles from "./page.module.css";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
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
        if (data.geminiApiKey) {
          setApiKey(data.geminiApiKey);
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
    }
  }, [status]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully synced ${data.processedCount} new emails!`);
        fetchEmails(); // Refresh list
      } else {
         alert("Failed to sync emails.");
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
      const res = await fetch("/api/user/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) {
        alert("API Key saved securely!");
        setShowSettings(false);
      } else {
        alert("Failed to save API key.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving API key.");
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
              className="btn btn-primary" 
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <div className={styles.spinner}></div>
                  Syncing...
                </>
              ) : "Sync Emails"}
            </button>
            <button className="btn btn-secondary" onClick={() => signOut()}>
              Logout
            </button>
          </div>
        </header>

        <section className={`${styles.statsGrid} animate-fade-in`}>
          <div className={`glass-card ${styles.statCard}`}>
            <span className={styles.statLabel}>Total Applications</span>
            <span className={styles.statValue}>{emails.length}</span>
          </div>
          <div className={`glass-card ${styles.statCard}`}>
            <span className={styles.statLabel}>Shortlisted</span>
            <span className={styles.statValue}>{emails.filter(e => e.status?.toLowerCase() === 'shortlisted').length}</span>
          </div>
          <div className={`glass-card ${styles.statCard}`}>
            <span className={styles.statLabel}>Interviews</span>
            <span className={styles.statValue}>{emails.filter(e => e.status?.toLowerCase() === 'interviewing').length}</span>
          </div>
        </section>

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
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td style={{ maxWidth: '250px' }}>
                      <strong>
                        <a href={`https://mail.google.com/mail/u/0/#inbox/${email.emailId}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>
                          {email.subject}
                        </a>
                      </strong>
                    {email.company && email.company !== 'Unknown Company' && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {email.company} {email.role ? `- ${email.role}` : ''}
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
               <h3 className={styles.modalTitle}>Settings</h3>
             </div>
             
             <div className={styles.formGroup}>
               <label className={styles.formLabel}>Your Gemini API Key (Optional)</label>
               <input 
                 type="password" 
                 className={styles.formInput} 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder="AIzaSy..."
               />
               <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                 Leave blank to use the system default key. If you are a college mate, please use your own free key!
               </p>
             </div>
             
             <div className={styles.modalActions}>
               <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
               <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={savingKey}>
                 {savingKey ? "Saving..." : "Save Key"}
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
