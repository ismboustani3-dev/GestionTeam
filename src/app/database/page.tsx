'use client';

import { useState } from 'react';
import './Database.css';

interface Server {
  id: number;
  mainIp: string;
  provider: string;
  asn: string;
  dateEntre: string;    // DD/MM/YYYY
  dateSortie: string;   // DD/MM/YYYY or empty
  nbrIps: number;
  classType: string;
}

// Helper: parse DD/MM/YYYY to Date
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

// Helper: calculate age in days from dateEntre to today
function calculateAge(dateEntre: string): number {
  const entryDate = parseDate(dateEntre);
  if (!entryDate) return 0;
  const today = new Date();
  const diffMs = today.getTime() - entryDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Helper: get age color class
function getAgeClass(days: number): string {
  if (days >= 90) return 'age-old';
  if (days >= 30) return 'age-mid';
  return 'age-new';
}

interface Team {
  name: string;
  servers: Server[];
}

// DATA: Add your real servers here
const teamsData: Team[] = [
  {
    name: 'REDA',
    servers: [
      // Example - replace with real data:
      // { id: 1, mainIp: '192.168.1.1', provider: 'OVH', asn: 'AS16276', dateEntre: '01/03/2026', dateSortie: '', nbrIps: 256, classType: 'C' },
    ],
  },
  {
    name: 'AMINE',
    servers: [
      // Example - replace with real data:
      // { id: 1, mainIp: '10.0.0.1', provider: 'Hetzner', asn: 'AS24940', dateEntre: '15/02/2026', dateSortie: '', nbrIps: 512, classType: 'B' },
    ],
  },
];

export default function DatabasePage() {
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');

  const currentTeam = teamsData.find(t => t.name === activeTeam);
  const filteredServers = currentTeam?.servers.filter(s =>
    s.mainIp.includes(searchTerm)
  ) || [];

  const totalServers = teamsData.reduce((sum, t) => sum + t.servers.length, 0);

  return (
    <div className="database-page animate-fade-in">
      <header className="db-header">
        <div>
          <h1>Database</h1>
          <p className="db-subtitle">Central data hub — Teams &amp; Servers</p>
        </div>
        <div className="db-stats">
          {teamsData.map(team => (
            <div key={team.name} className="db-stat-chip">
              <span className="stat-dot dot-green"></span>
              {team.name}: {team.servers.length} Servers
            </div>
          ))}
          <div className="db-stat-chip">
            <span className="stat-dot dot-blue"></span>
            Total: {totalServers}
          </div>
        </div>
      </header>

      <div className="db-toolbar">
        <div className="db-tabs">
          {teamsData.map(team => (
            <button
              key={team.name}
              className={`db-tab ${activeTeam === team.name ? 'active' : ''}`}
              onClick={() => { setActiveTeam(team.name); setSearchTerm(''); }}
            >
              <span>👥</span>
              <span>{team.name}</span>
              <span className="tab-badge">{team.servers.length}</span>
            </button>
          ))}
        </div>
        <div className="db-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="db-table-container">
        {filteredServers.length > 0 ? (
          <table className="db-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Server / Main IP</th>
                <th>Date Entrée</th>
                <th>Date Sortie</th>
                <th>Age Server</th>
              </tr>
            </thead>
            <tbody>
              {filteredServers.map((s, idx) => {
                const ageDays = calculateAge(s.dateEntre);
                return (
                  <tr key={s.id}>
                    <td className="td-id">{idx + 1}</td>
                    <td className="td-ip">{s.mainIp}</td>
                    <td className="td-date">{s.dateEntre}</td>
                    <td className="td-date">{s.dateSortie || '—'}</td>
                    <td>
                      <span className={`age-badge ${getAgeClass(ageDays)}`}>
                        {ageDays} jours
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="db-empty-state">
            <span className="empty-icon">🗄️</span>
            <h2>No servers yet for {activeTeam}</h2>
            <p>Server data will be added here</p>
          </div>
        )}
      </div>

      <div className="db-footer">
        <span className="db-footer-info">
          Team {activeTeam} — {filteredServers.length} server(s)
        </span>
        <span className="db-footer-info">Auto-calculated ages</span>
      </div>
    </div>
  );
}
