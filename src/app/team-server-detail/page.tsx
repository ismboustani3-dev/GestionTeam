'use client';

import { useState, useEffect } from 'react';
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
}

interface Team {
  name: string;
  servers: Server[];
}

export default function TeamServerDetailPage() {
  const [teams, setTeams] = useState<Team[]>([
    { name: 'REDA', servers: [] },
    { name: 'AMINE', servers: [] },
  ]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');

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
              <th>Provider</th>
              <th>ASN</th>
              <th>Date Entre</th>
              <th>Notice Date</th>
              <th>Nbr IPs</th>
              <th>Class</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredServers.length > 0 ? (
              filteredServers.map(s => (
                <tr key={s.id}>
                  <td className="fw-600 color-primary">{s.serverName || '—'}</td>
                  <td className="font-mono">{s.mainIp}</td>
                  <td>{s.provider || '—'}</td>
                  <td>{s.asn || '—'}</td>
                  <td>{s.dateEntre}</td>
                  <td>{s.dateSortie ? <span className="notice-badge">⚠️ {s.dateSortie}</span> : '—'}</td>
                  <td className="text-center">{s.nbrIps || '—'}</td>
                  <td className="text-center">
                    <span className="class-badge">{s.classType || '—'}</span>
                  </td>
                  <td>
                    <span className="status-badge active-status">Active</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="empty-row">No servers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
