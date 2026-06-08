'use client';

import React, { useState, useMemo } from 'react';
import './Scanner.css';

interface ScanResult {
  domain: string;
  spf: string;
  mx: string;
  dmarc: string;
  status: 'OK' | 'FAIL' | 'TIMEOUT' | 'ERROR';
  duration: number;
}

export default function DnsScannerPage() {
  const [domainsInput, setDomainsInput] = useState('');
  const [checkSpf, setCheckSpf] = useState(true);
  const [checkMx, setCheckMx] = useState(true);
  const [checkDmarc, setCheckDmarc] = useState(true);
  
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);

  // Parse input domains
  const parsedDomains = useMemo(() => {
    return domainsInput
      .split('\n')
      .map(d => d.trim())
      .filter(Boolean);
  }, [domainsInput]);

  // Success count (status === 'OK')
  const successCount = useMemo(() => {
    return results.filter(r => r.status === 'OK').length;
  }, [results]);

  const handleStartScan = async () => {
    if (parsedDomains.length === 0) return;
    
    setScanning(true);
    setProgress(0);
    setResults([]);
    setScannedCount(0);
    setTotalToScan(parsedDomains.length);

    const chunkSize = 5; // Smaller chunks for real-time progress feel
    const allResults: ScanResult[] = [];

    for (let i = 0; i < parsedDomains.length; i += chunkSize) {
      const chunk = parsedDomains.slice(i, i + chunkSize);
      
      try {
        const response = await fetch('/api/dns-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domains: chunk,
            checkSpf,
            checkMx,
            checkDmarc
          })
        });

        if (!response.ok) {
          throw new Error('API request failed');
        }

        const data = await response.json();
        if (data.results) {
          allResults.push(...data.results);
          setResults([...allResults]);
        }
      } catch (err) {
        console.error('Error scanning chunk:', err);
        // Add error items for the chunk so we don't drop domains
        const fallbackResults = chunk.map(d => ({
          domain: d,
          spf: '—',
          mx: '—',
          dmarc: '—',
          status: 'ERROR' as const,
          duration: 0
        }));
        allResults.push(...fallbackResults);
        setResults([...allResults]);
      }

      const completed = Math.min(i + chunkSize, parsedDomains.length);
      setScannedCount(completed);
      setProgress(Math.round((completed / parsedDomains.length) * 100));
    }

    setScanning(false);
  };

  // Copy results as tab-separated values (TSV)
  const handleCopyResults = () => {
    if (results.length === 0) return;

    const headers = ['Domain', 'SPF Record', 'MX Records', 'DMARC Record', 'Status', 'Duration (ms)'];
    const rows = results.map(r => [
      r.domain,
      r.spf,
      r.mx,
      r.dmarc,
      r.status,
      r.duration
    ]);

    const content = [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    navigator.clipboard.writeText(content);
    alert('Results copied to clipboard!');
  };

  // Download results as CSV
  const handleDownloadCsv = () => {
    if (results.length === 0) return;

    const headers = ['Domain', 'SPF Record', 'MX Records', 'DMARC Record', 'Status', 'Duration (ms)'];
    const rows = results.map(r => [
      r.domain,
      r.spf.replace(/"/g, '""'),
      r.mx.replace(/"/g, '""'),
      r.dmarc.replace(/"/g, '""'),
      r.status,
      r.duration
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dns_scan_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dns-scanner-container animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        padding: '1.25rem 1.75rem',
        borderRadius: '16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="header-icon" style={{
            fontSize: '1.8rem',
            padding: '0.5rem',
            background: 'rgba(56, 189, 248, 0.1)',
            borderRadius: '12px'
          }}>⚡</span>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 0.2rem 0', letterSpacing: '0.5px' }}>
              SPF • MX • DMARC Ultra Fast Bulk Scanner
            </h1>
            <p className="subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Bulk scan domain DNS configurations in parallel at high speeds
            </p>
          </div>
        </div>
      </header>

      <div className="scanner-grid">
        {/* Left Side Inputs */}
        <div className="scanner-sidebar">
          <div className="input-card">
            <h3>🌐 Domains (One per line)</h3>
            <textarea
              className="domains-textarea"
              placeholder="google.com&#10;microsoft.com&#10;yahoo.com"
              value={domainsInput}
              onChange={(e) => setDomainsInput(e.target.value)}
              disabled={scanning}
            />

            <div className="toggle-group">
              <div className="toggle-item">
                <div className="toggle-label">
                  <span className="toggle-icon">🛡️</span>
                  Check SPF Records
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={checkSpf}
                    onChange={(e) => setCheckSpf(e.target.checked)}
                    disabled={scanning}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <div className="toggle-label">
                  <span className="toggle-icon">✉️</span>
                  Check MX Records
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={checkMx}
                    onChange={(e) => setCheckMx(e.target.checked)}
                    disabled={scanning}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <div className="toggle-label">
                  <span className="toggle-icon">🔒</span>
                  Check DMARC Records
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={checkDmarc}
                    onChange={(e) => setCheckDmarc(e.target.checked)}
                    disabled={scanning}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <button
              className="scan-button"
              onClick={handleStartScan}
              disabled={scanning || parsedDomains.length === 0 || (!checkSpf && !checkMx && !checkDmarc)}
            >
              {scanning ? (
                <>
                  <span className="pulse-icon">⏳</span> Scanning...
                </>
              ) : (
                <>
                  Check Records ⚡
                </>
              )}
            </button>
          </div>

          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-num primary-text">{totalToScan || parsedDomains.length}</div>
              <div className="stat-title">Domains</div>
            </div>
            <div className="stat-box">
              <div className="stat-num success-text">{successCount}</div>
              <div className="stat-title">Success</div>
            </div>
          </div>
        </div>

        {/* Right Side Results */}
        <div className="scanner-results">
          {/* Progress Section */}
          {(scanning || progress > 0) && (
            <div className="progress-section">
              <div className="progress-header">
                <span>Scanning Progress ({scannedCount}/{totalToScan} domains)</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          {/* Table Header and Download buttons */}
          <div className="actions-header">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>Scan Queue & Results</h3>
            {results.length > 0 && (
              <div className="actions-buttons">
                <button className="action-btn" onClick={handleCopyResults}>
                  📋 Copy Results
                </button>
                <button className="action-btn" onClick={handleDownloadCsv}>
                  📥 Download CSV
                </button>
              </div>
            )}
          </div>

          {/* Results Table */}
          <div className="results-table-wrapper">
            <table className="results-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Domain</th>
                  {checkSpf && <th style={{ width: '25%' }}>SPF Record</th>}
                  {checkMx && <th style={{ width: '25%' }}>MX Records</th>}
                  {checkDmarc && <th style={{ width: '20%' }}>DMARC Record</th>}
                  <th style={{ width: '10%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, idx) => (
                  <tr key={idx}>
                    <td className="domain-cell">
                      {row.domain}
                      {row.duration > 0 && (
                        <span className="duration-tag">{row.duration}ms</span>
                      )}
                    </td>
                    {checkSpf && (
                      <td className="record-cell" title={row.spf}>{row.spf}</td>
                    )}
                    {checkMx && (
                      <td className="record-cell" title={row.mx}>{row.mx}</td>
                    )}
                    {checkDmarc && (
                      <td className="record-cell" title={row.dmarc}>{row.dmarc}</td>
                    )}
                    <td>
                      <span className={`status-badge ${row.status.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-results">
                      Enter domains on the left and click &quot;Check Records&quot; to begin scanning.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
