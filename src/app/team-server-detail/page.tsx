'use client';

import React, { useState, useEffect } from 'react';
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
  status?: 'active' | 'deleted';
  ipDomains?: { ip: string, domain: string }[];
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
  // reset time to midnight for accurate day diff
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 3) return 'urgent';
  if (diffDays <= 7) return 'warning';
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
        <div className="detail-search">
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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredServers.length > 0 ? (
              filteredServers.map(s => (
                <React.Fragment key={s.id}>
                  <tr>
                    <td className="fw-600 color-primary">{s.serverName || '—'}</td>
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
                          <span className="status-badge active-status">Active</span>
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
    </div>
  );
}
