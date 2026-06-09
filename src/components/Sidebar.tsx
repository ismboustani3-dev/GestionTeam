'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './Sidebar.css';

export default function Sidebar() {
  const pathname = usePathname();
  const [isToolsOpen, setIsToolsOpen] = useState(true);
  const [fontScale, setFontScale] = useState(100);
  const [isFontControlOpen, setIsFontControlOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gestiq_font_scale');
    if (saved) {
      const scale = Number(saved);
      setFontScale(scale);
      document.documentElement.style.fontSize = `${scale}%`;
    }
  }, []);

  const handleFontScale = (val: number) => {
    setFontScale(val);
    localStorage.setItem('gestiq_font_scale', String(val));
    document.documentElement.style.fontSize = `${val}%`;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon"></span>
          <h2>GestiQ</h2>
        </div>
      </div>
      
      <div className="sidebar-section">
        <span className="section-title">MAIN</span>
        <nav className="nav-menu">
          <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>
          <Link href="/database" className={`nav-item ${pathname === '/database' ? 'active' : ''}`}>
            <span className="nav-icon">🗄️</span>
            Database
          </Link>
          <Link href="/team-server-detail" className={`nav-item ${pathname === '/team-server-detail' ? 'active' : ''}`}>
            <span className="nav-icon">🖥️</span>
            Team Server Detail
          </Link>
          <Link href="/infrastructure" className={`nav-item ${pathname === '/infrastructure' ? 'active' : ''}`}>
            <span className="nav-icon">🛡️</span>
            Infrastructure Check
          </Link>
          <Link href="/blacklist" className={`nav-item ${pathname === '/blacklist' ? 'active' : ''}`}>
            <span className="nav-icon">🚫</span>
            Check Blacklist
          </Link>
          <Link href="/blacklist-reports" className={`nav-item ${pathname === '/blacklist-reports' ? 'active' : ''}`}>
            <span className="nav-icon">📊</span>
            Blacklist Reports
          </Link>
          <Link href="/ip-status" className={`nav-item ${pathname === '/ip-status' ? 'active' : ''}`}>
            <span className="nav-icon">🌐</span>
            IP Status
          </Link>
          <Link href="/gestion-rp" className={`nav-item ${pathname === '/gestion-rp' ? 'active' : ''}`}>
            <span className="nav-icon">📦</span>
            Gestion RP
          </Link>
          <Link href="/warmup" className={`nav-item ${pathname === '/warmup' ? 'active' : ''}`}>
            <span className="nav-icon">🔥</span>
            Suivi Warmup
          </Link>
        </nav>
      </div>

      <div className="sidebar-section" style={{ marginTop: '1.5rem', flex: 'none' }}>
        <div 
          className="section-title tools-header" 
          onClick={() => setIsToolsOpen(!isToolsOpen)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            cursor: 'pointer',
            userSelect: 'none',
            paddingRight: '2rem'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>🔧</span> Tools
          </span>
          <span className={`chevron ${isToolsOpen ? 'open' : ''}`} style={{ fontSize: '0.6rem', transition: 'transform 0.3s ease' }}>{isToolsOpen ? '▲' : '▼'}</span>
        </div>
        
        {isToolsOpen && (
          <nav className="nav-menu nested-menu">
            <Link href="/tools/dns-scanner" className={`nav-item sub-item ${pathname === '/tools/dns-scanner' ? 'active' : ''}`}>
              <span className="bullet">•</span> DNS Scanner
            </Link>
            <Link href="/tools/extraction" className={`nav-item sub-item ${pathname === '/tools/extraction' ? 'active' : ''}`}>
              <span className="bullet">•</span> Extraction
            </Link>
            <Link href="/tools/ip-provider" className={`nav-item sub-item ${pathname === '/tools/ip-provider' ? 'active' : ''}`}>
              <span className="bullet">•</span> IP Provider
            </Link>
            <Link href="/tools/dns-generator" className={`nav-item sub-item ${pathname === '/tools/dns-generator' ? 'active' : ''}`}>
              <span className="bullet">•</span> DNS Generator
            </Link>
          </nav>
        )}
      </div>

      {/* Font Size Toggle Button */}
      <div 
        className="font-control-toggle" 
        onClick={() => setIsFontControlOpen(!isFontControlOpen)}
      >
        <span>🔤</span> Text Size
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.6 }}>
          {isFontControlOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Font Size Adjuster Control */}
      {isFontControlOpen && (
        <div className="sidebar-font-control">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '1px' }}>TEXT SIZE</span>
            <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 700 }}>{fontScale}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button 
              onClick={() => handleFontScale(Math.max(80, fontScale - 5))}
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: '#fff', 
                width: '28px',
                height: '28px',
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Decrease Text Size"
            >
              A-
            </button>
            <input 
              type="range" 
              min="80" 
              max="130" 
              step="5" 
              value={fontScale} 
              onChange={(e) => handleFontScale(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', height: '4px', accentColor: '#10b981' }}
            />
            <button 
              onClick={() => handleFontScale(Math.min(130, fontScale + 5))}
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: '#fff', 
                width: '28px',
                height: '28px',
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Increase Text Size"
            >
              A+
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
