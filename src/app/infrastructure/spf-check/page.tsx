'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, saveTeamsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './SpfCheck.css';

interface SpfRow {
  serverId: number;
  serverName: string;
  serverStatus?: string;
  ip: string;
  domain: string;
  status: 'OK' | 'FAIL' | 'Pending';
  record: string;
  reason: string;
  date: string;
}

export default function SpfCheckPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail' | 'pending'>('all');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [totalToCheck, setTotalToCheck] = useState(0);

  // Schedule state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleTime1, setNewScheduleTime1] = useState('08:00');
  const [newScheduleTime2, setNewScheduleTime2] = useState('');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<'time' | '1h' | '2h' | '6h' | '12h'>('time');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1,2,3,4,5,6,0]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Load schedules
  const loadSchedules = () => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        if (data.schedules) setSchedules(data.schedules);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleAddSchedule = async () => {
    if (newScheduleFrequency === 'time' && !newScheduleTime1) return;
    if (newScheduleDays.length === 0) {
      alert('Please select at least one day.');
      return;
    }

    const dayStr = newScheduleDays.length === 7 ? '*' : newScheduleDays.join(',');
    
    if (newScheduleFrequency !== 'time') {
      let interval = 1;
      if (newScheduleFrequency === '2h') interval = 2;
      if (newScheduleFrequency === '6h') interval = 6;
      if (newScheduleFrequency === '12h') interval = 12;
      
      const cronExpr = interval === 1 ? `0 * * * ${dayStr}` : `0 */${interval} * * ${dayStr}`;
      const name = newScheduleName || `Auto SPF Check (Every ${interval}h)`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name,
          type: 'spf',
          cronExpression: cronExpr,
          teamName: newScheduleTeam
        })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Auto SPF Check ${newScheduleTime1}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (1)`, type: 'spf', cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const res2 = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (2)`, type: 'spf', cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const data = await res2.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: 'spf', cronExpression: cronExpr, teamName: newScheduleTeam })
        });
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
      }
    }

    setNewScheduleName('');
    setNewScheduleTime1('08:00');
    setNewScheduleTime2('');
    setNewScheduleTeam('all');
    setNewScheduleFrequency('time');
    setNewScheduleDays([1,2,3,4,5,6,0]);
    showToast('Schedule added successfully!');
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id, enabled })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
    showToast(`Schedule ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleDeleteSchedule = async (id: string) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
    showToast('Schedule deleted successfully');
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
          // Fallback teams
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
    // Sync to backend for cron jobs as well
    fetch('/api/cron-check', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams: updatedTeams })
    }).catch(() => {});
  };

  // Switch team context
  const handleTeamChange = (name: string) => {
    setActiveTeam(name);
  };

  // Build rows from active servers for selected team
  const spfRows = useMemo(() => {
    const activeTeamObj = teams.find(t => t.name === activeTeam);
    const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    
    const rows: SpfRow[] = [];
    
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      
      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => {
          if (!d.ip || !d.domain) return;
          const saved = server.spfDetails?.[d.ip];
          rows.push({
            serverId: server.id,
            serverName: server.serverName,
            serverStatus: server.status,
            ip: d.ip,
            domain: d.domain,
            status: saved?.status || 'Pending',
            record: saved?.record || '—',
            reason: saved?.reason || '',
            date: saved?.date || '—'
          });
        });
      } else if (server.mainIp) {
        // Fallback to mainIp if no ipDomains mappings exist
        const saved = server.spfDetails?.[server.mainIp];
        rows.push({
          serverId: server.id,
          serverName: server.serverName,
          serverStatus: server.status,
          ip: server.mainIp,
          domain: 'No Domain Mapped',
          status: saved?.status || 'Pending',
          record: saved?.record || '—',
          reason: saved?.reason || '',
          date: saved?.date || '—'
        });
      }
    });

    return rows;
  }, [teams, activeTeam]);

  // Filtered rows by search and status
  const filteredRows = useMemo(() => {
    let result = spfRows;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r => r.serverName.toLowerCase().includes(q) || 
             r.ip.toLowerCase().includes(q) || 
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
  }, [spfRows, searchQuery, statusFilter]);

  // Execute SPF checks in parallel batches
  const handleCheckAllSpf = async () => {
    if (spfRows.length === 0) return;

    setIsChecking(true);
    setCheckProgress(0);
    setTotalToCheck(spfRows.length);

    try {
      const itemsToRequest = spfRows.map(r => ({ domain: r.domain, ip: r.ip }));
      const allResults: Record<string, { status: 'OK' | 'FAIL', record: string, reason?: string }> = {};

      const batchSize = 15;
      for (let i = 0; i < itemsToRequest.length; i += batchSize) {
        const batch = itemsToRequest.slice(i, i + batchSize);

        const response = await fetch('/api/infrastructure/spf-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch })
        });
        const data = await response.json();

        if (data.results) {
          Object.assign(allResults, data.results);
        }

        setCheckProgress(prev => Math.min(prev + batch.length, itemsToRequest.length));
      }

      // Merge results into teams array
      const todayStr = new Date().toLocaleDateString('fr-FR');
      const updatedTeams = teams.map(t => {
        if (t.name !== activeTeam) return t;
        return {
          ...t,
          servers: t.servers.map((s: any) => {
            if (s.status === 'deleted') return s;

            const newSpfDetails = { ...(s.spfDetails || {}) };
            let hasUpdates = false;

            const serverIps: string[] = [];
            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            if (uniqueDomains.length > 0) uniqueDomains.forEach((d: any) => serverIps.push(d.ip));
            else if (s.mainIp) serverIps.push(s.mainIp);

            serverIps.forEach(ip => {
              // Find matching mapped domain
              const matchingDomain = uniqueDomains.find((d: any) => d.ip === ip)?.domain || 'No Domain Mapped';
              const resultKey = `${matchingDomain}_${ip}`;
              const lookupResult = allResults[resultKey];

              if (lookupResult) {
                newSpfDetails[ip] = {
                  status: lookupResult.status,
                  record: lookupResult.record,
                  reason: lookupResult.reason || '',
                  date: todayStr
                };
                hasUpdates = true;
              }
            });

            if (hasUpdates) {
              return { ...s, spfDetails: newSpfDetails };
            }
            return s;
          })
        };
      });

      await triggerSave(updatedTeams);

      // Send telegram alert for failures
      const failedItems = spfRows.filter(r => {
        const matchingDomain = r.domain;
        const lookup = allResults[`${matchingDomain}_${r.ip}`];
        return lookup && lookup.status === 'FAIL';
      });

      let telegramMessage = '';
      const nowStr = new Date().toLocaleString('en-US');

      if (failedItems.length > 0) {
        telegramMessage = `🔍 <b>SPF check Failures — Team ${activeTeam}</b>\nStatus: ⚠️ ISSUES DETECTED\n📅 ${nowStr}\n\n`;
        failedItems.forEach(f => {
          const matchingDomain = f.domain;
          const lookup = allResults[`${matchingDomain}_${f.ip}`];
          telegramMessage += `• <b>${f.serverName}</b>\n  IP: ${f.ip}\n  Domain: <code>${f.domain}</code>\n  Reason: <i>${lookup?.reason || 'Failed'}</i>\n\n`;
        });
      } else {
        telegramMessage = `✅ <b>SPF check PASSED — Team ${activeTeam}</b>\n📅 ${nowStr}\n\nAll domains SPF check successfully validated! 🎉`;
      }

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: telegramMessage,
          chatId: '-1003727951074',
          threadId: 7
        })
      }).catch(err => console.error('Failed to send Telegram notice:', err));

      alert('SPF checking completed and results saved!');
    } catch (err) {
      console.error(err);
      alert('Error occurred running SPF check');
    } finally {
      setIsChecking(false);
    }
  };

  // Execute SPF checks for ALL teams at the same time
  const handleCheckAllTeamsSpf = async () => {
    const allServersRows: SpfRow[] = [];
    teams.forEach(t => {
      const dbServers = t.servers?.filter((s: any) => s.status !== 'deleted') || [];
      dbServers.forEach((server: any) => {
        const ipDomains = getUniqueIpDomains(server.ipDomains);
        if (ipDomains.length > 0) {
          ipDomains.forEach((d: any) => {
            if (!d.ip || !d.domain) return;
            const saved = server.spfDetails?.[d.ip];
            allServersRows.push({
              serverId: server.id,
              serverName: server.serverName,
              ip: d.ip,
              domain: d.domain,
              status: saved?.status || 'Pending',
              record: saved?.record || '—',
              reason: saved?.reason || '',
              date: saved?.date || '—'
            });
          });
        } else if (server.mainIp) {
          const saved = server.spfDetails?.[server.mainIp];
          allServersRows.push({
            serverId: server.id,
            serverName: server.serverName,
            ip: server.mainIp,
            domain: 'No Domain Mapped',
            status: saved?.status || 'Pending',
            record: saved?.record || '—',
            reason: saved?.reason || '',
            date: saved?.date || '—'
          });
        }
      });
    });

    if (allServersRows.length === 0) return;

    setIsChecking(true);
    setCheckProgress(0);
    setTotalToCheck(allServersRows.length);

    try {
      const itemsToRequest = allServersRows.map(r => ({ domain: r.domain, ip: r.ip }));
      const allResults: Record<string, { status: 'OK' | 'FAIL', record: string, reason?: string }> = {};

      const batchSize = 15;
      for (let i = 0; i < itemsToRequest.length; i += batchSize) {
        const batch = itemsToRequest.slice(i, i + batchSize);

        const response = await fetch('/api/infrastructure/spf-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch })
        });
        const data = await response.json();

        if (data.results) {
          Object.assign(allResults, data.results);
        }

        setCheckProgress(prev => Math.min(prev + batch.length, itemsToRequest.length));
      }

      // Merge results into teams array
      const todayStr = new Date().toLocaleDateString('fr-FR');
      const updatedTeams = teams.map(t => {
        return {
          ...t,
          servers: t.servers.map((s: any) => {
            if (s.status === 'deleted') return s;

            const newSpfDetails = { ...(s.spfDetails || {}) };
            let hasUpdates = false;

            const serverIps: string[] = [];
            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            if (uniqueDomains.length > 0) uniqueDomains.forEach((d: any) => serverIps.push(d.ip));
            else if (s.mainIp) serverIps.push(s.mainIp);

            serverIps.forEach(ip => {
              const matchingDomain = uniqueDomains.find((d: any) => d.ip === ip)?.domain || 'No Domain Mapped';
              const resultKey = `${matchingDomain}_${ip}`;
              const lookupResult = allResults[resultKey];

              if (lookupResult) {
                newSpfDetails[ip] = {
                  status: lookupResult.status,
                  record: lookupResult.record,
                  reason: lookupResult.reason || '',
                  date: todayStr
                };
                hasUpdates = true;
              }
            });

            if (hasUpdates) {
              return { ...s, spfDetails: newSpfDetails };
            }
            return s;
          })
        };
      });

      await triggerSave(updatedTeams);

      // Group failures by team for Telegram report
      const failedByTeam: Record<string, any[]> = {};
      
      allServersRows.forEach(r => {
        const matchingDomain = r.domain;
        const lookup = allResults[`${matchingDomain}_${r.ip}`];
        if (lookup && lookup.status === 'FAIL') {
          let teamName = 'REDA';
          for (const t of teams) {
            const hasServer = t.servers?.some((s: any) => s.id === r.serverId);
            if (hasServer) {
              teamName = t.name;
              break;
            }
          }
          if (!failedByTeam[teamName]) failedByTeam[teamName] = [];
          failedByTeam[teamName].push({
            serverName: r.serverName,
            ip: r.ip,
            domain: r.domain,
            reason: lookup.reason || 'Failed'
          });
        }
      });

      const nowStr = new Date().toLocaleString('en-US');
      let telegramMessage = `🔍 <b>SPF AUDIT — ALL TEAMS</b>\n📅 ${nowStr}\n${'─'.repeat(25)}\n\n`;

      const totalFailures = Object.values(failedByTeam).reduce((sum, items) => sum + items.length, 0);

      if (totalFailures > 0) {
        Object.entries(failedByTeam).forEach(([team, items]) => {
          telegramMessage += `🏢 <b>Team ${team}</b>\n`;
          items.forEach(f => {
            telegramMessage += `• <b>${f.serverName}</b>\n  IP: ${f.ip}\n  Domain: <code>${f.domain}</code>\n  Reason: <i>${f.reason}</i>\n\n`;
          });
        });
      } else {
        telegramMessage += `✅ All domains SPF checks successfully validated for all teams! 🎉`;
      }

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: telegramMessage,
          chatId: '-1003727951074',
          threadId: 7
        })
      }).catch(err => console.error('Failed to send Telegram notice:', err));

      alert('SPF checking completed for all teams and results saved!');
    } catch (err) {
      console.error(err);
      alert('Error occurred running SPF check for all teams');
    } finally {
      setIsChecking(false);
    }
  };

  // Helper count for tabs
  const getTeamServerCount = (teamName: string) => {
    const t = teams.find(team => team.name === teamName);
    return t?.servers?.filter((s: any) => s.status !== 'deleted').length || 0;
  };

  // Copy filtered results as TSV to clipboard
  const handleCopyFilteredResults = () => {
    if (filteredRows.length === 0) return;
    const header = ['Server Name', 'IP Address', 'Domain Name', 'SPF Record', 'Status', 'Reason', 'Last Checked'].join('\t');
    const rows = filteredRows.map(r => [
      r.serverName,
      r.ip,
      r.domain,
      r.record,
      r.status,
      r.reason || '—',
      r.date
    ].join('\t')).join('\n');
    
    const tsvText = `${header}\n${rows}`;
    navigator.clipboard.writeText(tsvText).then(() => {
      alert(`Copied ${filteredRows.length} filtered results to clipboard!`);
    }).catch(err => {
      console.error('Failed to copy text:', err);
      alert('Failed to copy to clipboard.');
    });
  };

  return (
    <div className="spf-check-container animate-fade-in">
      {/* Header */}
      <header className="spf-check-header">
        <div>
          <h1>🔍 Infrastructure SPF Check</h1>
          <p>Verify that your servers IPs are authorized in their PTR domains SPF records.</p>
        </div>
        <div className="actions-pane">
          <Link href="/infrastructure" className="btn-spf-action secondary">
            ⬅️ Back
          </Link>
          <button 
            className="btn-spf-action primary" 
            onClick={handleCheckAllSpf}
            disabled={isChecking || spfRows.length === 0}
          >
            {isChecking ? 'Checking...' : '⚡ Run SPF Check'}
          </button>
          <button 
            className="btn-spf-action primary" 
            style={{ background: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
            onClick={handleCheckAllTeamsSpf}
            disabled={isChecking || teams.length === 0}
          >
            {isChecking ? 'Checking...' : '⚡ Check All Teams'}
          </button>
          <button 
            className="btn-spf-action primary" 
            style={{ background: isScheduleOpen ? '#059669' : '#10b981', borderColor: isScheduleOpen ? '#047857' : '#059669' }}
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
          >
            {isScheduleOpen ? '✕ Close Schedule' : '⏰ Auto Schedule'}
          </button>
        </div>
      </header>

      {/* Inline Schedule Panel */}
      {isScheduleOpen && (
        <div className="animate-fade-in" style={{
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '1.2rem',
          marginBottom: '1.5rem',
        }}>
          <div className="schedules-grid">
            {/* New Schedule Form */}
            <div className="new-schedule-card">
              <p className="schedule-title">➕ New SPF Schedule</p>
              <div className="schedule-inputs">
                <input
                  type="text"
                  placeholder="Schedule Name"
                  value={newScheduleName}
                  onChange={e => setNewScheduleName(e.target.value)}
                />
                <select
                  value={newScheduleTeam}
                  onChange={e => setNewScheduleTeam(e.target.value)}
                >
                  <option value="all">All Teams</option>
                  {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <select
                  value={newScheduleFrequency}
                  onChange={e => setNewScheduleFrequency(e.target.value as any)}
                >
                  <option value="time">Specific Times</option>
                  <option value="1h">Every 1 Hour</option>
                  <option value="2h">Every 2 Hours</option>
                  <option value="6h">Every 6 Hours</option>
                  <option value="12h">Every 12 Hours</option>
                </select>
                {newScheduleFrequency === 'time' && (
                  <input 
                    type="time"
                    value={newScheduleTime1}
                    onChange={e => setNewScheduleTime1(e.target.value)}
                  />
                )}
                {newScheduleFrequency === 'time' && (
                  <input 
                    type="time"
                    value={newScheduleTime2}
                    onChange={e => setNewScheduleTime2(e.target.value)}
                    placeholder="Time 2 (Optional)"
                  />
                )}
                
                <div className="schedule-days-row">
                  {[{l:'M',v:1}, {l:'T',v:2}, {l:'W',v:3}, {l:'T',v:4}, {l:'F',v:5}, {l:'S',v:6}, {l:'S',v:0}].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`day-btn ${newScheduleDays.includes(day.v) ? 'active' : ''}`}
                      onClick={() => {
                        if (newScheduleDays.includes(day.v)) {
                          setNewScheduleDays(newScheduleDays.filter(d => d !== day.v));
                        } else {
                          setNewScheduleDays([...newScheduleDays, day.v].sort());
                        }
                      }}
                    >
                      {day.l}
                    </button>
                  ))}
                </div>

                <button 
                  className="btn-spf-action primary" 
                  style={{ background: '#10b981', padding: '0.7rem', gridColumn: '1 / -1', fontSize: '1.05rem', fontWeight: 600, border: 'none', justifyContent: 'center' }}
                  onClick={handleAddSchedule}
                >
                  Save Schedule
                </button>
              </div>
            </div>

            {/* Existing Schedules */}
            <div className="active-schedules-list">
              <p className="schedule-title" style={{ color: '#10b981' }}>📋 Active SPF Schedules</p>
              {schedules.filter(s => s.type === 'spf').length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No SPF schedules configured yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {schedules.filter(s => s.type === 'spf').map(s => (
                    <div key={s.id} className={`schedule-item-row ${s.enabled ? 'enabled' : ''}`}>
                      <button
                        className={`toggle-switch-btn ${s.enabled ? 'active' : ''}`}
                        onClick={() => handleToggleSchedule(s.id, !s.enabled)}
                      >
                        <span className="toggle-switch-dot" />
                      </button>
                      <div className="schedule-info-pane">
                        <div className="schedule-info-name">{s.name}</div>
                        <div className="schedule-info-details">
                          {s.cronExpression} • Team: {s.teamName || 'all'}
                          {s.lastRun && ` • Last: ${new Date(s.lastRun).toLocaleString()}`}
                        </div>
                      </div>
                      <button
                        className="btn-delete-schedule"
                        onClick={() => handleDeleteSchedule(s.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="spf-tabs">
        {teams.map(t => (
          <button
            key={t.name}
            className={`spf-tab ${activeTeam === t.name ? 'active' : ''}`}
            onClick={() => handleTeamChange(t.name)}
          >
            👥 {t.name}
            <span className="tab-count-badge">{getTeamServerCount(t.name)}</span>
          </button>
        ))}
      </div>

      {/* Progress Checking Panel */}
      {isChecking && (
        <div className="progress-checking-container">
          <div className="progress-checking-text">
            <span>DNS RESOLVING SPF RECORDS IN PROGRESS...</span>
            <span>{checkProgress} / {totalToCheck}</span>
          </div>
          <div className="progress-checking-bar">
            <div 
              className="progress-checking-fill" 
              style={{ width: `${(checkProgress / (totalToCheck || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Filters Pane */}
      <div className="filters-actions-row">
        <div className="search-filters-pane">
          <input
            type="text"
            className="search"
            placeholder="Search by server, IP, or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="filter-select-spf"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
          >
            <option value="all">🔍 All Statuses</option>
            <option value="ok">✅ OK</option>
            <option value="fail">❌ FAIL / NOT OK</option>
            <option value="pending">⏳ Pending</option>
          </select>
          <button
            className="btn-spf-action secondary"
            onClick={handleCopyFilteredResults}
            disabled={filteredRows.length === 0}
            style={{ padding: '0.45rem 0.8rem', height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            📋 Copy Results ({filteredRows.length})
          </button>
        </div>
        
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
          Showing {filteredRows.length} domain mappings
        </div>
      </div>

      {/* SPF Results table */}
      <div className="spf-table-container">
        {!isLoaded ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading teams server inventory...
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No servers or domain mappings found matching your criteria.
          </div>
        ) : (
          <table className="spf-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Server Name</th>
                <th style={{ width: '160px' }}>IP Address</th>
                <th style={{ width: '220px' }}>Domain Name</th>
                <th>SPF Record</th>
                <th style={{ width: '130px' }}>Last Checked</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, index) => {
                const isFirstForServer = index === 0 || filteredRows[index - 1].serverId !== r.serverId;
                const isLastForServer = index === filteredRows.length - 1 || filteredRows[index + 1].serverId !== r.serverId;
                let rowSpan = 1;
                if (isFirstForServer) {
                  let nextIdx = index + 1;
                  while (nextIdx < filteredRows.length && filteredRows[nextIdx].serverId === r.serverId) {
                    rowSpan++;
                    nextIdx++;
                  }
                }

                return (
                  <tr 
                    key={`${r.serverId}-${r.ip}-${index}`}
                    className={isLastForServer ? 'server-group-end' : 'server-group-inner'}
                    style={r.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}
                  >
                    {/* Server name */}
                    {isFirstForServer && (
                      <td className="server-cell" rowSpan={rowSpan}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: r.serverStatus === 'tocancel' ? '#f97316' : undefined, fontWeight: 600 }}>{r.serverName}</span>
                          {r.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                        </div>
                      </td>
                    )}

                    {/* IP Address */}
                    <td className="ip-cell">{r.ip}</td>

                    {/* Domain Name */}
                    <td className="domain-cell">{r.domain}</td>

                    {/* SPF Record resolved */}
                    <td className="spf-record-cell" title={r.record}>
                      {r.record}
                    </td>

                    {/* Date check */}
                    <td className="date-cell">{r.date}</td>

                    {/* Status Badge */}
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge-spf ${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                      {r.status === 'FAIL' && r.reason && (
                        <span className="fail-reason">{r.reason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Floating Status Toast */}
      {toastMessage && <div className="toast-spf">{toastMessage}</div>}
    </div>
  );
}
