
import React, { useState } from 'react';
import { User } from '../types';
import { getApiBase } from '../api';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = getApiBase();

  const buildDisplayName = (value: string) => {
    const [localPart] = value.split('@');
    if (!localPart) return 'Usuário';
    return localPart
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? 'Credenciais inválidas.';
        throw new Error(message);
      }

      const data = await response.json();
      if (!data?.user || !data?.token) {
        throw new Error('Resposta inválida do servidor.');
      }

      localStorage.setItem('guti_token', data.token);
      const resolvedName = data.user.name?.trim() || buildDisplayName(data.user.email);
      onLogin({
        id: data.user.id,
        email: data.user.email,
        name: resolvedName,
        devzappLink: data.user.devzappLink ?? null,
        role: data.user.role
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha no login.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-blue-600 to-indigo-900 animate-fade-up">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl animate-soft-pop transition-all duration-500 ease-out">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-6 shadow-xl shadow-blue-500/30">G</div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Guti 2026</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Rede Evangélica do Estado de SP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">E-mail de Acesso</label>
            <input 
              type="email" 
              placeholder="Ex: nome@exemplo.com"
              className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">Senha</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/40 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50 mt-4"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Entrar no Painel'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;

