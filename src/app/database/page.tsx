'use client';

import { useState } from 'react';
import './Database.css';

// Data will be added later
const teams: { id: number; name: string; servers: { id: string; dateEntre: string; noticeDate: string; status: string }[] }[] = [];

export default function DatabasePage() {
  return (
    <div className="database-page animate-fade-in">
      <header className="db-header">
        <div>
          <h1>Database</h1>
          <p className="db-subtitle">Central data hub — all information referenced across the application</p>
        </div>
      </header>

      <div className="db-empty-state">
        <span className="empty-icon">🗄️</span>
        <h2>No data yet</h2>
        <p>Data will be added here</p>
      </div>
    </div>
  );
}
