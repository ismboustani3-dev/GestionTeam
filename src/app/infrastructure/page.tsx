'use client';

import React, { useState, useEffect } from 'react';
import './Infrastructure.css';

interface Server {
  id: number;
  serverName: string;
  mainIp: string;
  provider: string;
  asn: string;
  dateEntre: string;
  dateSortie: string;
  nbrIps: number;
  classType: string;
  status?: 'active' | 'deleted';
  ipDomains?: { ip: string, domain: string }[];
  rdnsStatus?: 'OK' | 'FAIL';
  rdnsDate?: string;
  rdnsDetails?: any[];
  vmtaDetails?: Record<string, string>; // mapping from IP to VMTA string
  vmtaDeclared?: Record<string, string>; // mapping from IP to Declared VMTA string
}

interface Team {
  name: string;
  servers: Server[];
}

interface InfraIp {
  ip: string;
  ptr: string;
  vmta: string;
  vmtaDeclared: string;
  status: string;
}

interface InfraServerRow {
  serverId: number;
  serverName: string;
  ips: InfraIp[];
}

export default function InfrastructurePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isAddVmtaModalOpen, setIsAddVmtaModalOpen] = useState(false);
  const [vmtaInput, setVmtaInput] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('gestiq_teams_data');
    if (saved) {
      try {
        setTeams(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }
  }, []);

  // Save to localStorage whenever teams change
  useEffect(() => {
    if (teams.length > 0) {
      localStorage.setItem('gestiq_teams_data', JSON.stringify(teams));
    }
  }, [teams]);

  const handleCheckRdns = async () => {
    setIsAuditing(true);
    try {
      // Gather all active servers for the active team
      const currentTeam = teams.find(t => t.name === activeTeam);
      const activeServers = currentTeam?.servers.filter(s => s.status !== 'deleted') || [];
      
      const response = await fetch('/api/rdns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: activeServers })
      });
      const data = await response.json();
      
      if (data.results) {
        // Update teams state
        setTeams(prev => prev.map(t => ({
          ...t,
          servers: t.servers.map(s => {
            const result = data.results.find((r: any) => r.serverId === s.id);
            if (result) {
              return {
                ...s,
                rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                rdnsDate: new Date().toLocaleString('en-US'),
                rdnsDetails: result.queries
              };
            }
            return s;
          })
        })));

        // Build Telegram notification for failed IPs
        const failedByServer: { serverName: string; failedIps: { ip: string; ptr: string }[] }[] = [];

        data.results.forEach((result: any) => {
          const server = activeServers.find(s => s.id === result.serverId);
          if (!server) return;

          const failedQueries = (result.queries || []).filter(
            (q: any) => q.type === 'PTR' && q.match !== 'OK'
          );

          if (failedQueries.length > 0) {
            failedByServer.push({
              serverName: server.serverName,
              failedIps: failedQueries.map((q: any) => ({
                ip: q.query,
                ptr: q.result || 'No Record'
              }))
            });
          }
        });

        // Send Telegram notification
        if (failedByServer.length > 0) {
          const now = new Date().toLocaleString('en-US');
          let msg = `🔴 <b>RDNS ALERT — Team ${activeTeam}</b>\n`;
          msg += `📅 ${now}\n\n`;

          failedByServer.forEach(entry => {
            msg += `🖥️ <b>${entry.serverName}</b>\n`;
            entry.failedIps.forEach(ip => {
              msg += `   ❌ ${ip.ip} → ${ip.ptr}\n`;
            });
            msg += `\n`;
          });

          msg += `⚠️ Total: ${failedByServer.reduce((sum, e) => sum + e.failedIps.length, 0)} failed IPs across ${failedByServer.length} servers`;

          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg })
            });
          } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
          }
        } else {
          // All OK — send success message
          const now = new Date().toLocaleString('en-US');
          const msg = `✅ <b>RDNS CHECK PASSED — Team ${activeTeam}</b>\n📅 ${now}\n\nAll IPs have valid RDNS records! 🎉`;
          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg })
            });
          } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
          }
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check RDNS');
    }
    setIsAuditing(false);
  };

  const handleCheckAllTeams = async () => {
    setIsAuditing(true);
    try {
      for (const team of teams) {
        const activeServers = team.servers.filter(s => s.status !== 'deleted');
        if (activeServers.length === 0) continue;

        const response = await fetch('/api/rdns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: activeServers })
        });
        const data = await response.json();

        if (data.results) {
          setTeams(prev => prev.map(t => {
            if (t.name !== team.name) return t;
            return {
              ...t,
              servers: t.servers.map(s => {
                const result = data.results.find((r: any) => r.serverId === s.id);
                if (result) {
                  return {
                    ...s,
                    rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                    rdnsDate: new Date().toLocaleString('en-US'),
                    rdnsDetails: result.queries
                  };
                }
                return s;
              })
            };
          }));

          // Build Telegram notification for this team
          const failedByServer: { serverName: string; failedIps: { ip: string; ptr: string }[] }[] = [];
          data.results.forEach((result: any) => {
            const server = activeServers.find(s => s.id === result.serverId);
            if (!server) return;
            const failedQueries = (result.queries || []).filter(
              (q: any) => q.type === 'PTR' && q.match !== 'OK'
            );
            if (failedQueries.length > 0) {
              failedByServer.push({
                serverName: server.serverName,
                failedIps: failedQueries.map((q: any) => ({ ip: q.query, ptr: q.result || 'No Record' }))
              });
            }
          });

          const now = new Date().toLocaleString('en-US');
          let msg = '';
          if (failedByServer.length > 0) {
            msg = `🔴 <b>RDNS ALERT — Team ${team.name}</b>\n📅 ${now}\n\n`;
            failedByServer.forEach(entry => {
              msg += `🖥️ <b>${entry.serverName}</b>\n`;
              entry.failedIps.forEach(ip => {
                msg += `   ❌ ${ip.ip} → ${ip.ptr}\n`;
              });
              msg += `\n`;
            });
            msg += `⚠️ Total: ${failedByServer.reduce((sum, e) => sum + e.failedIps.length, 0)} failed IPs across ${failedByServer.length} servers`;
          } else {
            msg = `✅ <b>RDNS CHECK PASSED — Team ${team.name}</b>\n📅 ${now}\n\nAll IPs have valid RDNS records! 🎉`;
          }

          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg })
            });
          } catch (telegramErr) {
            console.error('Telegram notification failed:', telegramErr);
          }
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check all teams');
    }
    setIsAuditing(false);
  };

  const generateRandomVmta = (domain: string) => {
    // Generate a random 3-5 character string prefix
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let prefix = '';
    const len = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < len; i++) {
      prefix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Extract base domain if possible
    const parts = domain.split('.');
    const base = parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : domain;
    return `${prefix}.${base}`;
  };

  const handleSyncVmta = () => {
    setIsSyncing(true);
    // Simulate API delay
    setTimeout(() => {
      setTeams(prev => prev.map(t => {
        if (t.name !== activeTeam) return t;
        
        return {
          ...t,
          servers: t.servers.map(s => {
            const vmtas: Record<string, string> = {};
            
            if (s.mainIp) {
               const ptrQuery = s.rdnsDetails?.find(d => d.query === s.mainIp && d.type === 'PTR');
               const ptr = ptrQuery?.result && ptrQuery.result !== 'FAIL' ? ptrQuery.result.split(',')[0].trim() : 'unknown.com';
               vmtas[s.mainIp] = generateRandomVmta(ptr);
            }
            if (s.ipDomains) {
              s.ipDomains.forEach(d => {
                 if (d.ip !== s.mainIp) {
                   vmtas[d.ip] = generateRandomVmta(d.domain);
                 }
              });
            }
            
            return {
              ...s,
              vmtaDetails: vmtas
            };
          })
        };
      }));
      setIsSyncing(false);
    }, 1500);
  };

  const handleSaveVmtaDeclared = () => {
    if (!vmtaInput.trim()) return;

    // Parse input: ip;vmta
    const lines = vmtaInput.split('\n');
    const updates = new Map<string, string>();
    lines.forEach(line => {
      const parts = line.split(';');
      if (parts.length >= 2) {
        const ip = parts[0].trim();
        const vmta = parts[1].trim();
        if (ip && vmta) {
          updates.set(ip, vmta);
        }
      }
    });

    if (updates.size > 0) {
      setTeams(prev => prev.map(t => {
        if (t.name !== activeTeam) return t;
        return {
          ...t,
          servers: t.servers.map(s => {
            let changed = false;
            const newVmtaDeclared = { ...(s.vmtaDeclared || {}) };
            
            if (s.mainIp && updates.has(s.mainIp)) {
              newVmtaDeclared[s.mainIp] = updates.get(s.mainIp)!;
              changed = true;
            }
            if (s.ipDomains) {
              s.ipDomains.forEach(d => {
                if (updates.has(d.ip)) {
                  newVmtaDeclared[d.ip] = updates.get(d.ip)!;
                  changed = true;
                }
              });
            }
            
            if (changed) {
              return { ...s, vmtaDeclared: newVmtaDeclared };
            }
            return s;
          })
        };
      }));
    }
    
    setIsAddVmtaModalOpen(false);
    setVmtaInput('');
  };

  // Build the flattened structure for the table
  const rows: InfraServerRow[] = [];
  const currentTeamData = teams.find(t => t.name === activeTeam);
  if (currentTeamData) {
    currentTeamData.servers.filter(s => s.status !== 'deleted').forEach(s => {
      const ipsMap = new Map<string, InfraIp>();
      
      const addIp = (ip: string) => {
        if (!ipsMap.has(ip)) {
          // Find PTR from rdnsDetails
          const ptrQuery = s.rdnsDetails?.find(d => d.query === ip && d.type === 'PTR');
          const ptrStr = ptrQuery ? (ptrQuery.result === 'FAIL' ? 'No Record' : ptrQuery.result) : '—';
          
          let status = 'Pending';
          if (ptrQuery) {
            status = ptrQuery.match === 'OK' ? 'OK' : 'FAIL';
          }
          
          const vmta = s.vmtaDetails && s.vmtaDetails[ip] ? s.vmtaDetails[ip] : '—';
          const vmtaDeclared = s.vmtaDeclared && s.vmtaDeclared[ip] ? s.vmtaDeclared[ip] : '—';

          ipsMap.set(ip, {
            ip,
            ptr: ptrStr,
            vmta,
            vmtaDeclared,
            status
          });
        }
      };

      if (s.mainIp) addIp(s.mainIp);
      if (s.ipDomains) {
        s.ipDomains.forEach(d => addIp(d.ip));
      }

      if (ipsMap.size > 0) {
        rows.push({
          serverId: s.id,
          serverName: s.serverName,
          ips: Array.from(ipsMap.values())
        });
      }
    });
  }

  return (
    <div className="infra-page animate-fade-in">
      <div className="infra-header">
        <div className="infra-title">
          <h1>Infrastructure Check</h1>
          <p>Verify PTR records and Sync VMTA mappings from Gmail.</p>
        </div>
        <div className="infra-actions">
          <button 
            className="btn-blue" 
            onClick={handleCheckRdns}
            disabled={isAuditing}
          >
            {isAuditing ? 'Checking...' : '🛡️ Check RDNS'}
          </button>
          <button 
            className="btn-blue" 
            style={{ background: '#f59e0b' }}
            onClick={handleCheckAllTeams}
            disabled={isAuditing}
          >
            {isAuditing ? 'Checking...' : '⚡ Check All Teams'}
          </button>
          <button 
            className="btn-red" 
            onClick={handleSyncVmta}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : '✉️ Sync VMTA from Gmail'}
          </button>
          <button 
            className="btn-blue" 
            style={{ background: '#8b5cf6' }}
            onClick={() => setIsAddVmtaModalOpen(true)}
          >
            ➕ Add VMTA Declared
          </button>
        </div>
      </div>

      <div className="infra-tabs">
        {teams.map(team => {
          const count = team.servers.filter(s => s.status !== 'deleted').length;
          return (
            <button
              key={team.name}
              className={`infra-tab ${activeTeam === team.name ? 'active' : ''}`}
              onClick={() => setActiveTeam(team.name)}
            >
              <span className="tab-name">👥 {team.name}</span>
              <span className="infra-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="infra-table-container">
        <table className="infra-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>IP Address</th>
              <th>Reverse DNS (PTR)</th>
              <th>VMTA</th>
              <th>VMTA Declared</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <React.Fragment key={row.serverId}>
                  {row.ips.map((ipInfo, idx) => (
                    <tr key={`${row.serverId}-${ipInfo.ip}`}>
                      {idx === 0 && (
                        <td 
                          rowSpan={row.ips.length} 
                          className="server-cell"
                        >
                          {row.serverName || '—'}
                        </td>
                      )}
                      <td className="ip-cell">{ipInfo.ip}</td>
                      <td className="rdns-val">{ipInfo.ptr}</td>
                      <td className="vmta-val">{ipInfo.vmta}</td>
                      <td className="vmta-val" style={{ color: '#a78bfa' }}>{ipInfo.vmtaDeclared}</td>
                      <td style={{ textAlign: 'right' }} className={`status-${ipInfo.status.toLowerCase()}`}>
                        {ipInfo.status}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No active servers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add VMTA Declared Modal */}
      {isAddVmtaModalOpen && (
        <div className="modal-overlay">
          <div className="audit-modal animate-fade-in" style={{ maxWidth: '500px' }}>
            <div className="audit-modal-header">
              <h2>Add VMTA Declared</h2>
              <button className="close-btn" onClick={() => setIsAddVmtaModalOpen(false)}>✕</button>
            </div>
            <div className="audit-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                Paste your declared VMTAs below. <br/>
                Format: <code style={{ color: '#38bdf8' }}>ip;vmta</code> (one per line)
              </p>
              <textarea 
                value={vmtaInput}
                onChange={(e) => setVmtaInput(e.target.value)}
                placeholder="104.206.148.58;obx.fbcw.tw&#10;173.44.157.34;wabunq.feth.pw"
                style={{
                  width: '100%',
                  height: '200px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '1rem',
                  color: '#e2e8f0',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
            </div>
            <div className="audit-modal-footer">
              <button className="btn-blue" style={{ background: '#8b5cf6' }} onClick={handleSaveVmtaDeclared}>
                Save VMTAs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
