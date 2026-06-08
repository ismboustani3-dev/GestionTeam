'use client';

import React, { useState } from 'react';
import './Generator.css';

export default function DnsGeneratorPage() {
  // SPF inputs
  const [spfDomains, setSpfDomains] = useState('');
  const [spfSubdomains, setSpfSubdomains] = useState('');
  const [spfIps, setSpfIps] = useState('');

  // MX inputs
  const [mxDomains, setMxDomains] = useState('');
  const [mxSubdomains, setMxSubdomains] = useState('');
  const [mxIps, setMxIps] = useState('');

  // A inputs
  const [aDomains, setADomains] = useState('');
  const [aSubdomains, setASubdomains] = useState('');
  const [aIps, setAIps] = useState('');

  // Output
  const [spfOutput, setSpfOutput] = useState('');
  const [mxOutput, setMxOutput] = useState('');
  const [aOutput, setAOutput] = useState('');

  const handleLoadExample = () => {
    // SPF
    setSpfDomains('example1.com\nexample2.com\nexample3.com');
    setSpfSubdomains('mail\n@\nadmin');
    setSpfIps('192.0.2.1\n192.0.2.2\n192.0.2.3');

    // MX
    setMxDomains('example1.com\nexample2.com\nexample3.com');
    setMxSubdomains('mail\n@\nadmin');
    setMxIps('192.0.2.1\n192.0.2.2\n192.0.2.3');

    // A
    setADomains('example1.com\nexample2.com\nexample3.com');
    setASubdomains('mail\n@\nadmin');
    setAIps('192.0.2.1\n192.0.2.2\n192.0.2.3');
  };

  const handleReset = () => {
    setSpfDomains('');
    setSpfSubdomains('');
    setSpfIps('');

    setMxDomains('');
    setMxSubdomains('');
    setMxIps('');

    setADomains('');
    setASubdomains('');
    setAIps('');

    setSpfOutput('');
    setMxOutput('');
    setAOutput('');
  };

  const handleGenerateSpf = () => {
    const domains = spfDomains.split('\n').map(d => d.trim()).filter(Boolean);
    const subdomains = spfSubdomains.split('\n').map(s => s.trim());
    const ips = spfIps.split('\n').map(i => i.trim()).filter(Boolean);

    if (domains.length === 0) {
      alert('Please enter at least one domain.');
      return;
    }

    const generated: string[] = [];
    domains.forEach((domain, idx) => {
      const sub = subdomains[idx] !== undefined && subdomains[idx] !== '' ? subdomains[idx] : '@';
      const ip = ips[idx] || '127.0.0.1';
      generated.push(`${domain},${sub},TXT,"v=spf1 ip4:${ip} -all"`);
    });

    setSpfOutput(generated.join('\n'));
  };

  const handleGenerateMx = () => {
    const domains = mxDomains.split('\n').map(d => d.trim()).filter(Boolean);
    const subdomains = mxSubdomains.split('\n').map(s => s.trim());
    const ips = mxIps.split('\n').map(i => i.trim()).filter(Boolean);

    if (domains.length === 0) {
      alert('Please enter at least one domain.');
      return;
    }

    const generated: string[] = [];
    domains.forEach((domain, idx) => {
      const sub = subdomains[idx] !== undefined && subdomains[idx] !== '' ? subdomains[idx] : '@';
      const ip = ips[idx] || '127.0.0.1';
      generated.push(`${domain},${sub},TXT,MXrecords:${ip}`);
    });

    setMxOutput(generated.join('\n'));
  };

  const handleGenerateA = () => {
    const domains = aDomains.split('\n').map(d => d.trim()).filter(Boolean);
    const subdomains = aSubdomains.split('\n').map(s => s.trim());
    const ips = aIps.split('\n').map(i => i.trim()).filter(Boolean);

    if (domains.length === 0) {
      alert('Please enter at least one domain.');
      return;
    }

    const generated: string[] = [];
    domains.forEach((domain, idx) => {
      const sub = subdomains[idx] !== undefined && subdomains[idx] !== '' ? subdomains[idx] : '@';
      const ip = ips[idx] || '127.0.0.1';
      generated.push(`${domain},${sub},TXT,Arecords:${ip}`);
    });

    setAOutput(generated.join('\n'));
  };

  const handleCopy = (content: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    alert('Copied to clipboard!');
  };

  const handleDownload = (content: string, prefix: string) => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${prefix}_${new Date().toISOString().split('T')[0]}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dns-generator-container animate-fade-in" style={{ paddingBottom: '2rem' }}>
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
            background: 'rgba(168, 85, 247, 0.1)',
            borderRadius: '12px'
          }}>⚡</span>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 0.2rem 0', letterSpacing: '0.5px' }}>
              DNS Record Generator
            </h1>
            <p className="subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Bulk generate SPF, MX, and A record imports matching GestiQ formats
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button className="example-btn" onClick={handleLoadExample}>
            ✨ Load Example
          </button>
          <button className="reset-btn" onClick={handleReset}>
            🔄 Reset
          </button>
        </div>
      </header>

      {/* Inputs Panels Grid */}
      <div className="generator-grid">
        {/* SPF Records Column */}
        <div className="generator-card spf-card">
          <div className="card-header-icon">
            <span className="icon">🛡️</span>
            <div>
              <h3>SPF Records</h3>
              <p>v=spf1 strict declarations</p>
            </div>
          </div>
          <div className="field-group">
            <label>DOMAINS (one per line)</label>
            <textarea
              placeholder="example.com"
              value={spfDomains}
              onChange={(e) => setSpfDomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>SUBDOMAINS (optional, matches domain order)</label>
            <textarea
              placeholder="mail"
              value={spfSubdomains}
              onChange={(e) => setSpfSubdomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>AUTHORIZED IPs (one per line)</label>
            <textarea
              placeholder="192.0.2.1"
              value={spfIps}
              onChange={(e) => setSpfIps(e.target.value)}
            />
          </div>
          <button className="generate-btn spf-btn" onClick={handleGenerateSpf}>
            Generate SPF
          </button>
        </div>

        {/* MX Records Column */}
        <div className="generator-card mx-card">
          <div className="card-header-icon">
            <span className="icon">✉️</span>
            <div>
              <h3>MX Records</h3>
              <p>Mail routing declarations</p>
            </div>
          </div>
          <div className="field-group">
            <label>DOMAINS (one per line)</label>
            <textarea
              placeholder="example.com"
              value={mxDomains}
              onChange={(e) => setMxDomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>SUBDOMAINS (optional, matches domain order)</label>
            <textarea
              placeholder="mail"
              value={mxSubdomains}
              onChange={(e) => setMxSubdomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>TARGET IPs or PREFIXES (one per line)</label>
            <textarea
              placeholder="192.0.2.1"
              value={mxIps}
              onChange={(e) => setMxIps(e.target.value)}
            />
          </div>
          <button className="generate-btn mx-btn" onClick={handleGenerateMx}>
            Generate MX
          </button>
        </div>

        {/* A Records Column */}
        <div className="generator-card a-card">
          <div className="card-header-icon">
            <span className="icon">🌐</span>
            <div>
              <h3>A Records</h3>
              <p>Direct IP mapping</p>
            </div>
          </div>
          <div className="field-group">
            <label>DOMAINS (one per line)</label>
            <textarea
              placeholder="example.com"
              value={aDomains}
              onChange={(e) => setADomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>SUBDOMAINS (optional, matches domain order)</label>
            <textarea
              placeholder="mail"
              value={aSubdomains}
              onChange={(e) => setASubdomains(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>TARGET IPs (one per line)</label>
            <textarea
              placeholder="192.0.2.1"
              value={aIps}
              onChange={(e) => setAIps(e.target.value)}
            />
          </div>
          <button className="generate-btn a-btn" onClick={handleGenerateA}>
            Generate A Records
          </button>
        </div>
      </div>

      {/* Output Results Container (Side-by-side Columns) */}
      <div className="generator-grid" style={{ marginTop: '1rem' }}>
        {/* SPF Output Card */}
        <div className="output-section" style={{ borderLeft: '4px solid #7c3aed' }}>
          <div className="output-header">
            <h3 style={{ fontSize: '0.9rem' }}>Generated SPF</h3>
            {spfOutput && (
              <div className="output-actions">
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleCopy(spfOutput)}>
                  📋 Copy
                </button>
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDownload(spfOutput, 'spf_records')}>
                  📥 Download
                </button>
              </div>
            )}
          </div>
          <textarea
            className="output-textarea"
            style={{ height: '120px', borderLeft: 'none' }}
            placeholder="SPF records will appear here..."
            value={spfOutput}
            readOnly
          />
        </div>

        {/* MX Output Card */}
        <div className="output-section" style={{ borderLeft: '4px solid #4f46e5' }}>
          <div className="output-header">
            <h3 style={{ fontSize: '0.9rem' }}>Generated MX</h3>
            {mxOutput && (
              <div className="output-actions">
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleCopy(mxOutput)}>
                  📋 Copy
                </button>
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDownload(mxOutput, 'mx_records')}>
                  📥 Download
                </button>
              </div>
            )}
          </div>
          <textarea
            className="output-textarea"
            style={{ height: '120px', borderLeft: 'none' }}
            placeholder="MX records will appear here..."
            value={mxOutput}
            readOnly
          />
        </div>

        {/* A Records Output Card */}
        <div className="output-section" style={{ borderLeft: '4px solid #ec4899' }}>
          <div className="output-header">
            <h3 style={{ fontSize: '0.9rem' }}>Generated A Records</h3>
            {aOutput && (
              <div className="output-actions">
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleCopy(aOutput)}>
                  📋 Copy
                </button>
                <button className="action-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDownload(aOutput, 'a_records')}>
                  📥 Download
                </button>
              </div>
            )}
          </div>
          <textarea
            className="output-textarea"
            style={{ height: '120px', borderLeft: 'none' }}
            placeholder="A records will appear here..."
            value={aOutput}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
