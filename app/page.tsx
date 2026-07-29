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

  // Fetch emails on load if authenticated
  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails");
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
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
      }
    } catch (err) {
      console.error(err);
      alert("Failed to sync emails.");
    } finally {
      setSyncing(false);
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
          title: `Interview: ${selectedEvent.company} - ${selectedEvent.role}`,
          date: selectedEvent.date,
          time: selectedEvent.time,
          description: selectedEvent.summary
        })
      });
      
      if (res.ok) {
        alert(`Event for ${selectedEvent.company} scheduled!`);
        closeModal();
      } else {
        alert("Failed to add to calendar.");
      }
    } catch (err) {
      console.error(err);
      alert("Error adding event.");
    }
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'applied': return 'status-applied';
      case 'shortlisted': return 'status-shortlisted';
      case 'interviewing': return 'status-interviewing';
      case 'rejected': return 'status-rejected';
      default: return 'status-applied';
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
    <div className={`${styles.dashboard} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome, {session?.user?.name?.split(' ')[0] || 'User'}</h1>
          <p className={styles.subtitle}>AI-Powered Email Parsing & Calendar Sync</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync Emails"}
          </button>
          <button className="btn btn-secondary" onClick={() => signOut()}>
            Logout
          </button>
        </div>
      </header>

      <section className={styles.statsGrid}>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statLabel}>Total Applications</span>
          <span className={styles.statValue}>{emails.length}</span>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statLabel}>Shortlisted</span>
          <span className={styles.statValue}>{emails.filter(e => e.status.toLowerCase() === 'shortlisted').length}</span>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statLabel}>Interviews</span>
          <span className={styles.statValue}>{emails.filter(e => e.status.toLowerCase() === 'interviewing').length}</span>
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>Recent Updates</h2>
        <div className={`glass-panel ${styles.dataTableContainer}`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Date / Time</th>
                <th>AI Summary</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{textAlign: 'center'}}>Loading...</td></tr>}
              {!loading && emails.length === 0 && (
                 <tr>
                   <td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>
                     No placement emails found. Click "Sync Emails" to fetch.
                   </td>
                 </tr>
              )}
              {emails.map((email) => (
                <tr key={email.id}>
                  <td>
                    <strong>{email.company}</strong>
                    <br />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{email.role || '-'}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusClass(email.status)}`}>
                      {email.status}
                    </span>
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
                    {email.date ? (
                      <button className="btn btn-secondary" onClick={() => openModal(email)}>
                        Review & Schedule
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                        No Action
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                value={`Interview: ${selectedEvent.company} - ${selectedEvent.role}`}
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
    </div>
  );
}
