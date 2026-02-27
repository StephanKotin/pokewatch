import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 40,
        width: '100%',
        maxWidth: 400,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, var(--yellow), var(--red), var(--blue))',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
          }}>
            Poke<span style={{ color: 'var(--yellow)' }}>Watch</span>
          </div>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: 'var(--muted)',
            marginTop: 8,
          }}>
            {isRegister ? 'Create your account' : 'Sign in to continue'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: "'DM Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: "'DM Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'Min 6 characters' : 'Enter password'}
              required
              minLength={isRegister ? 6 : undefined}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(230, 57, 70, 0.15)',
              border: '1px solid var(--red)',
              borderRadius: 8,
              padding: '10px 14px',
              color: 'var(--red)',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: '100%', padding: '12px 0', fontSize: 14 }}
          >
            {submitting ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: 20,
          fontSize: 13,
          color: 'var(--muted)',
        }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--yellow)',
              cursor: 'pointer',
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            {isRegister ? 'Sign In' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  );
}
