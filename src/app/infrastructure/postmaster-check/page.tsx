'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, saveTeamsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './PostmasterCheck.css';

interface PostmasterRow {
  serverId: string;
  serverName: string;
  serverStatus?: string;
  domain: string;
  status: 'OK' | 'FAIL' | 'Pending';
  reason: string;
  date: string;
}

export default function PostmasterCheckPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail' | 'pending'>('all');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [totalToCheck, setTotalToCheck] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Load teams on mount
  useEffect(() => {
    const load = async () => {
      try {
        const data = await loadTeamsFromFirebase();
        if (data && data.length > 0) {
          setTeams(data);
          setActiveTeam(data[0].name || 'REDA');
        } else {
          setTeams([{ name: 'REDA', servers: [] }, { name: 'AMINE', servers: [] }]);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
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
      
      const addDomain = (domain: string) => {
        if (!domain || domain === 'No Domain Mapped' || domain === 'No Domain' || seenDomains.has(domain)) return;
        seenDomains.add(domain);
        
        const saved = server.postmasterDetails?.[domain];
        rows.push({
          serverId: server.id,
          serverName: server.serverName,
          serverStatus: server.status,
          domain: domain,
          status: saved?.status || 'Pending',
          reason: saved?.reason || 'Pending verification check',
          date: saved?.date || '—'
        });
      };

      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => {
          if (d.domain) addDomain(d.domain);
        });
      }
    });

    return rows;
  }, [teams, activeTeam]);

  // Filtered rows by search and status
  const filteredRows = useMemo(() => {
    let result = postmasterRows;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r => r.serverName.toLowerCase().includes(q) || 
             r.domain.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'ok') {
        result = result.filter(r => r.status === 'OK');
      } else if (statusFilter === 'fail') {
        result = result.filter(r => r.status === 'FAIL');
      } else if (statusFilter === 'pending') {
        result = result.filter(r => r.status === 'Pending');
      }
    }

    return result;
  }, [postmasterRows, searchQuery, statusFilter]);

  // Execute checks for all domains
  const handleCheckAllPostmaster = async () => {
    if (postmasterRows.length === 0) return;

    setIsChecking(true);
    setCheckProgress(0);
    setTotalToCheck(postmasterRows.length);

    try {
      const domainsToRequest = postmasterRows.map(r => r.domain);
      const allResults: Record<string, { status: 'OK' | 'FAIL', reason?: string }> = {};

      const batchSize = 10;
      for (let i = 0; i < domainsToRequest.length; i += batchSize) {
        const batch = domainsToRequest.slice(i, i + batchSize);

        const response = await fetch('/api/infrastructure/postmaster-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: batch })
        });
        const data = await response.json();

        if (data.results) {
          Object.assign(allResults, data.results);
        }

        setCheckProgress(prev => Math.min(prev + batch.length, domainsToRequest.length));
      }

      // Merge results into teams array
      const todayStr = new Date().toLocaleDateString('fr-FR');
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
              if (!d.domain) return;
              const lookupResult = allResults[d.domain];
              if (lookupResult) {
                newPostmasterDetails[d.domain] = {
                  status: lookupResult.status,
                  reason: lookupResult.reason || '',
                  date: todayStr
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
      showToast(`✅ Audited all ${domainsToRequest.length} domains successfully!`);
    } catch (err) {
      console.error(err);
      alert('Error occurred running postmaster checks');
    } finally {
      setIsChecking(false);
    }
  };

  // Run check on a single row
  const handleCheckSingleRow = async (row: PostmasterRow) => {
    try {
      const response = await fetch('/api/infrastructure/postmaster-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: [row.domain] })
      });
      const data = await response.json();
      const lookupResult = data.results?.[row.domain];

      if (lookupResult) {
        const todayStr = new Date().toLocaleDateString('fr-FR');
        const updatedTeams = teams.map(t => {
          if (t.name !== activeTeam) return t;

          return {
            ...t,
            servers: (t.servers || []).map((s: any) => {
              if (s.id === row.serverId) {
                return {
                  ...s,
                  postmasterDetails: {
                    ...(s.postmasterDetails || {}),
                    [row.domain]: {
                      status: lookupResult.status,
                      reason: lookupResult.reason || '',
                      date: todayStr
                    }
                  }
                };
              }
              return s;
            })
          };
        });

        await triggerSave(updatedTeams);
        showToast(`✅ Checked postmaster for ${row.domain}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to run check');
    }
  };

  // Copy checks based on status
  const copyPostmasterData = (status: 'OK' | 'FAIL' | 'Pending') => {
    const items = postmasterRows.filter(r => r.status === status);
    
    if (items.length > 0) {
      const header = 'Server\tDomain\tStatus\tDetails\tLast Checked';
      const text = `${header}\n${items.map(i => `${i.serverName}\t${i.domain}\t${i.status}\t${i.reason}\t${i.date}`).join('\n')}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${items.length} Postmaster (${status}) items to clipboard!`);
      });
    } else {
      showToast(`No Postmaster (${status}) items found.`);
    }
  };

  // Copy all unique domains as a JS array
  const copyDomainsForGooglePostmaster = () => {
    const domainList = Array.from(new Set(postmasterRows.map(r => r.domain)));
    if (domainList.length > 0) {
      const arrayString = JSON.stringify(domainList, null, 2);
      navigator.clipboard.writeText(arrayString).then(() => {
        showToast(`📋 Copied ${domainList.length} domains as JS Array to clipboard!`);
      });
    } else {
      showToast('No domains found to copy.');
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

      {/* Search & Actions Panel */}
      <div className="filters-actions-row">
        <div className="search-filters-pane">
          <input
            type="text"
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
            <option value="ok">🟢 OK</option>
            <option value="fail">🔴 FAIL</option>
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
            onClick={() => copyPostmasterData('OK')}
          >
            📋 Copy OK
          </button>
          <button
            className="btn-postmaster-action secondary"
            onClick={() => copyPostmasterData('FAIL')}
            style={{ color: '#fca5a5' }}
          >
            📋 Copy FAIL
          </button>
          <button
            className="btn-postmaster-action primary"
            onClick={handleCheckAllPostmaster}
            disabled={isChecking || postmasterRows.length === 0}
          >
            {isChecking ? 'Checking...' : '⚡ Check All Postmaster'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isChecking && (
        <div className="progress-checking-container animate-fade-in">
          <div className="progress-checking-text">
            <span>Checking postmaster mailboxes...</span>
            <span>{checkProgress} / {totalToCheck} ({Math.round((checkProgress / totalToCheck) * 100)}%)</span>
          </div>
          <div className="progress-checking-bar">
            <div 
              className="progress-checking-fill" 
              style={{ width: `${(checkProgress / totalToCheck) * 100}%` }}
            />
          </div>
        </div>
      )}

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
                <th>Domain</th>
                <th>Status</th>
                <th>Verification Details</th>
                <th>Last Checked</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => (
                <tr key={`${r.serverId}_${r.domain}_${idx}`}>
                  <td className="server-cell">🖥️ {r.serverName}</td>
                  <td className="domain-cell"><code>{r.domain}</code></td>
                  <td>
                    <span className={`badge-postmaster ${r.status.toLowerCase()}`}>
                      {r.status === 'OK' ? '✓ OK' : r.status === 'FAIL' ? '✗ FAIL' : '⏳ Pending'}
                    </span>
                  </td>
                  <td className="details-cell" title={r.reason}>
                    {r.reason}
                  </td>
                  <td className="date-cell">{r.date}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-postmaster-action secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex' }}
                      onClick={() => handleCheckSingleRow(r)}
                      disabled={isChecking}
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast message popup */}
      {toastMessage && (
        <div className="toast-postmaster animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
