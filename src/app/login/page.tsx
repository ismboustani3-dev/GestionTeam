'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './Login.css';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, verify password here. For now, just redirect to dashboard.
    if (password) {
      router.push('/');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card animate-fade-in">
        <div className="logo-placeholder">
          {/* Logo will go here */}
        </div>
        
        <h1 className="login-title">GestiQ</h1>
        <p className="login-subtitle">Ingresa la contraseña para acceder a la aplicación</p>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="password-input"
              required
            />
            <span className="lock-icon">🔒</span>
          </div>
          
          <button type="submit" className="login-button">
            Acceder
          </button>
        </form>
      </div>
    </div>
  );
}
