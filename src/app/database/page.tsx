'use client';

import { useState } from 'react';
import './Database.css';

// Central data store - all other pages will reference this
const initialMailers = [
  { id: 1, name: 'Salma EL KARTIT', email: 'salma@gestiq.com', role: 'Senior Mailer', status: 'Active' },
  { id: 2, name: 'Jaafar LAAKEL HEMDANOU', email: 'jaafar@gestiq.com', role: 'Senior Mailer', status: 'Active' },
  { id: 3, name: 'Ayoub GHAILAN', email: 'ayoub@gestiq.com', role: 'Mailer', status: 'Active' },
  { id: 4, name: 'Inssaf EL HAOUASS', email: 'inssaf@gestiq.com', role: 'Mailer', status: 'Active' },
  { id: 5, name: 'Reda', email: 'reda@gestiq.com', role: 'Junior Mailer', status: 'Inactive' },
];

const initialRevenues = [
  { id: 1, mailer: 'Salma EL KARTIT', amount: 3059.00, date: '2026-05-01', type: 'Monthly' },
  { id: 2, mailer: 'Jaafar LAAKEL HEMDANOU', amount: 2662.00, date: '2026-05-01', type: 'Monthly' },
  { id: 3, mailer: 'Ayoub GHAILAN', amount: 2068.50, date: '2026-05-01', type: 'Monthly' },
  { id: 4, mailer: 'Inssaf EL HAOUASS', amount: 1477.00, date: '2026-05-01', type: 'Monthly' },
  { id: 5, mailer: 'Inssaf EL HAOUASS', amount: 450.00, date: '2026-05-29', type: 'Daily' },
];

const initialServers = [
  // Team Reda Servers
  { id: 1, team: 'Reda', name: 's_wmn3_2182', dateEntre: '10/03/2026', noticeDate: '03/06/2026', noticeDateWarning: false },
  { id: 2, team: 'Reda', name: 's_wmn3_2160', dateEntre: '26/02/2026', noticeDate: '17/05/2026', noticeDateWarning: true },
  { id: 3, team: 'Reda', name: 's_wmn3_2159', dateEntre: '26/02/2026', noticeDate: '19/05/2026', noticeDateWarning: true },
  { id: 4, team: 'Reda', name: 's_wmn3_2225', dateEntre: '27/04/2026', noticeDate: '01/08/2026', noticeDateWarning: true },
  
  // Team Khalid Servers
  { id: 5, team: 'Khalid', name: 's_wmn3_2156', dateEntre: '24/02/2026', noticeDate: '17/05/2026', noticeDateWarning: true },
  { id: 6, team: 'Khalid', name: 's_wmn3_2158', dateEntre: '26/02/2026', noticeDate: '18/06/2026', noticeDateWarning: false },
  { id: 7, team: 'Khalid', name: 's_wmn3_2162', dateEntre: '27/02/2026', noticeDate: '20/05/2026', noticeDateWarning: true },
  { id: 8, team: 'Khalid', name: 's_wmn3_2169', dateEntre: '02/03/2026', noticeDate: '20/02/2026', noticeDateWarning: true },
];

const initialDrops = [
  { id: 1, campaign: 'Camp-A1', mailer: 'Salma EL KARTIT', volume: 50000, delivered: 48500, bounced: 1500, date: '2026-05-28' },
  { id: 2, campaign: 'Camp-B2', mailer: 'Jaafar LAAKEL HEMDANOU', volume: 45000, delivered: 43200, bounced: 1800, date: '2026-05-28' },
  { id: 3, campaign: 'Camp-C3', mailer: 'Ayoub GHAILAN', volume: 38000, delivered: 37100, bounced: 900, date: '2026-05-27' },
  { id: 4, campaign: 'Camp-D4', mailer: 'Inssaf EL HAOUASS', volume: 42000, delivered: 40800, bounced: 1200, date: '2026-05-27' },
];

type TabKey = 'mailers' | 'revenues' | 'servers' | 'drops';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(val).replace('.', ',');
}

export default function DatabasePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('mailers');
  const [searchTerm, setSearchTerm] = useState('');

  const tabs: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: 'mailers', label: 'Mailers', icon: '👥', count: initialMailers.length },
    { key: 'revenues', label: 'Revenues', icon: '💰', count: initialRevenues.length },
    { key: 'servers', label: 'Servers', icon: '🖥️', count: initialServers.length },
    { key: 'drops', label: 'Drops', icon: '📧', count: initialDrops.length },
  ];

  const filteredMailers = initialMailers.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRevenues = initialRevenues.filter(r =>
    r.mailer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredServers = initialServers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.ip.includes(searchTerm)
  );

  const filteredDrops = initialDrops.filter(d =>
    d.campaign.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.mailer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="database-page animate-fade-in">
      <header className="db-header">
        <div>
          <h1>Database</h1>
          <p className="db-subtitle">Central data hub — all information referenced across the application</p>
        </div>
        <div className="db-stats">
          <div className="db-stat-chip">
            <span className="stat-dot dot-green"></span>
            {initialMailers.filter(m => m.status === 'Active').length} Active Mailers
          </div>
          <div className="db-stat-chip">
            <span className="stat-dot dot-blue"></span>
            {initialServers.filter(s => s.status === 'Online').length} Servers Online
          </div>
          <div className="db-stat-chip">
            <span className="stat-dot dot-yellow"></span>
            {initialRevenues.length} Transactions
          </div>
        </div>
      </header>

      <div className="db-toolbar">
        <div className="db-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`db-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className="tab-badge">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="db-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="db-table-container">
        {activeTab === 'mailers' && (
          <table className="db-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMailers.map(m => (
                <tr key={m.id}>
                  <td className="td-id">#{m.id}</td>
                  <td className="td-name">{m.name}</td>
                  <td className="td-email">{m.email}</td>
                  <td><span className="role-badge">{m.role}</span></td>
                  <td>
                    <span className={`status-badge status-${m.status.toLowerCase()}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'revenues' && (
          <table className="db-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mailer</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredRevenues.map(r => (
                <tr key={r.id}>
                  <td className="td-id">#{r.id}</td>
                  <td className="td-name">{r.mailer}</td>
                  <td className="td-amount">{formatCurrency(r.amount)}</td>
                  <td>{r.date}</td>
                  <td><span className={`type-badge type-${r.type.toLowerCase()}`}>{r.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'servers' && (
          <div className="servers-dashboard">
            {/* REDA Panel */}
            <div className="team-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <h3>REDA</h3>
                  <button className="copy-btn"><span className="icon">📄</span> <span className="warning-text">Copy Expiring</span></button>
                </div>
                <div className="panel-stats">
                  <div className="stat-group">
                    <span className="stat-label">ACTIVE</span>
                    <span className="stat-value text-green">18 Servers</span>
                  </div>
                  <div className="stat-group text-right">
                    <span className="stat-label">MONTH DEL.</span>
                    <span className="stat-value text-red">5</span>
                  </div>
                </div>
              </div>
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>SERVERS</th>
                    <th>DateEntre</th>
                    <th>Notice Date</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.filter(s => s.team === 'Reda').map(s => (
                    <tr key={s.id}>
                      <td className="font-mono">{s.name}</td>
                      <td>{s.dateEntre}</td>
                      <td className={s.noticeDateWarning ? 'text-red' : ''}>
                        {s.noticeDateWarning && <span className="warning-icon">⚠️</span>}
                        {s.noticeDate}
                      </td>
                      <td className="text-right">
                        <button className="action-btn btn-edit">Edit</button>
                        <button className="action-btn btn-del">Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* KHALID Panel */}
            <div className="team-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <h3>KHALID</h3>
                  <button className="copy-btn"><span className="icon">📄</span> <span className="warning-text">Copy Expiring</span></button>
                </div>
                <div className="panel-stats">
                  <div className="stat-group">
                    <span className="stat-label">ACTIVE</span>
                    <span className="stat-value text-green">21 Servers</span>
                  </div>
                  <div className="stat-group text-right">
                    <span className="stat-label">MONTH DEL.</span>
                    <span className="stat-value text-red">1</span>
                  </div>
                </div>
              </div>
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>SERVERS</th>
                    <th>DateEntre</th>
                    <th>Notice Date</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.filter(s => s.team === 'Khalid').map(s => (
                    <tr key={s.id}>
                      <td className="font-mono">{s.name}</td>
                      <td>{s.dateEntre}</td>
                      <td className={s.noticeDateWarning ? 'text-red' : ''}>
                        {s.noticeDateWarning && <span className="warning-icon">⚠️</span>}
                        {s.noticeDate}
                      </td>
                      <td className="text-right">
                        <button className="action-btn btn-edit">Edit</button>
                        <button className="action-btn btn-del">Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'drops' && (
          <table className="db-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Campaign</th>
                <th>Mailer</th>
                <th>Volume</th>
                <th>Delivered</th>
                <th>Bounced</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrops.map(d => (
                <tr key={d.id}>
                  <td className="td-id">#{d.id}</td>
                  <td className="td-name">{d.campaign}</td>
                  <td>{d.mailer}</td>
                  <td>{d.volume.toLocaleString()}</td>
                  <td className="td-success">{d.delivered.toLocaleString()}</td>
                  <td className="td-danger">{d.bounced.toLocaleString()}</td>
                  <td>{d.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="db-footer">
        <span className="db-footer-info">
          Showing {
            activeTab === 'mailers' ? filteredMailers.length :
            activeTab === 'revenues' ? filteredRevenues.length :
            activeTab === 'servers' ? filteredServers.length :
            filteredDrops.length
          } records
        </span>
        <span className="db-footer-info">Last synced: just now</span>
      </div>
    </div>
  );
}
