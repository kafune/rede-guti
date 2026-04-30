import React, { useEffect, useMemo, useState } from 'react';
import {
  AdminUser,
  AppSettings,
  Church,
  Municipality,
  RegistrationPayload,
  SupportStatus,
  Supporter,
  User,
  UserRole
} from '../types';
import { deleteUser, fetchSettings, fetchUsers, getApiErrorMessage, updateSettings, updateUser } from '../api';
import {
  canManageUsers,
  canViewSupporterIdentity,
  getDefaultCreatableUserRole,
  getRoleLabel
} from '../roleUtils';
import SupporterForm from './SupporterForm';

interface Props {
  supporters: Supporter[];
  onImport: (data: Supporter[]) => void;
  currentUser: User;
  churches: Church[];
  municipalities: Municipality[];
  onSubmitRegistration: (payload: RegistrationPayload) => Promise<boolean>;
}

type NetworkUserNode = Pick<
  AdminUser,
  | 'id'
  | 'email'
  | 'name'
  | 'role'
  | 'createdAt'
  | 'indicatedByUserId'
  | 'indicatedByUser'
  | 'hierarchyPath'
  | 'directIndicatedUsersCount'
  | 'directSupportersCount'
>;

const getRoleBadgeClass = (role: UserRole) => {
  switch (role) {
    case UserRole.COORDENADOR:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case UserRole.LIDER_REGIONAL:
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case UserRole.VERIFICADORA:
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
  }
};

const AdminPanel: React.FC<Props> = ({
  supporters,
  onImport,
  currentUser,
  churches,
  municipalities,
  onSubmitRegistration
}) => {
  const allowUserEditing = canManageUsers(currentUser.role);
  const canImportData = currentUser.role === UserRole.COORDENADOR;
  const canViewSupporterDetails = canViewSupporterIdentity(currentUser.role);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [whatsappGroupLinkInput, setWhatsappGroupLinkInput] = useState('');
  const [editUser, setEditUser] = useState({
    name: '',
    email: '',
    password: '',
    role: getDefaultCreatableUserRole(currentUser.role)
  });

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao carregar usuarios.'));
    } finally {
      setUsersLoading(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await fetchSettings();
      setSettings(data);
      setWhatsappGroupLinkInput(data.whatsappGroupLink?.trim() || '');
    } catch (error) {
      setSettingsError(getApiErrorMessage(error, 'Erro ao carregar configuracao do grupo.'));
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    void loadSettings();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const text = readerEvent.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());
        const importedSupporters: Supporter[] = lines.slice(1).map((line) => {
          const cols = line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim());
          return {
            id: Math.random().toString(36).slice(2, 11),
            name: cols[1],
            email: '',
            whatsapp: cols[2],
            church: cols[3],
            region: cols[4] as Supporter['region'],
            createdAt: cols[5] || new Date().toISOString(),
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            status: cols[6] as Supporter['status'],
            notes: cols[7] || '',
            indicatedBy: currentUser.name,
            indicatedByUserId: currentUser.id
          };
        });

        onImport(importedSupporters);
        alert(`${importedSupporters.length} apoiadores importados com sucesso!`);
      } catch {
        alert('Erro ao processar CSV. Verifique o formato.');
      }
    };

    reader.readAsText(file);
  };

  const startEdit = (user: AdminUser) => {
    if (!allowUserEditing) return;

    setEditingUserId(user.id);
    setEditUser({
      name: user.name ?? '',
      email: user.email,
      password: '',
      role: user.role
    });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditUser({
      name: '',
      email: '',
      password: '',
      role: getDefaultCreatableUserRole(currentUser.role)
    });
  };

  const handleUpdateUser = async (user: AdminUser) => {
    if (!allowUserEditing) return;

    const payload: {
      email?: string;
      name?: string;
      password?: string;
      role?: UserRole;
    } = {};

    const trimmedEmail = editUser.email.trim().toLowerCase();
    const trimmedName = editUser.name.trim();

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
      setUsersError(getApiErrorMessage(error, 'Erro ao atualizar usuario.'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!allowUserEditing || user.id === currentUser.id) return;
    if (!confirm(`Excluir o usuario ${user.email}?`)) return;

    setDeletingUserId(user.id);
    setUsersError(null);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch (error) {
      setUsersError(getApiErrorMessage(error, 'Erro ao excluir usuario.'));
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!allowUserEditing) return;

    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess('');
    try {
      const updated = await updateSettings({
        whatsappGroupLink: whatsappGroupLinkInput.trim() || null
      });
      setSettings(updated);
      setWhatsappGroupLinkInput(updated.whatsappGroupLink?.trim() || '');
      setSettingsSuccess('Link do grupo atualizado com sucesso.');
    } catch (error) {
      setSettingsError(getApiErrorMessage(error, 'Erro ao salvar link do grupo.'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const networkUsers = useMemo<NetworkUserNode[]>(() => {
    const baseUsers = [...users];
    if (!baseUsers.some((user) => user.id === currentUser.id)) {
      baseUsers.unshift({
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        createdAt: '',
        indicatedByUserId: currentUser.indicatedByUserId ?? null,
        indicatedByUser: currentUser.indicatedByUser ?? null,
        hierarchyPath: currentUser.hierarchyPath ?? [],
        directIndicatedUsersCount: 0,
        directSupportersCount: 0
      });
    }
    return baseUsers;
  }, [currentUser, users]);

  const usersByParent = useMemo(() => {
    const map = new Map<string | null, NetworkUserNode[]>();
    networkUsers.forEach((user) => {
      const key = user.indicatedByUserId ?? null;
      const existing = map.get(key) ?? [];
      existing.push(user);
      map.set(key, existing);
    });
    return map;
  }, [networkUsers]);

  const supportersByParent = useMemo(() => {
    const map = new Map<string, Supporter[]>();
    supporters.forEach((supporter) => {
      const parentId = supporter.indicatedByUserId ?? supporter.createdBy;
      if (!parentId) return;
      const existing = map.get(parentId) ?? [];
      existing.push(supporter);
      map.set(parentId, existing);
    });
    return map;
  }, [supporters]);

  const userMap = useMemo(() => {
    return new Map(networkUsers.map((user) => [user.id, user]));
  }, [networkUsers]);

  const rootNetworkIds = useMemo(() => {
    if (currentUser.role === UserRole.COORDENADOR) {
      return networkUsers
        .filter((user) => !user.indicatedByUserId || !userMap.has(user.indicatedByUserId))
        .map((user) => user.id);
    }
    return [currentUser.id];
  }, [currentUser.id, currentUser.role, networkUsers, userMap]);

  const regionalSummary = useMemo(() => {
    const directSupporters = supportersByParent.get(currentUser.id)?.length ?? 0;
    const directLeaders = (usersByParent.get(currentUser.id) ?? []).filter(
      (user) => user.id !== currentUser.id
    ).length;
    const activeMunicipalities = new Set(
      supporters
        .filter((supporter) => supporter.status === SupportStatus.ACTIVE)
        .map((supporter) => (supporter.notes || '').trim())
        .filter(Boolean)
    ).size;

    return {
      totalSupporters: supporters.length,
      directSupporters,
      directLeaders,
      activeMunicipalities
    };
  }, [currentUser.id, supporters, supportersByParent, usersByParent]);

  const renderNetworkNode = (userId: string, depth = 0): React.ReactNode => {
    const user = userMap.get(userId);
    if (!user) return null;

    const childUsers = (usersByParent.get(user.id) ?? [])
      .filter((child) => child.id !== user.id)
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
    const childSupporters = (supportersByParent.get(user.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const hierarchyLabel = user.hierarchyPath?.map((item) => item.name).join(' > ') ?? '';

    const cappedDepth = Math.min(depth, 4);
    const indentClass =
      depth === 0
        ? ''
        : 'pl-3 sm:pl-4 border-l-2 border-blue-100 dark:border-blue-900/30';

    return (
      <div
        key={user.id}
        className={`space-y-3 min-w-0 ${indentClass}`}
        style={{ marginLeft: cappedDepth * 8 }}
      >
        <div className="rounded-2xl border dark:border-gray-700 p-4 bg-white dark:bg-gray-900/40 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <span className="font-bold truncate max-w-full">{user.name || user.email}</span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${getRoleBadgeClass(user.role)}`}>
              {getRoleLabel(user.role)}
            </span>
            {user.id === currentUser.id && (
              <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full whitespace-nowrap bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                Voce
              </span>
            )}
          </div>
          <div className="text-xs opacity-60 mt-2 space-y-1 break-words">
            <div className="break-all">{user.email}</div>
            {user.indicatedByUser && <div>Indicado por: {user.indicatedByUser.name}</div>}
            {hierarchyLabel && <div>Rede: {hierarchyLabel}</div>}
            <div>
              Diretos: {childUsers.length} lideranca(s), {childSupporters.length} apoiador(es)
            </div>
          </div>
        </div>

        {childSupporters.length > 0 && (
          <div className="space-y-2 pl-3 sm:pl-4 border-l-2 border-dashed border-blue-100 dark:border-blue-900/30">
            {childSupporters.map((supporter) => (
              <div
                key={supporter.id}
                className="rounded-2xl border border-dashed dark:border-gray-700 px-4 py-3 bg-blue-50/60 dark:bg-blue-900/10 min-w-0"
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                  <span className="font-bold text-sm truncate max-w-full">{supporter.name}</span>
                  <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full whitespace-nowrap bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Apoiador
                  </span>
                </div>
                <div className="text-xs opacity-60 mt-1 space-y-1 break-words">
                  <div>{supporter.church}</div>
                  <div>{supporter.notes || supporter.region}</div>
                  {supporter.hierarchyPath && supporter.hierarchyPath.length > 0 && (
                    <div>Rede: {supporter.hierarchyPath.map((item) => item.name).join(' > ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {childUsers.length > 0 && (
          <div className="space-y-3">{childUsers.map((child) => renderNetworkNode(child.id, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <h2 className="text-2xl font-bold animate-soft-pop">Gestao da Rede</h2>

      {canImportData && (
        <div className="theme-panel bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out hover:-translate-y-0.5">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 mb-4 text-xl">
            <i className="fa-solid fa-file-import"></i>
          </div>
          <h3 className="text-lg font-bold mb-2">Importar Dados</h3>
          <p className="text-sm opacity-60 mb-6">Suba uma lista de contatos em massa via arquivo CSV.</p>
          <label className="theme-accent-button block w-full py-3 rounded-xl font-bold active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 text-center cursor-pointer">
            Selecionar CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      <div className="theme-panel bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 text-xl shrink-0">
            <i className="fa-brands fa-whatsapp"></i>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-lg font-bold mb-1">Grupo oficial de WhatsApp</h3>
              <p className="text-sm opacity-60">
                Link unico usado no cadastro publico e na tela de boas-vindas.
              </p>
            </div>

            {settingsLoading ? (
              <div className="text-sm text-blue-600 font-semibold bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                Carregando configuracao...
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="url"
                  value={whatsappGroupLinkInput}
                  onChange={(event) => setWhatsappGroupLinkInput(event.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  disabled={!allowUserEditing}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-70"
                />

                <div className="flex flex-wrap items-center gap-3">
                  {allowUserEditing ? (
                    <button
                      onClick={handleSaveSettings}
                      disabled={settingsSaving}
                      className="theme-accent-button px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {settingsSaving ? 'Salvando...' : 'Salvar link'}
                    </button>
                  ) : (
                    settings?.whatsappGroupLink && (
                      <a
                        href={settings.whatsappGroupLink}
                        target="_blank"
                        rel="noreferrer"
                        className="theme-accent-button px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
                      >
                        Abrir link
                      </a>
                    )
                  )}

                  {settings?.updatedAt && (
                    <span className="text-xs opacity-50 font-semibold">
                      Atualizado em {new Date(settings.updatedAt).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {settingsError && (
              <div className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                {settingsError}
              </div>
            )}

            {settingsSuccess && (
              <div className="text-sm text-green-700 font-semibold bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                {settingsSuccess}
              </div>
            )}

            {!allowUserEditing && (
              <div className="text-sm font-semibold text-gray-500">
                Apenas coordenadores podem alterar este link.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="theme-panel bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h3 className="text-lg font-bold mb-1">Cadastros da rede</h3>
            <p className="text-sm opacity-60">O formulario abaixo respeita sua hierarquia de permissao.</p>
          </div>
          <button
            onClick={loadUsers}
            className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-900 text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
          >
            Atualizar lista
          </button>
        </div>

        <SupporterForm
          currentUser={currentUser}
          churches={churches}
          municipalities={municipalities}
          onSubmit={onSubmitRegistration}
          onSuccess={loadUsers}
          variant="embedded"
        />

        {!allowUserEditing && (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            Lider Regional pode cadastrar apoiadores e acompanhar apenas os totais numericos da propria rede. Apenas Coordenador edita ou exclui acessos.
          </div>
        )}

        {usersError && (
          <div className="mt-4 text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {usersError}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {usersLoading && (
            <div className="text-sm text-blue-600 font-semibold bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              Carregando usuarios...
            </div>
          )}
          {!usersLoading && users.length === 0 && (
            <div className="text-sm opacity-60 px-2">Nenhum usuario encontrado nesta hierarquia.</div>
          )}
          {users.map((user) => {
            const isEditing = editingUserId === user.id;
            const isSelf = user.id === currentUser.id;
            const editableRoles =
              user.role === UserRole.COORDENADOR
                ? [UserRole.COORDENADOR]
                : [UserRole.LIDER_REGIONAL, UserRole.VERIFICADORA];
            const hierarchyLabel = user.hierarchyPath?.map((item) => item.name).join(' > ') ?? '';

            return (
              <div
                key={user.id}
                className="rounded-2xl border dark:border-gray-700 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all duration-500 ease-out hover:-translate-y-0.5"
              >
                <div className="flex-1 space-y-2">
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <input
                        type="text"
                        value={editUser.name}
                        onChange={(event) => setEditUser((prev) => ({ ...prev, name: event.target.value }))}
                        className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <input
                        type="email"
                        value={editUser.email}
                        onChange={(event) => setEditUser((prev) => ({ ...prev, email: event.target.value }))}
                        className="md:col-span-2 w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <select
                        value={editUser.role}
                        onChange={(event) =>
                          setEditUser((prev) => ({ ...prev, role: event.target.value as UserRole }))
                        }
                        className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        {editableRoles.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="password"
                        value={editUser.password}
                        onChange={(event) => setEditUser((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Nova senha (opcional)"
                        className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-bold">{user.name || user.email}</span>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${getRoleBadgeClass(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            Voce
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-60 space-y-1">
                        <div>{user.email}</div>
                        {user.indicatedByUser && <div>Indicado por: {user.indicatedByUser.name}</div>}
                        {hierarchyLabel && <div>Rede: {hierarchyLabel}</div>}
                        <div>
                          Diretos: {user.directIndicatedUsersCount ?? 0} lideranca(s),{' '}
                          {user.directSupportersCount ?? 0} apoiador(es)
                        </div>
                        {user.createdAt && (
                          <div>Criado em {new Date(user.createdAt).toLocaleDateString('pt-BR')}</div>
                        )}
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
                      {allowUserEditing && (
                        <button
                          onClick={() => startEdit(user)}
                          className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-900 text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5"
                        >
                          Editar
                        </button>
                      )}
                      {allowUserEditing && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={isSelf || deletingUserId === user.id}
                          className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
                        >
                          {deletingUserId === user.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="theme-panel bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out overflow-hidden">
        <div className="mb-6">
          <h3 className="text-lg font-bold mb-1">Visualizacao multinivel</h3>
          <p className="text-sm opacity-60">
            {canViewSupporterDetails
              ? 'Cada no mostra quem indicou quem na hierarquia atual da rede.'
              : 'Para LR, esta area exibe apenas contagens agregadas da rede vinculada ao seu link.'}
          </p>
        </div>
        {canViewSupporterDetails ? (
          <div className="space-y-4">{rootNetworkIds.map((rootId) => renderNetworkNode(rootId))}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border dark:border-gray-700 p-5 bg-blue-50/70 dark:bg-blue-900/10">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Total da rede</p>
              <p className="text-3xl font-black text-blue-700 dark:text-blue-300">{regionalSummary.totalSupporters}</p>
            </div>
            <div className="rounded-2xl border dark:border-gray-700 p-5 bg-white dark:bg-gray-900/40">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Indicacoes diretas</p>
              <p className="text-3xl font-black">{regionalSummary.directSupporters}</p>
            </div>
            <div className="rounded-2xl border dark:border-gray-700 p-5 bg-white dark:bg-gray-900/40">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Liderancas vinculadas</p>
              <p className="text-3xl font-black">{regionalSummary.directLeaders}</p>
            </div>
            <div className="rounded-2xl border dark:border-gray-700 p-5 bg-white dark:bg-gray-900/40">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Municipios ativos</p>
              <p className="text-3xl font-black">{regionalSummary.activeMunicipalities}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
