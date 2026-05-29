import Link from 'next/link';
import './Sidebar.css';

export default function Sidebar() {
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
          <Link href="/" className="nav-item active">
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>
          <Link href="/database" className="nav-item">
            <span className="nav-icon">🗄️</span>
            Database
          </Link>
          <Link href="/management" className="nav-item">
            <span className="nav-icon">⚙️</span>
            Management
          </Link>
          <Link href="/team" className="nav-item">
            <span className="nav-icon">👥</span>
            Team
          </Link>
          <Link href="/inventory" className="nav-item">
            <span className="nav-icon">📦</span>
            Server Inventory
          </Link>
          <Link href="/tools" className="nav-item">
            <span className="nav-icon">🔧</span>
            Tools
          </Link>
          <Link href="/ip-status" className="nav-item">
            <span className="nav-icon">⚠️</span>
            IP Status
          </Link>
          <Link href="/drops" className="nav-item">
            <span className="nav-icon">📉</span>
            Drop Details
          </Link>
          <Link href="/spamhaus" className="nav-item">
            <span className="nav-icon">🔍</span>
            Spamhaus
          </Link>
          <Link href="/ai-agent" className="nav-item">
            <span className="nav-icon">🤖</span>
            AI Agent
          </Link>
          <Link href="/rps" className="nav-item">
            <span className="nav-icon">🌐</span>
            RPs
          </Link>
        </nav>
      </div>
    </aside>
  );
}
