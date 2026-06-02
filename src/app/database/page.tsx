'use client';

import { useState } from 'react';
import './Database.css';

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

// Auto-calculate class based on number of IPs
function getClassFromIps(nbrIps: number): string {
  if (nbrIps >= 19 && nbrIps <= 35) return '/27';
  if (nbrIps >= 6 && nbrIps <= 18) return '/28';
  if (nbrIps >= 3 && nbrIps <= 6) return '/29';
  if (nbrIps > 35) return '/26 or less';
  return '—';
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
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    serverName: '',
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

    const nbrIps = Number(formData.nbrIps) || 0;
    const newServer: Server = {
      id: Date.now(),
      serverName: formData.serverName,
      mainIp: formData.mainIp,
      provider: formData.provider,
      asn: formData.asn,
      dateEntre: formData.dateEntre,
      dateSortie: formData.dateSortie,
      nbrIps: nbrIps,
      classType: getClassFromIps(nbrIps),
    };

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: [...t.servers, newServer] }
          : t
      )
    );

    setFormData({ serverName: '', mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
    setShowForm(false);
  };

  // Bulk import handler
  // Format per line: ServerName , MainIP , Provider , ASN , DateEntre , DateSortie , NbrIPs , Class
  const handleBulkImport = () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    const newServers: Server[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2 && parts[1]) {
        const nbrIps = Number(parts[6]) || 0;
        newServers.push({
          id: Date.now() + Math.random(),
          serverName: parts[0] || '',
          mainIp: parts[1] || '',
          provider: parts[2] || '',
          asn: parts[3] || '',
          dateEntre: parts[4] || '',
          dateSortie: parts[5] || '',
          nbrIps: nbrIps,
          classType: getClassFromIps(nbrIps),
        });
      }
    }

    if (newServers.length > 0) {
      setTeams(prev =>
        prev.map(t =>
          t.name === activeTeam
            ? { ...t, servers: [...t.servers, ...newServers] }
            : t
        )
      );
      setBulkText('');
      setShowBulk(false);
    }
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
          <button className="add-server-btn" onClick={() => { setShowForm(!showForm); setShowBulk(false); }}>
            {showForm ? '✕ Cancel' : '+ Add Server'}
          </button>
          <button className="bulk-import-btn" onClick={() => { setShowBulk(!showBulk); setShowForm(false); }}>
            {showBulk ? '✕ Cancel' : '📋 Bulk Import'}
          </button>
        </div>
      </div>

      {/* Bulk Import */}
      {showBulk && (
        <div className="bulk-form animate-fade-in">
          <h3>📋 Bulk Import Servers to {activeTeam}</h3>
          <p className="bulk-hint">Paste one server per line. Format: <code>ServerName , IP , Provider , ASN , DateEntre , DateSortie , NbrIPs , Class</code></p>
          <p className="bulk-example">Example: <code>SRV-01 , 192.168.1.1 , OVH , AS16276 , 01/03/2026 , , 256 , C</code></p>
          <textarea
            className="bulk-textarea"
            rows={10}
            placeholder={'SRV-01 , 192.168.1.1 , OVH , AS16276 , 01/03/2026 , , 256 , C\nSRV-02 , 10.0.0.1 , Hetzner , AS24940 , 15/02/2026 , , 512 , B\nSRV-03 , 172.16.0.1 , AWS , AS16509 , 20/01/2026 , 01/06/2026 , 128 , A'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="bulk-actions">
            <span className="bulk-count">{bulkText.trim().split('\n').filter(l => l.trim()).length} server(s) detected</span>
            <button className="submit-btn" onClick={handleBulkImport}>✓ Import All</button>
          </div>
        </div>
      )}

      {/* Add Server Form */}
      {showForm && (
        <form className="add-form animate-fade-in" onSubmit={handleAddServer}>
          <h3>➕ Add Server to {activeTeam}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Server Name</label>
              <input
                type="text"
                placeholder="SRV-01"
                value={formData.serverName}
                onChange={(e) => setFormData({ ...formData, serverName: e.target.value })}
              />
            </div>
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
                placeholder="6"
                value={formData.nbrIps}
                onChange={(e) => setFormData({ ...formData, nbrIps: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Class (auto)</label>
              <div className="auto-class-display">
                {formData.nbrIps ? getClassFromIps(Number(formData.nbrIps)) : '—'}
              </div>
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
                    <td className="td-ip">{s.serverName ? `${s.serverName} / ${s.mainIp}` : s.mainIp}</td>
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
