'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { loadMonitorLogsFromFirebase } from '@/lib/firebaseTeams';
import '../Database.css';

export default function DatabaseMonitorPage() {
  const [monitorLogs, setMonitorLogs] = useState<any[]>([]);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      const data = await loadMonitorLogsFromFirebase();
      setMonitorLogs(data);
      setIsLoaded(true);
    } catch (e) {
      console.error('Failed to load monitor logs:', e);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const toggleRow = (key: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRow(key);
    setTimeout(() => {
      setCopiedRow(null);
    }, 2000);
  };

  const getLogSummary = (log: any) => {
    const details = log.details || '';
    const action = log.action || '';
    
    if (action === 'Map IPs & Domains' || details.includes('Change domain New:')) {
      return 'Change domain New';
    }
    if (action === 'Add Server' || action === 'Bulk Import' || details.includes('new server add:')) {
      return 'new server add';
    }
    
    // Default fallback
    const firstLine = details.split('\n')[0] || '';
    if (firstLine.length > 80) {
      return firstLine.substring(0, 80) + '...';
    }
    return firstLine || action;
  };

  const getSummaryLabelColor = (log: any) => {
    const details = log.details || '';
    const action = log.action || '';
    
    if (action === 'Map IPs & Domains' || details.includes('Change domain New:')) {
      return '#38bdf8'; // Sky blue
    }
    if (action === 'Add Server' || action === 'Bulk Import' || details.includes('new server add:')) {
      return '#34d399'; // Emerald green
    }
    return '#cbd5e1'; // Slate grey
  };

  return (
    <div className="database-page animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <style>{`
        .monitor-back-btn {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 0.65rem 1.25rem;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .monitor-back-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
          opacity: 0.95;
        }
        .action-toggle-btn {
          padding: 0.35rem 0.75rem; 
          font-size: 0.8rem;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          transition: all 0.2s ease;
        }
        .action-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
          color: #fff;
        }
        .action-toggle-btn.expanded {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.3);
        }
        .action-toggle-btn.expanded:hover {
          background: rgba(239, 68, 68, 0.25);
          color: #fca5a5;
        }
        .action-copy-btn {
          padding: 0.35rem 0.75rem; 
          font-size: 0.8rem;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          transition: all 0.2s ease;
        }
        .action-copy-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
          color: #fff;
        }
        .action-copy-btn.copied {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.3);
        }
        .action-copy-btn.copied:hover {
          background: rgba(16, 185, 129, 0.25);
          color: #6ee7b7;
        }
      `}</style>
      <header className="db-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Database Monitor</h1>
          <p className="db-subtitle">Audit trails and database changes history log</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <Link 
            href="/database" 
            className="monitor-back-btn"
          >
            ⬅️ Back to Database
          </Link>
        </div>
      </header>

      <div className="db-toolbar" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="db-toolbar-left" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <div className="db-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search logs by action, details, date..."
              value={monitorSearch}
              onChange={e => setMonitorSearch(e.target.value)}
              className="search-input"
              style={{ width: '320px' }}
            />
          </div>
          {monitorSearch && (
            <button 
              className="minimal-btn" 
              onClick={() => setMonitorSearch('')}
              style={{ color: '#94a3b8', borderColor: 'rgba(255, 255, 255, 0.1)' }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="db-toolbar-right" style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            className="bulk-import-btn"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            onClick={loadLogs}
          >
            🔄 Refresh Logs
          </button>
        </div>
      </div>

      <div className="team-board-container animate-fade-in" style={{ marginTop: '1.5rem' }}>
        <div className="board-header">
          <div className="board-header-left">
            <h2>📜 Audit Logs Trail</h2>
          </div>
          <div className="board-header-right">
            <span className="stat-active" style={{ color: '#818cf8', border: '1px solid rgba(129, 140, 248, 0.2)', background: 'rgba(129, 140, 248, 0.05)' }}>
              Total Logs: <strong>{monitorLogs.length} Records</strong>
            </span>
          </div>
        </div>

        <div className="db-table-container no-border-radius-top" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table className="db-table clean-table">
            <thead>
              <tr>
                <th style={{ width: '220px' }}>Date &amp; Time</th>
                <th style={{ width: '220px' }}>Action Type</th>
                <th>Request Details</th>
              </tr>
            </thead>
            <tbody>
              {!isLoaded ? (
                <tr>
                  <td colSpan={3} className="empty-row" style={{ color: '#94a3b8', padding: '3rem' }}>
                    <div className="loading-spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }}>⏳</div> Loading audit logs from database...
                  </td>
                </tr>
              ) : monitorLogs.filter(log => {
                if (!monitorSearch) return true;
                const term = monitorSearch.toLowerCase();
                return (
                  (log.action || '').toLowerCase().includes(term) ||
                  (log.details || '').toLowerCase().includes(term) ||
                  new Date(log.timestamp).toLocaleString().toLowerCase().includes(term)
                );
              }).length > 0 ? (
                monitorLogs
                  .filter(log => {
                    if (!monitorSearch) return true;
                    const term = monitorSearch.toLowerCase();
                    return (
                      (log.action || '').toLowerCase().includes(term) ||
                      (log.details || '').toLowerCase().includes(term) ||
                      new Date(log.timestamp).toLocaleString().toLowerCase().includes(term)
                    );
                  })
                  .map((log, idx) => {
                    const logKey = `${log.timestamp}-${idx}`;
                    const isExpanded = !!expandedRows[logKey];
                    const isCopied = copiedRow === logKey;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <td className="td-date" style={{ color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'inline-block',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            background: 
                              log.action === 'Add Server' ? 'rgba(16, 185, 129, 0.15)' :
                              log.action === 'Edit Server' ? 'rgba(59, 130, 246, 0.15)' :
                              log.action === 'Delete Server' ? 'rgba(239, 68, 68, 0.15)' :
                              log.action === 'Permanent Delete' ? 'rgba(220, 38, 38, 0.25)' :
                              log.action === 'Bulk Import' ? 'rgba(16, 185, 129, 0.2)' :
                              log.action === 'Bulk Cancel' ? 'rgba(239, 68, 68, 0.2)' :
                              log.action === 'Map IPs & Domains' ? 'rgba(56, 189, 248, 0.2)' :
                              'rgba(255, 255, 255, 0.1)',
                            color:
                              log.action === 'Add Server' ? '#34d399' :
                              log.action === 'Edit Server' ? '#60a5fa' :
                              log.action === 'Delete Server' ? '#f87171' :
                              log.action === 'Permanent Delete' ? '#fca5a5' :
                              log.action === 'Bulk Import' ? '#34d399' :
                              log.action === 'Bulk Cancel' ? '#fca5a5' :
                              log.action === 'Map IPs & Domains' ? '#38bdf8' :
                              '#cbd5e1',
                            border: 
                              log.action === 'Add Server' ? '1px solid rgba(16, 185, 129, 0.3)' :
                              log.action === 'Edit Server' ? '1px solid rgba(59, 130, 246, 0.3)' :
                              log.action === 'Delete Server' ? '1px solid rgba(239, 68, 68, 0.3)' :
                              log.action === 'Permanent Delete' ? '1px solid rgba(220, 38, 38, 0.4)' :
                              log.action === 'Bulk Import' ? '1px solid rgba(16, 185, 129, 0.4)' :
                              log.action === 'Bulk Cancel' ? '1px solid rgba(239, 68, 68, 0.4)' :
                              log.action === 'Map IPs & Domains' ? '1px solid rgba(56, 189, 248, 0.4)' :
                              '1px solid rgba(255, 255, 255, 0.15)',
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.8rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
                              <span style={{ 
                                fontWeight: 600, 
                                color: getSummaryLabelColor(log),
                                fontSize: '0.92rem',
                                letterSpacing: '0.01em'
                              }}>
                                {getLogSummary(log)}
                              </span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => toggleRow(logKey)} 
                                  className={`action-toggle-btn ${isExpanded ? 'expanded' : ''}`}
                                >
                                  {isExpanded ? '🙈 Hide' : '👁️ View'}
                                </button>
                                <button 
                                  onClick={() => handleCopy(log.details, logKey)}
                                  className={`action-copy-btn ${isCopied ? 'copied' : ''}`}
                                >
                                  {isCopied ? '✔️ Copied!' : '📋 Copy'}
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="animate-fade-in" style={{ 
                                marginTop: '0.5rem', 
                                padding: '1rem', 
                                background: 'rgba(0, 0, 0, 0.35)', 
                                border: '1px solid rgba(255, 255, 255, 0.08)', 
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                color: '#cbd5e1',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'monospace',
                                maxHeight: '350px',
                                overflowY: 'auto',
                                lineHeight: '1.6',
                                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                              }}>
                                {log.details}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={3} className="empty-row" style={{ color: '#64748b', padding: '3rem' }}>
                    No audit logs found matching your query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
