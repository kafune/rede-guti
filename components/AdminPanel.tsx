import React, { useEffect, useState } from 'react';
import { AdminUser, Supporter, Region, SupportStatus, User, UserRole } from '../types';
import { createUser, deleteUser, fetchUsers, getApiErrorMessage, updateUser } from '../api';

interface Props {
  supporters: Supporter[];
  onImport: (data: Supporter[]) => void;
  currentUser: User;
}

const AdminPanel: React.FC<Props> = ({ supporters, onImport, currentUser }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.VIEWER,
    devzappLink: ''
  });
  const [editUser, setEditUser] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.VIEWER,
    devzappLink: ''
  });

  const exportCSV = () => {
    const headers = ['ID', 'Nome', 'WhatsApp', 'Igreja', 'Regiao', 'Data Cadastro', 'Status', 'Observacoes'];
    const rows = supporters.map(s => [
      s.id,
      s.name,
      s.whatsapp,
      s.church,
      s.region,
      new Date(s.createdAt).toISOString(),
      s.status,
      s.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `apoiadores_guti_2026_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao carregar usuários.'));
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        // Simple CSV parser for demo purposes
        const newSupporters: Supporter[] = lines.slice(1).map(line => {
          const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
          return {
            id: Math.random().toString(36).substr(2, 9),
            name: cols[1],
            whatsapp: cols[2],
            church: cols[3],
            region: cols[4] as Region,
            createdAt: cols[5] || new Date().toISOString(),
            createdBy: 'admin-import',
            status: (cols[6] as SupportStatus) || SupportStatus.ACTIVE,
            notes: cols[7] || ''
          } as Supporter;
        });
        
        onImport(newSupporters);
        alert(`${newSupporters.length} apoiadores importados com sucesso!`);
      } catch (err) {
        alert('Erro ao processar CSV. Verifique o formato.');
      }
    };
    reader.readAsText(file);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) return;

    setCreatingUser(true);
    setUsersError(null);
    try {
      const created = await createUser({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role,
        devzappLink: newUser.devzappLink.trim() || undefined
      });
      setUsers((prev) => [created, ...prev]);
      setNewUser({ name: '', email: '', password: '', role: UserRole.VIEWER, devzappLink: '' });
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao criar usuário.'));
    } finally {
      setCreatingUser(false);
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingUserId(user.id);
    setEditUser({
      name: user.name ?? '',
      email: user.email,
      password: '',
      role: user.role,
      devzappLink: user.devzappLink ?? ''
    });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditUser({ name: '', email: '', password: '', role: UserRole.VIEWER, devzappLink: '' });
  };

  const handleUpdateUser = async (user: AdminUser) => {
    const payload: { email?: string; name?: string; password?: string; role?: UserRole; devzappLink?: string | null } = {};
    const trimmedEmail = editUser.email.trim().toLowerCase();
    const trimmedName = editUser.name.trim();
    const trimmedDevzappLink = editUser.devzappLink.trim();

    if (trimmedEmail && trimmedEmail !== user.email.toLowerCase()) {
      payload.email = trimmedEmail;
    }
    if (trimmedName && trimmedName !== (user.name ?? '')) {
      payload.name = trimmedName;
    }
    if (editUser.password.trim()) {
      payload.password = editUser.password;
    }
    if (editUser.role && editUser.role !== user.role) {
      payload.role = editUser.role;
    }
    if (trimmedDevzappLink !== (user.devzappLink ?? '')) {
      payload.devzappLink = trimmedDevzappLink ? trimmedDevzappLink : null;
    }

    if (!Object.keys(payload).length) {
      cancelEdit();
      return;
    }

    setUpdatingUserId(user.id);
    setUsersError(null);
    try {
      const updated = await updateUser(user.id, payload);
      setUsers((prev) => prev.map((item) => (item.id === user.id ? updated : item)));
      cancelEdit();
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao atualizar usuário.'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (user.id === currentUser.id) return;
    if (!confirm(`Excluir o usuário ${user.email}?`)) return;

    setDeletingUserId(user.id);
    setUsersError(null);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao excluir usuário.'));
    } finally {
      setDeletingUserId(null);
    }
  };

  const roleLabel = (role: UserRole) => {
    if (role === UserRole.ADMIN) return 'Administrador';
    if (role === UserRole.VIEWER) return 'Visualizador';
    return role;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <h2 className="text-2xl font-bold animate-soft-pop">Configurações do Admin</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out hover:-translate-y-0.5">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 mb-4 text-xl">
            <i className="fa-solid fa-file-export"></i>
          </div>
          <h3 className="text-lg font-bold mb-2">Exportar Dados</h3>
          <p className="text-sm opacity-60 mb-6">Baixe a base completa de apoiadores em formato CSV para Excel/Google Sheets.</p>
          <button 
            onClick={exportCSV}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5"
          >
            Exportar CSV
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out hover:-translate-y-0.5">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 mb-4 text-xl">
            <i className="fa-solid fa-file-import"></i>
          </div>
          <h3 className="text-lg font-bold mb-2">Importar Dados</h3>
          <p className="text-sm opacity-60 mb-6">Suba uma lista de contatos em massa via arquivo CSV.</p>
          <label className="block w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 text-center cursor-pointer">
            Selecionar CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold mb-1">Usuários do Sistema</h3>
            <p className="text-sm opacity-60">Crie, edite e remova acessos ao painel.</p>
          </div>
          <button
            onClick={loadUsers}
            className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-900 text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
          >
            Atualizar lista
          </button>
        </div>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-6 gap-3">
  <input
    type="text"
    value={newUser.name}
    onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
    placeholder="Nome"
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
    required
  />
  <input
    type="email"
    value={newUser.email}
    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
    placeholder="Ex: usuario@exemplo.com"
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
    required
  />
  <input
    type="text"
    value={newUser.devzappLink}
    onChange={(e) => setNewUser((prev) => ({ ...prev, devzappLink: e.target.value }))}
    placeholder="DevZapp (opcional)"
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  />
  <input
    type="password"
    value={newUser.password}
    onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
    placeholder="Senha (mínimo 6)"
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
    required
  />
  <select
    value={newUser.role}
    onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as UserRole }))}
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  >
    <option value={UserRole.ADMIN}>Administrador</option>
    <option value={UserRole.VIEWER}>Visualizador</option>
  </select>
  <button
    type="submit"
    disabled={creatingUser}
    className="md:col-span-2 w-full py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
  >
    {creatingUser ? 'Criando...' : 'Adicionar usuário'}
  </button>
</form>

        {usersError && (
          <div className="mt-4 text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {usersError}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {usersLoading && (
            <div className="text-sm text-blue-600 font-semibold bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              Carregando usuários...
            </div>
          )}
          {!usersLoading && users.length === 0 && (
            <div className="text-sm opacity-60 px-2">Nenhum usuário encontrado.</div>
          )}
          {users.map((user) => {
            const isEditing = editingUserId === user.id;
            const isSelf = user.id === currentUser.id;
            const roleColor =
              user.role === UserRole.ADMIN
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300';

            return (
              <div
                key={user.id}
                className="rounded-2xl border dark:border-gray-700 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all duration-500 ease-out hover:-translate-y-0.5"
              >
                <div className="flex-1 space-y-2">
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
  <input
    type="text"
    value={editUser.name}
    onChange={(e) => setEditUser((prev) => ({ ...prev, name: e.target.value }))}
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  />
  <input
    type="email"
    value={editUser.email}
    onChange={(e) => setEditUser((prev) => ({ ...prev, email: e.target.value }))}
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  />
  <input
    type="text"
    value={editUser.devzappLink}
    onChange={(e) => setEditUser((prev) => ({ ...prev, devzappLink: e.target.value }))}
    placeholder="DevZapp (opcional)"
    className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  />
  <select
    value={editUser.role}
    onChange={(e) => setEditUser((prev) => ({ ...prev, role: e.target.value as UserRole }))}
    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  >
    <option value={UserRole.ADMIN}>Administrador</option>
    <option value={UserRole.VIEWER}>Visualizador</option>
  </select>
  <input
    type="password"
    value={editUser.password}
    onChange={(e) => setEditUser((prev) => ({ ...prev, password: e.target.value }))}
    placeholder="Nova senha (opcional)"
    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
  />
</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
  <span className="font-bold">{user.name || user.email}</span>
  <span className={`text-xs font-bold px-3 py-1 rounded-full ${roleColor}`}>{roleLabel(user.role)}</span>
  {isSelf && (
    <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      Você
    </span>
  )}
</div>
<div className="text-xs opacity-60 space-y-1">
  <div>{user.email}</div>
  {user.devzappLink && <div>DevZapp: {user.devzappLink}</div>}
  <div>Criado em {new Date(user.createdAt).toLocaleDateString('pt-BR')}</div>
</div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleUpdateUser(user)}
                        disabled={updatingUserId === user.id}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {updatingUserId === user.id ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-900 text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(user)}
                        className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-900 text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={isSelf || deletingUserId === user.id}
                        className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {deletingUserId === user.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
        <h3 className="text-lg font-bold mb-4">Informações do Sistema</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
            <span className="opacity-60">Versão</span>
            <span className="font-mono font-bold">v1.2.0-build.2024</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
            <span className="opacity-60">Projeto</span>
            <span className="font-bold">Guti 2026 - Rede SP</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="opacity-60">Segurança</span>
            <span className="text-green-500 flex items-center gap-1 font-bold">
              <i className="fa-solid fa-shield-halved"></i> TLS Ativo
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl border border-yellow-200 dark:border-yellow-900/40 transition-all duration-500 ease-out">
        <h4 className="font-bold text-yellow-800 dark:text-yellow-400 mb-1 flex items-center gap-2 text-sm">
          <i className="fa-solid fa-circle-info"></i> Passo a Passo PWA
        </h4>
        <ul className="text-xs space-y-2 text-yellow-800 dark:text-yellow-400 opacity-90">
          <li>1. <strong>Instalar:</strong> Toque no ícone de "Compartilhar" (Safari) ou Menu 3 pontos (Chrome) e escolha "Adicionar à Tela de Início".</li>
          <li>2. <strong>Operadores:</strong> Em futuras versões, gerencie senhas aqui.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminPanel;



