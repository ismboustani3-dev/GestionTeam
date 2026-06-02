'use client';

import { useState } from 'react';
import './Database.css';

interface Server {
  id: number;
  mainIp: string;
  provider: string;
  asn: string;
  dateEntre: string;
  dateSortie: string;
  nbrIps: number;
  classType: string;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function calculateAge(dateEntre: string): number {
  const entryDate = parseDate(dateEntre);
  if (!entryDate) return 0;
  const today = new Date();
  const diffMs = today.getTime() - entryDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getAgeClass(days: number): string {
  if (days >= 90) return 'age-old';
  if (days >= 30) return 'age-mid';
  return 'age-new';
}

interface Team {
  name: string;
  servers: Server[];
}

export default function DatabasePage() {
  const [teams, setTeams] = useState<Team[]>([
    { name: 'REDA', servers: [] },
    { name: 'AMINE', servers: [] },
  ]);

  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterField, setFilterField] = useState<'all' | 'ip' | 'provider' | 'asn'>('all');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    mainIp: '',
    provider: '',
    asn: '',
    dateEntre: '',
    dateSortie: '',
    nbrIps: '',
    classType: '',
  });

  const currentTeam = teams.find(t => t.name === activeTeam);

  const filteredServers = currentTeam?.servers.filter(s => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    if (filterField === 'ip') return s.mainIp.toLowerCase().includes(term);
    if (filterField === 'provider') return s.provider.toLowerCase().includes(term);
    if (filterField === 'asn') return s.asn.toLowerCase().includes(term);
    // all
    return (
      s.mainIp.toLowerCase().includes(term) ||
      s.provider.toLowerCase().includes(term) ||
      s.asn.toLowerCase().includes(term)
    );
  }) || [];

  const totalServers = teams.reduce((sum, t) => sum + t.servers.length, 0);

  const handleAddServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.mainIp || !formData.dateEntre) return;

    const newServer: Server = {
      id: Date.now(),
      mainIp: formData.mainIp,
      provider: formData.provider,
      asn: formData.asn,
      dateEntre: formData.dateEntre,
      dateSortie: formData.dateSortie,
      nbrIps: Number(formData.nbrIps) || 0,
      classType: formData.classType,
    };

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: [...t.servers, newServer] }
          : t
      )
    );

    setFormData({ mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
    setShowForm(false);
  };

  const handleDeleteServer = (serverId: number) => {
    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: t.servers.filter(s => s.id !== serverId) }
          : t
      )
    );
  };

  return (
    <div className="database-page animate-fade-in">
      <header className="db-header">
        <div>
          <h1>Database</h1>
          <p className="db-subtitle">Central data hub — Teams &amp; Servers</p>
        </div>
        <div className="db-stats">
          {teams.map(team => (
            <div key={team.name} className="db-stat-chip">
              <span className="stat-dot dot-green"></span>
              {team.name}: {team.servers.length}
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
          {teams.map(team => (
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

        <div className="db-toolbar-right">
          <div className="db-filter">
            <select
              className="filter-select"
              value={filterField}
              onChange={(e) => setFilterField(e.target.value as 'all' | 'ip' | 'provider' | 'asn')}
            >
              <option value="all">All Fields</option>
              <option value="ip">IP</option>
              <option value="provider">Provider</option>
              <option value="asn">ASN</option>
            </select>
          </div>
          <div className="db-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder={`Search ${filterField === 'all' ? 'servers' : filterField}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="add-server-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ Add Server'}
          </button>
        </div>
      </div>

      {/* Add Server Form */}
      {showForm && (
        <form className="add-form animate-fade-in" onSubmit={handleAddServer}>
          <h3>➕ Add Server to {activeTeam}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Main IP *</label>
              <input
                type="text"
                placeholder="192.168.1.1"
                value={formData.mainIp}
                onChange={(e) => setFormData({ ...formData, mainIp: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Provider</label>
              <input
                type="text"
                placeholder="OVH, Hetzner..."
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>ASN</label>
              <input
                type="text"
                placeholder="AS16276"
                value={formData.asn}
                onChange={(e) => setFormData({ ...formData, asn: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Date Entrée * (DD/MM/YYYY)</label>
              <input
                type="text"
                placeholder="01/03/2026"
                value={formData.dateEntre}
                onChange={(e) => setFormData({ ...formData, dateEntre: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Date Sortie (DD/MM/YYYY)</label>
              <input
                type="text"
                placeholder="Leave empty if active"
                value={formData.dateSortie}
                onChange={(e) => setFormData({ ...formData, dateSortie: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Nbr IPs</label>
              <input
                type="number"
                placeholder="256"
                value={formData.nbrIps}
                onChange={(e) => setFormData({ ...formData, nbrIps: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Class</label>
              <input
                type="text"
                placeholder="A, B, C..."
                value={formData.classType}
                onChange={(e) => setFormData({ ...formData, classType: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="submit-btn">✓ Add Server</button>
        </form>
      )}

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
                <th>Actions</th>
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
                    <td>
                      <button className="del-btn" onClick={() => handleDeleteServer(s.id)}>
                        🗑️
                      </button>
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
            <p>Click &quot;+ Add Server&quot; to start adding data</p>
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
