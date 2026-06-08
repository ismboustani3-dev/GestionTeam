'use client';

import { useState } from 'react';
import './Inventory.css';

interface InventoryServer {
  id: string;
  dateEntre: string;
  noticeDate: string;
  isNoticeWarning: boolean;
  isNoticeYellow?: boolean;
}

// Mock data based on the screenshot
const initialRedaServers: InventoryServer[] = [
  { id: 's_wm3_2182', dateEntre: '10/03/2026', noticeDate: '03/06/2026', isNoticeWarning: false },
  { id: 's_wm3_2160', dateEntre: '26/02/2026', noticeDate: '17/05/2026', isNoticeWarning: true },
  { id: 's_wm3_2159', dateEntre: '26/02/2026', noticeDate: '19/05/2026', isNoticeWarning: true },
  { id: 's_wm3_2225', dateEntre: '27/04/2026', noticeDate: '01/08/2026', isNoticeWarning: true, isNoticeYellow: true },
  { id: 's_wm3_2218', dateEntre: '08/04/2026', noticeDate: '30/05/2026', isNoticeWarning: true, isNoticeYellow: true },
  { id: 's_wm3_2214', dateEntre: '06/04/2026', noticeDate: '28/05/2026', isNoticeWarning: true },
];

const initialAmineServers: InventoryServer[] = [
  { id: 's_wm3_2156', dateEntre: '24/02/2026', noticeDate: '17/05/2026', isNoticeWarning: true },
  { id: 's_wm3_2158', dateEntre: '26/02/2026', noticeDate: '18/06/2026', isNoticeWarning: false },
  { id: 's_wm3_2162', dateEntre: '27/02/2026', noticeDate: '20/05/2026', isNoticeWarning: true },
  { id: 's_wm3_2169', dateEntre: '02/03/2026', noticeDate: '20/02/2026', isNoticeWarning: true },
  { id: 's_wm3_2183', dateEntre: '10/03/2026', noticeDate: '03/06/2026', isNoticeWarning: false },
  { id: 's_wm3_2184', dateEntre: '10/03/2026', noticeDate: '03/07/2026', isNoticeWarning: false },
];

export default function InventoryPage() {
  const [redaServers, setRedaServers] = useState(initialRedaServers);
  const [amineServers, setAmineServers] = useState(initialAmineServers);

  return (
    <div className="inventory-page animate-fade-in">
      <header className="inventory-header">
        <div className="header-left">
          <span className="header-icon">🔧</span>
          <h1>Bulk Management Tools</h1>
        </div>
        <button className="expand-btn">^</button>
      </header>

      <div className="panels-container">
        {/* TEAM REDA PANEL */}
        <div className="team-panel reda-panel">
          <div className="panel-header">
            <div className="team-title-section">
              <h2>REDA</h2>
              <button className="copy-btn">📋</button>
              <button className="expiring-btn">⚠️ Copy Expiring</button>
            </div>
            <div className="team-stats">
              <div className="stat">
                <span className="stat-label">ACTIVE</span>
                <span className="stat-value active-val">18 Servers</span>
              </div>
              <div className="stat">
                <span className="stat-label">MONTH DEL.</span>
                <span className="stat-value del-val">5</span>
              </div>
            </div>
          </div>
          
          <table className="inventory-table">
            <thead>
              <tr>
                <th>SERVERS</th>
                <th>DateEntre</th>
                <th>Notice Date</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {redaServers.map(server => (
                <tr key={server.id}>
                  <td className="server-id">{server.id}</td>
                  <td className="server-date">{server.dateEntre}</td>
                  <td className="server-notice">
                    <span className={
                      server.isNoticeWarning 
                        ? (server.isNoticeYellow ? 'notice-warning-yellow' : 'notice-warning-red') 
                        : ''
                    }>
                      {server.isNoticeWarning && '⚠️ '}
                      {server.noticeDate}
                    </span>
                  </td>
                  <td className="server-actions">
                    <button className="action-btn edit-btn">Edit</button>
                    <button className="action-btn del-btn">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TEAM AMINE PANEL */}
        <div className="team-panel amine-panel">
          <div className="panel-header">
            <div className="team-title-section">
              <h2>AMINE</h2>
              <button className="copy-btn">📋</button>
              <button className="expiring-btn">⚠️ Copy Expiring</button>
            </div>
            <div className="team-stats">
              <div className="stat">
                <span className="stat-label">ACTIVE</span>
                <span className="stat-value active-val">21 Servers</span>
              </div>
              <div className="stat">
                <span className="stat-label">MONTH DEL.</span>
                <span className="stat-value del-val">1</span>
              </div>
            </div>
          </div>
          
          <table className="inventory-table">
            <thead>
              <tr>
                <th>SERVERS</th>
                <th>DateEntre</th>
                <th>Notice Date</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {amineServers.map(server => (
                <tr key={server.id}>
                  <td className="server-id">{server.id}</td>
                  <td className="server-date">{server.dateEntre}</td>
                  <td className="server-notice">
                    <span className={
                      server.isNoticeWarning 
                        ? (server.isNoticeYellow ? 'notice-warning-yellow' : 'notice-warning-red') 
                        : ''
                    }>
                      {server.isNoticeWarning && '⚠️ '}
                      {server.noticeDate}
                    </span>
                  </td>
                  <td className="server-actions">
                    <button className="action-btn edit-btn">Edit</button>
                    <button className="action-btn del-btn">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
