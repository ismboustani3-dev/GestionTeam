'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, saveTeamsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './PostmasterCheck.css';

function getRootDomain(domain: string): string {
  if (!domain) return '';
  const cleanDomain = domain.toLowerCase().trim();
  const parts = cleanDomain.split('.');
  if (parts.length <= 2) return cleanDomain;
  
  const len = parts.length;
  const last2 = parts[len - 2] + '.' + parts[len - 1];
  const multiPartTlds = ['co.uk', 'com.br', 'org.uk', 'net.uk', 'co.nz', 'com.au', 'com.tr', 'co.za'];
  
  if (multiPartTlds.includes(last2) && len > 2) {
    return parts[len - 3] + '.' + last2;
  }
  
  return parts[len - 2] + '.' + parts[len - 1];
}

interface PostmasterRow {
  serverId: string;
  serverName: string;
  serverStatus?: string;
  domain: string;
  ip: string;
  status: 'OK' | 'FAIL' | 'Pending';
  reason: string;
  date: string;
  googleSiteVerification?: string;
  postmasterStatus?: string;
}

export default function PostmasterCheckPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail' | 'pending'>('all');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  // Bot process states
  const [botStatus, setBotStatus] = useState<any>({
    status: 'idle',
    pid: null,
    mode: null,
    logs: ''
  });
  const [isBotLoading, setIsBotLoading] = useState(false);

  const [prevStatus, setPrevStatus] = useState<string>('idle');

  // Poll Google Postmaster Bot status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchBotStatus = async () => {
      try {
        const res = await fetch('/api/infrastructure/postmaster-bot');
        if (res.ok) {
          const data = await res.json();
          setBotStatus(data);
        }
      } catch (e) {
        console.error('Failed to fetch bot status:', e);
      }
    };

    fetchBotStatus();
    interval = setInterval(fetchBotStatus, 2500);

    return () => clearInterval(interval);
  }, []);

  // Reload data when bot status transitions from running to idle
  useEffect(() => {
    if (botStatus.status === 'idle' && prevStatus === 'running') {
      console.log('Postmaster bot finished running. Auto-reloading teams...');
      loadTeams(false);
    }
    setPrevStatus(botStatus.status);
  }, [botStatus.status, prevStatus]);

  const handleStartBot = async (mode: 'add' | 'validate' | 'sync' | 'delete' | 'fetch', domains?: string[]) => {
    setIsBotLoading(true);
    try {
      const res = await fetch('/api/infrastructure/postmaster-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', mode, domains })
      });
      const data = await res.json();
      if (res.ok) {
        setBotStatus(data);
        showToast(`🚀 Google Postmaster bot started (${mode} mode)`);
      } else {
        alert(`Error starting bot: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to start bot');
    } finally {
      setIsBotLoading(false);
    }
  };

  const handleStopBot = async () => {
    setIsBotLoading(true);
    try {
      const res = await fetch('/api/infrastructure/postmaster-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      const data = await res.json();
      if (res.ok) {
        setBotStatus(data);
        showToast('🛑 Google Postmaster bot stopped');
      } else {
        alert(`Error stopping bot: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to stop bot');
    } finally {
      setIsBotLoading(false);
    }
  };

  const handleStartDelete = async () => {
    if (!deleteText.trim()) return;
    const domains = deleteText
      .split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d && d.includes('.'));
    
    if (domains.length === 0) {
      alert('Please enter at least one valid domain (e.g. example.com)');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${domains.length} domains from Google Postmaster Tools?`)) {
      return;
    }
    
    setIsDeleteOpen(false);
    setDeleteText('');
    await handleStartBot('delete', domains);
  };

  const handleExportTxtRecords = () => {
    const rowsWithVerification = filteredRows.filter(r => r.googleSiteVerification);
    
    if (rowsWithVerification.length === 0) {
      showToast('No TXT verification records found to export under current filters.');
      return;
    }

    const seenRoots = new Set<string>();
    const fileContent = rowsWithVerification
      .map(r => {
        const root = getRootDomain(r.domain);
        if (seenRoots.has(root)) return null;
        seenRoots.add(root);
        return `${root},${root},TXT,${r.googleSiteVerification}`;
      })
      .filter(line => line !== null)
      .join('\n');

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const filterSuffix = searchQuery ? `_${searchQuery.trim().replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    link.download = `postmaster_txt_records_${activeTeam.toLowerCase()}${filterSuffix}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`💾 Exported ${rowsWithVerification.length} TXT records successfully!`);
  };

  const handleResetAllStatuses = async () => {
    if (!confirm('Are you sure you want to reset all Google Postmaster statuses in this team to Unverified?')) return;
    
    try {
      const updatedTeams = teams.map(t => {
        if (t.name !== activeTeam) return t;

        return {
          ...t,
          servers: (t.servers || []).map((s: any) => {
            if (s.status === 'deleted') return s;
            const newPostmasterDetails = { ...(s.postmasterDetails || {}) };
            let hasUpdates = false;

            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            uniqueDomains.forEach((d: any) => {
              if (d.domain && newPostmasterDetails[d.domain]) {
                newPostmasterDetails[d.domain] = {
                  ...newPostmasterDetails[d.domain],
                  postmasterStatus: 'Not Verified'
                };
                hasUpdates = true;
              }
            });

            if (hasUpdates) {
              return { ...s, postmasterDetails: newPostmasterDetails };
            }
            return s;
          })
        };
      });

      await triggerSave(updatedTeams);
      showToast('🔄 Reset all domain statuses to Unverified!');
    } catch (err) {
      console.error(err);
      alert('Failed to reset statuses');
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const loadTeams = async (isInitial = false) => {
    if (isInitial) setIsLoaded(false);
    try {
      const data = await loadTeamsFromFirebase();
      if (data && data.length > 0) {
        setTeams(data);
        if (isInitial) {
          setActiveTeam(data[0].name || 'REDA');
        }
      } else if (isInitial) {
        setTeams([{ name: 'REDA', servers: [] }, { name: 'AMINE', servers: [] }]);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      if (isInitial) setIsLoaded(true);
    }
  };

  // Load teams on mount
  useEffect(() => {
    loadTeams(true);
  }, []);

  // Sync teams state with Firebase
  const triggerSave = async (updatedTeams: any[]) => {
    setTeams(updatedTeams);
    await saveTeamsToFirebase(updatedTeams);
    // Sync to backend for cron jobs
    fetch('/api/cron-check', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams: updatedTeams })
    }).catch(() => {});
  };

  const handleTeamChange = (name: string) => {
    setActiveTeam(name);
  };

  // Build rows from active servers for selected team
  const postmasterRows = useMemo(() => {
    const activeTeamObj = teams.find(t => t.name === activeTeam);
    const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    
    const rows: PostmasterRow[] = [];
    const seenDomains = new Set<string>();
    
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      
      const addDomain = (domain: string, ip: string) => {
        if (!domain || domain === 'No Domain Mapped' || domain === 'No Domain' || seenDomains.has(domain)) return;
        seenDomains.add(domain);
        
        const saved = server.postmasterDetails?.[domain];
        rows.push({
          serverId: server.id,
          serverName: server.serverName,
          serverStatus: server.status,
          domain: domain,
          ip: ip || '—',
          status: saved?.status || 'Pending',
          reason: saved?.reason || 'Pending verification check',
          date: saved?.date || '—',
          googleSiteVerification: saved?.googleSiteVerification || '',
          postmasterStatus: saved?.postmasterStatus || 'Pending'
        });
      };

      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => {
          if (d.domain) addDomain(d.domain, d.ip);
        });
      }
    });

    return rows;
  }, [teams, activeTeam]);

  // Filtered rows by search and status
  const filteredRows = useMemo(() => {
    let result = postmasterRows;

    if (searchQuery) {
      const terms = searchQuery
        .split(/[,|;\s]+/)
        .map(t => t.trim().toLowerCase())
        .filter(t => t);

      if (terms.length > 0) {
        result = result.filter(r => 
          terms.some(q => 
            r.serverName.toLowerCase().includes(q) || 
            r.domain.toLowerCase().includes(q) ||
            r.ip.toLowerCase().includes(q)
          )
        );
      }
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'ok') {
        result = result.filter(r => r.postmasterStatus === 'Verified');
      } else if (statusFilter === 'fail') {
        result = result.filter(r => r.postmasterStatus === 'Not Verified');
      } else if (statusFilter === 'pending') {
        result = result.filter(r => r.postmasterStatus === 'Pending' || !r.postmasterStatus);
      }
    }

    return result;
  }, [postmasterRows, searchQuery, statusFilter]);

  // Pre-calculate row spans for server name grouping
  const rowSpans = useMemo(() => {
    const spans: number[] = [];
    let i = 0;
    while (i < filteredRows.length) {
      let count = 1;
      const currentServerId = filteredRows[i].serverId;
      while (i + count < filteredRows.length && filteredRows[i + count].serverId === currentServerId) {
        count++;
      }
      spans[i] = count;
      for (let j = 1; j < count; j++) {
        spans[i + j] = 0;
      }
      i += count;
    }
    return spans;
  }, [filteredRows]);

  // Calculate postmaster status stats dynamically
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const verified = filteredRows.filter(r => r.postmasterStatus === 'Verified').length;
    const unverified = filteredRows.filter(r => r.postmasterStatus === 'Not Verified').length;
    const pending = filteredRows.filter(r => r.postmasterStatus === 'Pending' || !r.postmasterStatus).length;

    const getPct = (count: number) => {
      if (total === 0) return '0%';
      return `${Math.round((count / total) * 100)}%`;
    };

    return {
      total,
      verified,
      verifiedPct: getPct(verified),
      unverified,
      unverifiedPct: getPct(unverified),
      pending,
      pendingPct: getPct(pending)
    };
  }, [filteredRows]);

  const togglePostmasterStatus = async (row: PostmasterRow) => {
    const newStatus = row.postmasterStatus === 'Verified' ? 'Not Verified' : 'Verified';
    try {
      const updatedTeams = teams.map(t => {
        if (t.name !== activeTeam) return t;

        return {
          ...t,
          servers: (t.servers || []).map((s: any) => {
            if (s.id === row.serverId) {
              const currentDetails = s.postmasterDetails?.[row.domain] || {};
              return {
                ...s,
                postmasterDetails: {
                  ...(s.postmasterDetails || {}),
                  [row.domain]: {
                    ...currentDetails,
                    postmasterStatus: newStatus
                  }
                }
              };
            }
            return s;
          })
        };
      });

      await triggerSave(updatedTeams);
      showToast(`Updated ${row.domain} to ${newStatus}`);
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to update status');
    }
  };

  // Copy checks based on status
  const copyPostmasterData = (status: 'Verified' | 'Not Verified' | 'Pending') => {
    const items = filteredRows.filter(r => r.postmasterStatus === status || (status === 'Pending' && !r.postmasterStatus));
    
    if (items.length > 0) {
      const header = 'Server\tIP\tDomain\tGoogle Postmaster Status\tVerification Key';
      const text = `${header}\n${items.map(i => `${i.serverName}\t${i.ip}\t${i.domain}\t${i.postmasterStatus || 'Pending'}\t${i.googleSiteVerification || ''}`).join('\n')}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${items.length} Postmaster (${status}) items to clipboard!`);
      });
    } else {
      showToast(`No Postmaster (${status}) items found under current filters.`);
    }
  };

  // Copy all unique domains as a JS array
  const copyDomainsForGooglePostmaster = () => {
    const domainList = Array.from(new Set(filteredRows.map(r => getRootDomain(r.domain))));
    if (domainList.length > 0) {
      const arrayString = JSON.stringify(domainList, null, 2);
      navigator.clipboard.writeText(arrayString).then(() => {
        showToast(`📋 Copied ${domainList.length} root domains as JS Array to clipboard!`);
      });
    } else {
      showToast('No domains found to copy under current filters.');
    }
  };

  // Import Google Site Verification keys from clipboard text area
  const handleImportGoogleKeys = async () => {
    if (!importText.trim()) return;

    try {
      const lines = importText.split('\n');
      const keyMap: Record<string, string> = {};

      lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const domain = parts[0].trim();
          const key = parts[1].trim();
          if (domain && key) {
            keyMap[domain] = key;
          }
        } else {
          const partsSpace = line.split(/\s+/);
          if (partsSpace.length >= 2) {
            const domain = partsSpace[0].trim();
            const keyPart = partsSpace.find(p => p.includes('google-site-verification='));
            if (domain && keyPart) {
              keyMap[domain] = keyPart.trim();
            }
          }
        }
      });

      const domainCount = Object.keys(keyMap).length;
      if (domainCount === 0) {
        alert('Could not find any valid domain/key pairs. Ensure they are in format: domain [tab/space] google-site-verification=...');
        return;
      }

      const updatedTeams = teams.map(t => {
        if (t.name !== activeTeam) return t;

        return {
          ...t,
          servers: (t.servers || []).map((s: any) => {
            if (s.status === 'deleted') return s;
            const newPostmasterDetails = { ...(s.postmasterDetails || {}) };
            let hasUpdates = false;

            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            uniqueDomains.forEach((d: any) => {
              if (d.domain && keyMap[d.domain]) {
                newPostmasterDetails[d.domain] = {
                  ...(newPostmasterDetails[d.domain] || { status: 'Pending', date: '—', reason: 'Verification pending' }),
                  googleSiteVerification: keyMap[d.domain]
                };
                hasUpdates = true;
              }
            });

            if (hasUpdates) {
              return { ...s, postmasterDetails: newPostmasterDetails };
            }
            return s;
          })
        };
      });

      await triggerSave(updatedTeams);
      showToast(`✅ Successfully imported ${domainCount} Google Site Verification keys!`);
      setImportText('');
      setIsImportOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error occurred during importing keys');
    }
  };

  return (
    <div className="postmaster-check-container animate-fade-in">
      {/* Header */}
      <div className="postmaster-check-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            📬 Postmaster Mailbox Auditor
          </h1>
          <p>
            Verify that domains have a valid and deliverable <code>postmaster@domain</code> mailbox as required by RFC standards.
          </p>
        </div>
        <Link href="/infrastructure" className="btn-postmaster-action secondary">
          ← Back to Center
        </Link>
      </div>

      {/* Team selection tabs */}
      <div className="postmaster-tabs">
        {teams.map(t => {
          const activeTeamObj = teams.find(team => team.name === t.name);
          const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
          let domainCount = 0;
          const seen = new Set();
          dbServers.forEach((s: any) => {
            const ipDomains = getUniqueIpDomains(s.ipDomains);
            ipDomains.forEach((d: any) => {
              if (d.domain && d.domain !== 'No Domain Mapped' && d.domain !== 'No Domain' && !seen.has(d.domain)) {
                seen.add(d.domain);
                domainCount++;
              }
            });
          });

          return (
            <button
              key={t.name}
              className={`postmaster-tab ${activeTeam === t.name ? 'active' : ''}`}
              onClick={() => handleTeamChange(t.name)}
            >
              👥 {t.name}
              <span className="tab-count-badge">{domainCount} domains</span>
            </button>
          );
        })}
      </div>

      {/* Stats Cards Dashboard */}
      <div className="postmaster-stats-row animate-fade-in">
        <div className="postmaster-stat-card total">
          <div className="stat-card-label">📁 Total Domains</div>
          <div className="stat-card-value">{stats.total}</div>
        </div>
        <div className="postmaster-stat-card verified">
          <div className="stat-card-label">🟢 Verified Domains</div>
          <div className="stat-card-value">
            {stats.verified}
            <span className="stat-card-pct">({stats.verifiedPct})</span>
          </div>
        </div>
        <div className="postmaster-stat-card unverified">
          <div className="stat-card-label">🔴 Unverified Domains</div>
          <div className="stat-card-value">
            {stats.unverified}
            <span className="stat-card-pct">({stats.unverifiedPct})</span>
          </div>
        </div>
        <div className="postmaster-stat-card pending">
          <div className="stat-card-label">⏳ Pending Domains</div>
          <div className="stat-card-value">
            {stats.pending}
            <span className="stat-card-pct">({stats.pendingPct})</span>
          </div>
        </div>
      </div>

      {/* Search & Actions Panel */}
      <div className="filters-actions-row">
        <div className="search-filters-pane">
          <textarea
            className="search"
            placeholder="Search by server or domain..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="filter-select-postmaster"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Statuses</option>
            <option value="ok">🟢 Verified</option>
            <option value="fail">🔴 Unverified</option>
            <option value="pending">⏳ Pending</option>
          </select>
        </div>

        <div className="actions-pane">
          <button
            className="btn-postmaster-action secondary"
            onClick={copyDomainsForGooglePostmaster}
            style={{ color: '#c084fc' }}
          >
            📋 Copy Domain List
          </button>
          <button
            className="btn-postmaster-action secondary"
            onClick={() => setIsImportOpen(true)}
            style={{ color: '#38bdf8' }}
          >
            📥 Import Google Keys
          </button>
          <button
            className="btn-postmaster-action secondary"
            onClick={() => copyPostmasterData('Verified')}
          >
            📋 Copy Verified
          </button>
          <button
            className="btn-postmaster-action secondary"
            onClick={() => copyPostmasterData('Not Verified')}
            style={{ color: '#fca5a5' }}
          >
            📋 Copy Unverified
          </button>
        </div>
      </div>



      {/* Google Postmaster Bot Control Panel */}
      <div className="postmaster-bot-panel animate-fade-in">
        <div className="bot-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🤖</span>
            <span className="bot-panel-title">Google Postmaster Tools Bot</span>
          </div>
          <div className="bot-panel-status">
            Status: {' '}
            <span className={`bot-status-badge ${botStatus.status}`}>
              {botStatus.status === 'running' 
                ? `RUNNING (${botStatus.mode === 'add' ? 'Add Mode' : botStatus.mode === 'validate' ? 'Validate Mode' : botStatus.mode === 'sync' ? 'Sync Mode' : botStatus.mode === 'delete' ? 'Delete Mode' : botStatus.mode === 'fetch' ? 'Fetch Mode' : 'All Mode'})` 
                : 'IDLE'}
            </span>
          </div>
        </div>
 
        <div className="bot-panel-actions">
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.4)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={() => {
              const targetDomains = (searchQuery.trim() || statusFilter !== 'all') ? filteredRows.map(r => r.domain) : undefined;
              handleStartBot('add', targetDomains);
            }}
          >
            🚀 Launch Add Process
          </button>
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.4)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={() => {
              const targetDomains = (searchQuery.trim() || statusFilter !== 'all') ? filteredRows.map(r => r.domain) : undefined;
              handleStartBot('validate', targetDomains);
            }}
          >
            🔍 Launch Validation
          </button>
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={() => {
              const targetDomains = (searchQuery.trim() || statusFilter !== 'all') ? filteredRows.map(r => r.domain) : undefined;
              handleStartBot('sync', targetDomains);
            }}
          >
            🔄 Sync GWT Statuses
          </button>
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={() => {
              const targetDomains = (searchQuery.trim() || statusFilter !== 'all') ? filteredRows.map(r => r.domain) : undefined;
              handleStartBot('fetch', targetDomains);
            }}
          >
            🔑 Fetch GWT Keys
          </button>
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#b91c1c', borderColor: 'rgba(185, 28, 28, 0.4)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={() => setIsDeleteOpen(true)}
          >
            🗑️ Delete Domains
          </button>
          <button
            className="btn-postmaster-action primary"
            style={{ background: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            disabled={botStatus.status !== 'running' || isBotLoading}
            onClick={handleStopBot}
          >
            🛑 Stop Bot Process
          </button>
          <button
            className="btn-postmaster-action secondary"
            style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', marginLeft: 'auto' }}
            onClick={handleExportTxtRecords}
          >
            📤 Export TXT Records
          </button>
          <button
            className="btn-postmaster-action secondary"
            style={{ color: '#f97316', borderColor: 'rgba(249, 115, 22, 0.3)', background: 'rgba(249, 115, 22, 0.05)' }}
            disabled={botStatus.status === 'running' || isBotLoading}
            onClick={handleResetAllStatuses}
            title="Reset all Google Postmaster statuses in this team to Unverified"
          >
            🔄 Reset Statuses
          </button>
        </div>

        {/* Live log Console */}
        <div className="bot-console-container">
          <div className="bot-console-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`console-pulsing-dot ${botStatus.status}`} />
              <span>Live Output Terminal</span>
            </div>
            {botStatus.pid && <span style={{ color: '#64748b', fontSize: '0.85rem' }}>PID: {botStatus.pid}</span>}
          </div>
          <pre className="bot-console-logs">
            {botStatus.logs || 'Console is empty. Start a process to view logs.'}
          </pre>
        </div>
      </div>

      {/* Table grid */}
      <div className="postmaster-table-container">
        {!isLoaded ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading domains list...
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
            No domains found matching the filters.
          </div>
        ) : (
          <table className="postmaster-table">
            <thead>
              <tr>
                <th>Server</th>
                <th>IP</th>
                <th>Domain</th>
                <th>Postmaster Health</th>
                <th>Google Postmaster</th>
                <th>Google Verification Key</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const span = rowSpans[idx];
                const isFirstOfGroup = span > 0;
                
                // Add a visual dividing line at the top of each new server group (except the very first row of the table)
                const cellStyle = isFirstOfGroup && idx > 0 
                  ? { borderTop: '3px solid rgba(255, 255, 255, 0.3)' } 
                  : {};

                return (
                  <tr key={`${r.serverId}_${r.domain}_${idx}`}>
                    {isFirstOfGroup && (
                      <td 
                        className="server-cell" 
                        rowSpan={span}
                        style={{
                          verticalAlign: 'middle',
                          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                          background: 'rgba(30, 41, 59, 0.2)',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: '#38bdf8', // custom color for server name (light blue)
                          ...cellStyle
                        }}
                      >
                        🖥️ {r.serverName}
                      </td>
                    )}
                    <td style={cellStyle}><code>{r.ip}</code></td>
                    <td className="domain-cell" style={cellStyle}><code>{r.domain}</code></td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span className={`badge-postmaster ${r.status === 'OK' ? 'ok' : r.status === 'FAIL' ? 'fail' : 'pending'}`}>
                          {r.status === 'OK' ? '✓ Healthy' : r.status === 'FAIL' ? '✗ Unhealthy' : '⏳ Pending'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '220px', whiteSpace: 'normal', lineHeight: '1.2' }}>
                          {r.reason}
                        </span>
                        {r.date && r.date !== '—' && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Checked: {r.date}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <span 
                        className={`badge-postmaster ${r.postmasterStatus === 'Verified' ? 'ok' : r.postmasterStatus === 'Not Verified' ? 'fail' : 'pending'}`}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        title="Click to toggle Google Postmaster status manually"
                        onClick={() => togglePostmasterStatus(r)}
                      >
                        {r.postmasterStatus === 'Verified' ? '✓ Verified' : r.postmasterStatus === 'Not Verified' ? '✗ Unverified' : '⏳ Pending'}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      {r.googleSiteVerification ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <code style={{ fontSize: '0.8rem', color: '#c084fc', background: 'rgba(192, 132, 252, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            {r.googleSiteVerification.replace('google-site-verification=', '')}
                          </code>
                          <button
                            className="btn-postmaster-action secondary"
                            style={{ padding: '0.15rem 0.3rem', fontSize: '0.75rem', display: 'inline-flex' }}
                            title="Copy Full Verification Key"
                            onClick={() => {
                              navigator.clipboard.writeText(r.googleSiteVerification || '');
                              showToast('📋 Copied Google key to clipboard!');
                            }}
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {isImportOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '600px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
              📥 Import Google Verification Keys
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.2rem', lineHeight: '1.4' }}>
              Paste the tab-separated or space-separated list of domains and their google-site-verification keys. 
              Example format: <br/>
              <code>domain1.com  google-site-verification=gh_CsFq...</code>
            </p>
            <textarea
              style={{
                width: '100%',
                height: '200px',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                padding: '0.8rem',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical',
                marginBottom: '1.5rem'
              }}
              placeholder="Paste domain and keys here..."
              value={importText}
              onChange={e => setImportText(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
              <button
                className="btn-postmaster-action secondary"
                onClick={() => {
                  setImportText('');
                  setIsImportOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-postmaster-action primary"
                onClick={handleImportGoogleKeys}
                disabled={!importText.trim()}
              >
                Save Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Domains Modal */}
      {isDeleteOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '600px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🗑️ Delete Domains from Google Postmaster
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.2rem', lineHeight: '1.4' }}>
              Paste the list of domains you want to delete from Google Postmaster Tools (one domain per line).
              The bot will automate clicking option menus → <em>Supprimer le domaine</em> → <em>SUPPRIMER</em> confirmation, and then clear their status in Firestore.
            </p>
            <textarea
              style={{
                width: '100%',
                height: '200px',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                padding: '0.8rem',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical',
                marginBottom: '1.5rem'
              }}
              placeholder="example1.com&#10;example2.com"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
              <button
                className="btn-postmaster-action secondary"
                onClick={() => {
                  setDeleteText('');
                  setIsDeleteOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-postmaster-action primary"
                style={{ background: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                onClick={handleStartDelete}
                disabled={!deleteText.trim()}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast message popup */}
      {toastMessage && (
        <div className="toast-postmaster animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
