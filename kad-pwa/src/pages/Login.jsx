import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { Lock, User, Server, Globe, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(''); // Em branco = Auto-Discovery[cite: 3]
  const [domain, setDomain] = useState('kinrossgold.com');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      return toast.error('Preencha o usuário e a senha de rede.');
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('server', server || 'AUTO');
    formData.append('domain', domain);

    try {
      const response = await api.post('/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      localStorage.setItem('@kad_token', response.data.access_token);
      toast.success('Autenticado com sucesso!');
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      if (err.response) {
        toast.error(err.response?.data?.detail || 'Falha na autenticação.');
      } else {
        toast.error(`Erro de rede: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <Toaster position="top-right" toastOptions={{ style: { background: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontSize: '13px' } }} />
      
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>K</div>
          <h2 style={styles.title}>KAD Mobile</h2>
          <p style={styles.subtitle}>Console Corporativo Active Directory</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Server size={16} /></span>
            <input 
              type="text" 
              placeholder="Servidor DC (Em branco = Auto)" 
              value={server} 
              onChange={(e) => setServer(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Globe size={16} /></span>
            <input 
              type="text" 
              placeholder="Domínio" 
              value={domain} 
              onChange={(e) => setDomain(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><User size={16} /></span>
            <input 
              type="text" 
              placeholder="Usuário de Rede (Login)" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Lock size={16} /></span>
            <input 
              type="password" 
              placeholder="Senha" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? <div style={styles.spinner}></div> : <>Conectar ao Domínio <ArrowRight size={16} /></>}
          </button>
        </form>

        <div style={styles.footer}>
          <ShieldCheck size={14} color={COLORS.success} /> <span>Ambiente Seguro LDAPS</span>
        </div>
      </div>
    </div>
  );
}

const COLORS = { 
  bg: '#0B111E', 
  frame: '#161F32', 
  cell: '#121824', 
  border: '#24324D', 
  gold: '#C5A059', 
  text: '#F8FAFC', 
  muted: '#94A3B8', 
  success: '#10B981', 
  danger: '#EF4444' 
};

const styles = {
  container: { backgroundColor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif', padding: '20px' },
  card: { backgroundColor: COLORS.frame, borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px', border: `1px solid ${COLORS.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  header: { textAlign: 'center', marginBottom: '25px' },
  logoBadge: { backgroundColor: COLORS.gold, color: COLORS.bg, width: '42px', height: '42px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', margin: '0 auto 12px auto' },
  title: { color: COLORS.gold, margin: '0 0 5px 0', fontSize: '20px', fontWeight: 'bold' },
  subtitle: { color: COLORS.muted, margin: 0, fontSize: '12px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  inputGroup: { display: 'flex', alignItems: 'center', backgroundColor: COLORS.cell, borderRadius: '6px', border: `1px solid ${COLORS.border}`, padding: '0 12px' },
  iconSpan: { color: COLORS.muted, display: 'flex', alignItems: 'center', marginRight: '10px' },
  input: { flex: 1, backgroundColor: 'transparent', border: 'none', color: COLORS.text, fontSize: '14px', padding: '12px 0', outline: 'none' },
  submitBtn: { backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '6px', padding: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px' },
  spinner: { width: '18px', height: '18px', border: `2px solid rgba(0,0,0,0.2)`, borderTop: `2px solid ${COLORS.bg}`, borderRadius: '50%', animation: 'spin 1s linear infinite' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', color: COLORS.muted, fontSize: '11px' }
};