'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadTeamsFromFirebase, saveTeamsToFirebase } from '@/lib/firebaseTeams';
import './TeamServerDetail.css';

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
  status?: 'active' | 'deleted' | 'tocancel';
  ipDomains?: { ip: string, domain: string }[];
  rdnsStatus?: 'OK' | 'FAIL';
  rdnsDate?: string;
  rdnsDetails?: any[];
}

interface Team {
  name: string;
  servers: Server[];
}

// Auto-calculate class based on number of IPs
function getClassFromIps(nbrIps: number): string {
  if (nbrIps >= 19 && nbrIps <= 35) return '27';
  if (nbrIps >= 7 && nbrIps <= 18) return '28';
  if (nbrIps >= 3 && nbrIps <= 6) return '29';
  if (nbrIps > 35) return '26 or less';
  return '—';
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  if (parts.length !== 3) return null;
  
  if (dateStr.includes('/')) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  } else {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
}

function getServerAge(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '—';
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Future';
  if (diffDays === 0) return 'Today';
  return `${diffDays} days`;
}

function getNoticeColorClass(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'normal';
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 1 && diffDays <= 3) return 'urgent';
  if (diffDays >= 4 && diffDays <= 7) return 'warning';
  return 'normal';
}

export default function TeamServerDetailPage() {
  const [teams, setTeams] = useState<Team[]>([
    { name: 'REDA', servers: [] },
    { name: 'AMINE', servers: [] },
  ]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditModalData, setAuditModalData] = useState<{serverName: string, details: any[]} | null>(null);

  const handleRunAudit = async () => {
    setIsAuditing(true);
    try {
      const response = await fetch('/api/rdns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: currentTeam?.servers.filter(s => s.status !== 'deleted') || [] })
      });
      const data = await response.json();
      if (data.results) {
        setTeams(prev => prev.map(t => {
          if (t.name === activeTeam) {
            return {
              ...t,
              servers: t.servers.map(s => {
                const result = data.results.find((r: any) => r.serverId === s.id);
                if (result) {
                  return {
                    ...s,
                    rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                    rdnsDate: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    rdnsDetails: result.queries
                  };
                }
                return s;
              })
            };
          }
          return t;
        }));
        // Note: I also need to save this to localStorage, but we'll let the existing useEffect do that.
      }
    } catch (e) {
      console.error(e);
      alert('Failed to run RDNS Audit');
    }
    setIsAuditing(false);
  };

  const [isTeamsLoaded, setIsTeamsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await loadTeamsFromFirebase();
      if (data && data.length > 0) {
        setTeams(data);
      }
      setIsTeamsLoaded(true);
    };
    load();
  }, []);

  useEffect(() => {
    if (isTeamsLoaded) {
      saveTeamsToFirebase(teams);
    }
  }, [teams, isTeamsLoaded]);

  const currentTeam = teams.find(t => t.name === activeTeam);
  
  // Display only active servers
  const activeServers = currentTeam?.servers.filter(s => s.status !== 'deleted') || [];

  const filteredServers = activeServers.filter(s => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      (s.serverName || '').toLowerCase().includes(term) ||
      (s.mainIp || '').toLowerCase().includes(term) ||
      (s.provider || '').toLowerCase().includes(term) ||
      (s.asn || '').toLowerCase().includes(term)
    );
  });

  // Analytics computations
  const totalServers = activeServers.length;
  let totalIps = 0;
  const providerStats: Record<string, number> = {};
  const classStats: Record<string, number> = {};

  activeServers.forEach(s => {
    let count = Number(s.nbrIps) || 0;
    if (s.ipDomains && s.ipDomains.length > 0) {
      const allIps = new Set(s.ipDomains.map(d => d.ip));
      if (s.mainIp) allIps.add(s.mainIp);
      count = allIps.size;
    }
    totalIps += count;

    let p = s.provider ? s.provider.trim() : '';
    if (p) {
      p = p.toUpperCase() === 'OVH' ? 'OVH' : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    } else {
      p = 'Unknown';
    }
    providerStats[p] = (providerStats[p] || 0) + 1;

    // The user wants 'Class 28', 'Class 29', etc.
    const rawClass = getClassFromIps(count);
    const cls = rawClass !== '—' ? `Class ${rawClass}` : 'Unknown';
    classStats[cls] = (classStats[cls] || 0) + 1;
  });

  const providersList = Object.entries(providerStats).sort((a, b) => b[1] - a[1]);
  const classesList = Object.entries(classStats).sort((a, b) => b[1] - a[1]);

  return (
    <div className="team-server-page animate-fade-in">
      <header className="page-header">
        <div className="header-left">
          <span className="header-icon">🖥️</span>
          <div>
            <h1>Team Server Detail</h1>
            <p className="subtitle">Comprehensive overview of all active server configurations</p>
          </div>
        </div>
      </header>

      <div className="detail-toolbar">
        <div className="detail-tabs">
          {teams.map(team => {
            const count = team.servers.filter(s => s.status !== 'deleted').length;
            return (
              <button
                key={team.name}
                className={`detail-tab ${activeTeam === team.name ? 'active' : ''}`}
                onClick={() => { setActiveTeam(team.name); setSearchTerm(''); }}
              >
                <span className="tab-name">👥 {team.name}</span>
                <span className="tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="detail-search" style={{ display: 'flex', gap: '1rem', width: 'auto' }}>
          <button 
            className="rdns-audit-btn" 
            onClick={handleRunAudit}
            disabled={isAuditing}
          >
            {isAuditing ? 'Auditing...' : '🛡️ Run RDNS Audit'}
          </button>
          <div style={{ position: 'relative', width: '300px' }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search Server, IP, Provider..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
      </div>

      <div className="detail-dashboard">
        <div className="dash-card">
          <h4>SERVERS</h4>
          <div className="dash-value cyan">{totalServers}</div>
        </div>
        <div className="dash-card">
          <h4>IP POOL</h4>
          <div className="dash-value cyan">{totalIps}</div>
        </div>
        <div className="dash-card">
          <h4>PROVIDERS</h4>
          <div className="dash-list">
            {providersList.map(([name, count]) => {
              const pct = Math.round((count / totalServers) * 100);
              return (
                <div key={name} className="dash-list-item">
                  <div className="dash-item-header">
                    <span className="dash-name">{name}</span>
                    <span className="dash-count cyan">{count} ({pct}%)</span>
                  </div>
                  <div className="dash-bar-bg">
                    <div className="dash-bar-fill cyan-bg" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="dash-card">
          <h4>CLASSES</h4>
          <div className="dash-list">
            {classesList.map(([name, count]) => {
              const pct = Math.round((count / totalServers) * 100);
              return (
                <div key={name} className="dash-list-item">
                  <div className="dash-item-header">
                    <span className="dash-name">{name}</span>
                    <span className="dash-count purple">{count} Servers ({pct}%)</span>
                  </div>
                  <div className="dash-bar-bg">
                    <div className="dash-bar-fill purple-bg" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="detail-table-container">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Server Name</th>
              <th>Main IP</th>
              <th>Domain</th>
              <th>Provider</th>
              <th>ASN</th>
              <th>Date Entre</th>
              <th>Age</th>
              <th>Notice Date</th>
              <th>Nbr IPs</th>
              <th>Class</th>
              <th>RDNS</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredServers.length > 0 ? (
              filteredServers.map(s => (
                <React.Fragment key={s.id}>
                  <tr style={s.status === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}>
                    <td className="fw-600 color-primary">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: s.status === 'tocancel' ? '#f97316' : undefined, fontWeight: 600 }}>{s.serverName || '—'}</span>
                        {s.status === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                      </div>
                    </td>
                    <td className="font-mono" style={{ position: 'relative' }}>
                      <div style={{ marginBottom: s.ipDomains && s.ipDomains.length > 0 ? '0.2rem' : '0' }}>{s.mainIp}</div>
                      {s.ipDomains && s.ipDomains.length > 0 && (
                        <button 
                          className="more-badge" 
                          onClick={() => setExpandedServerId(expandedServerId === s.id + '-ip' ? null : s.id + '-ip')}
                        >
                          +{s.ipDomains.length} more
                        </button>
                      )}
                      {/* IP Popover */}
                      {s.ipDomains && expandedServerId === s.id + '-ip' && (
                        <div className="custom-popover animate-fade-in">
                          <div className="popover-header">
                            <span className="popover-title">SERVER IPS</span>
                            <button 
                              className="popover-copy-btn"
                              onClick={() => {
                                const ips = s.ipDomains?.map(d => d.ip).join('\n') || '';
                                navigator.clipboard.writeText(ips);
                              }}
                            >Copy All</button>
                          </div>
                          <div className="popover-body">
                            {s.ipDomains.map((ipd, idx) => (
                              <div key={idx} className="popover-row font-mono">
                                {ipd.ip}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ position: 'relative' }}>
                      <div style={{ marginBottom: s.ipDomains && s.ipDomains.length > 0 ? '0.2rem' : '0' }}>
                        {s.ipDomains && s.ipDomains.length > 0 ? s.ipDomains[0].domain : '—'}
                      </div>
                      {s.ipDomains && s.ipDomains.length > 0 && (
                        <button 
                          className="more-badge" 
                          onClick={() => setExpandedServerId(expandedServerId === s.id + '-domain' ? null : s.id + '-domain')}
                        >
                          +{s.ipDomains.length} more
                        </button>
                      )}
                      {/* Domain Popover */}
                      {s.ipDomains && expandedServerId === s.id + '-domain' && (
                        <div className="custom-popover animate-fade-in">
                          <div className="popover-header">
                            <span className="popover-title">SERVER DOMAINS</span>
                            <button 
                              className="popover-copy-btn"
                              onClick={() => {
                                const domains = s.ipDomains?.map(d => d.domain).join('\n') || '';
                                navigator.clipboard.writeText(domains);
                              }}
                            >Copy All</button>
                          </div>
                          <div className="popover-body">
                            {s.ipDomains.map((ipd, idx) => (
                              <div key={idx} className="popover-row">
                                {ipd.domain}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>{s.provider || '—'}</td>
                    <td>{s.asn || '—'}</td>
                    <td>{s.dateEntre}</td>
                    <td style={{ color: '#94a3b8' }}>{getServerAge(s.dateEntre)}</td>
                    <td>{s.dateSortie ? <span className={`notice-badge ${getNoticeColorClass(s.dateSortie)}`}>⚠️ {s.dateSortie}</span> : '—'}</td>
                  {(() => {
                    // Dynamically calculate NBR IPs based on actual mappings + main IP
                    let calculatedNbrIps = Number(s.nbrIps) || 0;
                    if (s.ipDomains && s.ipDomains.length > 0) {
                      const allIps = new Set(s.ipDomains.map(d => d.ip));
                      if (s.mainIp) allIps.add(s.mainIp);
                      calculatedNbrIps = allIps.size;
                    }
                    const calculatedClass = getClassFromIps(calculatedNbrIps);

                    return (
                      <React.Fragment>
                        <td className="text-center">{calculatedNbrIps || '—'}</td>
                        <td className="text-center">
                          <span className="class-badge">{calculatedClass || '—'}</span>
                        </td>
                        <td>
                          {s.rdnsStatus ? (
                            <div className="rdns-cell">
                              <button 
                                className={`rdns-badge ${s.rdnsStatus === 'OK' ? 'rdns-ok' : 'rdns-fail'}`}
                                onClick={() => setAuditModalData({ serverName: s.serverName, details: s.rdnsDetails || [] })}
                              >
                                RDNS {s.rdnsStatus} <span style={{fontSize:'1rem'}}>↗</span>
                              </button>
                              {s.ipDomains && s.ipDomains.length > 0 && <div className="rdns-domain">{s.ipDomains[0].domain}</div>}
                              {s.rdnsDate && <div className="rdns-date">{s.rdnsDate}</div>}
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          {s.status === 'tocancel' ? (
                            <span className="status-badge" style={{ background: 'rgba(249, 115, 22, 0.2)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' }}>To Cancel</span>
                          ) : (
                            <span className="status-badge active-status">Active</span>
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })()}
                </tr>
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="empty-row">No servers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Audit Details Modal */}
      {auditModalData && (
        <div className="modal-overlay">
          <div className="audit-modal animate-fade-in">
            <div className="audit-modal-header">
              <h2>Audit Details: {auditModalData.serverName}</h2>
              <button className="close-btn" onClick={() => setAuditModalData(null)}>✕</button>
            </div>
            <div className="audit-modal-body">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>QUERY</th>
                    <th>TYPE</th>
                    <th>RESULT (DNS ANSWER)</th>
                    <th>MATCH</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Reverse DNS Section */}
                  <tr className="audit-section-row">
                    <td colSpan={4}>REVERSE DNS (IP → PTR)</td>
                  </tr>
                  {auditModalData.details.filter(d => d.type === 'PTR').map((d, idx) => (
                    <tr key={`ptr-${idx}`}>
                      <td>{d.query}</td>
                      <td>{d.type}</td>
                      <td className={d.match === 'OK' ? 'color-success' : 'color-danger'}>{d.result || 'No Record'}</td>
                      <td>{d.match}</td>
                    </tr>
                  ))}
                  
                  {/* Forward DNS Section */}
                  <tr className="audit-section-row">
                    <td colSpan={4}>FORWARD DNS (DOMAIN → A)</td>
                  </tr>
                  {auditModalData.details.filter(d => d.type === 'A').map((d, idx) => (
                    <tr key={`a-${idx}`}>
                      <td>{d.query}</td>
                      <td>{d.type}</td>
                      <td className={d.match === 'OK' ? 'color-success' : 'color-danger'}>{d.result || 'No Record'}</td>
                      <td>{d.match}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="audit-modal-footer">
              <button className="rdns-audit-btn" style={{ padding: '0.5rem 1.5rem' }} onClick={() => {
                 setAuditModalData(null);
                 handleRunAudit();
              }}>
                🔄 Re-Scan Now
              </button>
              <button className="minimal-btn" onClick={() => setAuditModalData(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
