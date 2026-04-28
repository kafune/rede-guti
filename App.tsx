import React, { useEffect, useRef, useState } from 'react';
import {
  Church,
  Evento,
  Municipality,
  Region,
  RegistrationPayload,
  Supporter,
  SupportStatus,
  SUPPORTER_REGISTRATION_TARGET,
  User
} from './types';
import {
  ApiIndication,
  createChurch,
  createIndication,
  createMunicipality,
  createUser,
  deleteIndication,
  fetchChurches,
  fetchIndications,
  fetchMunicipalities,
  getApiErrorMessage,
  isUnauthorized,
  updateIndicationStatus
} from './api';
import Dashboard from './components/Dashboard';
import SupporterForm from './components/SupporterForm';
import SupporterList from './components/SupporterList';
import SupporterDetail from './components/SupporterDetail';
import AdminPanel from './components/AdminPanel';
import ExportPanel from './components/ExportPanel';
import Login from './components/Login';
import MapView from './components/MapView';
import PublicSignup from './components/PublicSignup';
import PublicThanks from './components/PublicThanks';
import EventoList from './components/eventos/EventoList';
import EventoForm from './components/eventos/EventoForm';
import EventoDetail from './components/eventos/EventoDetail';
import PublicEventoIndicacao from './components/PublicEventoIndicacao';
import {
  canAccessManagementPanel,
  canCreateRegistrations,
  canViewSupporterIdentity,
  normalizeUserRole
} from './roleUtils';

const loadStoredUser = (): User | null => {
  const saved = localStorage.getItem('guti_user');
  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved) as User & { role?: string };
    const normalizedRole = normalizeUserRole(parsed.role);
    if (!normalizedRole) {
      localStorage.removeItem('guti_user');
      return null;
    }

    return {
      ...parsed,
      role: normalizedRole
    };
  } catch {
    localStorage.removeItem('guti_user');
    return null;
  }
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadStoredUser());
  const [apiSupporters, setApiSupporters] = useState<Supporter[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<
    'dashboard' | 'form' | 'list' | 'detail' | 'admin' | 'map' | 'export' |
    'eventos' | 'evento-novo' | 'evento-detalhe'
  >('dashboard');
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);
  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);

  const isPublicEventoIndicacao = (hash: string) =>
    hash.startsWith('#/eventos/') && hash.includes('/indicacao');

  const [isPublicRoute, setIsPublicRoute] = useState(() =>
    window.location.hash.startsWith('#/cadastro')
  );
  const [isPublicThanks, setIsPublicThanks] = useState(() =>
    window.location.hash.startsWith('#/obrigado')
  );
  const [isPublicEventoRoute, setIsPublicEventoRoute] = useState(() =>
    isPublicEventoIndicacao(window.location.hash)
  );
  const refreshInFlight = useRef(false);
  const POLL_INTERVAL_MS = 15000;

  const allSupporters = apiSupporters;

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      setIsPublicRoute(hash.startsWith('#/cadastro'));
      setIsPublicThanks(hash.startsWith('#/obrigado'));
      setIsPublicEventoRoute(isPublicEventoIndicacao(hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('guti_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('guti_user');
    localStorage.removeItem('guti_token');
  };

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  };

  const mapApiStatusToSupportStatus = (status?: ApiIndication['status']) => {
    return status === 'INATIVO' ? SupportStatus.INACTIVE : SupportStatus.ACTIVE;
  };

  const mapIndicationToSupporter = (indication: ApiIndication): Supporter => {
    return {
      id: indication.id,
      name: indication.name,
      identityHidden: indication.identityHidden,
      email: indication.email ?? null,
      whatsapp: indication.phone ? normalizePhone(indication.phone) : '',
      church: indication.church?.name ?? '',
      region: 'Interior (outros)' as Region,
      createdAt: indication.createdAt,
      createdBy: indication.createdBy?.id ?? indication.createdById ?? 'system',
      createdByName: indication.createdBy?.name ?? indication.createdBy?.email ?? undefined,
      status: mapApiStatusToSupportStatus(indication.status),
      notes: indication.municipality?.name ?? '',
      indicatedBy: indication.indicatedBy ?? undefined,
      indicatedByUserId: indication.indicatedByUserId ?? undefined,
      indicatedByUser: indication.indicatedByUser ?? undefined,
      hierarchyPath: indication.hierarchyPath
    };
  };

  const fetchAllData = async () => {
    const [indications, churchesData, municipalitiesData] = await Promise.all([
      fetchIndications(),
      fetchChurches(),
      fetchMunicipalities()
    ]);
    return { indications, churchesData, municipalitiesData };
  };

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setDataError(null);
      try {
        const { indications, churchesData, municipalitiesData } = await fetchAllData();
        if (cancelled) return;
        setApiSupporters(indications.map(mapIndicationToSupporter));
        setChurches(churchesData);
        setMunicipalities(municipalitiesData);
      } catch (error) {
        if (isUnauthorized(error)) {
          handleLogout();
          return;
        }

        if (!cancelled) {
          setDataError(getApiErrorMessage(error));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || canViewSupporterIdentity(currentUser.role)) {
      return;
    }

    if (view === 'list' || view === 'detail' || view === 'map') {
      setSelectedSupporter(null);
      setView('dashboard');
    }
  }, [currentUser, view]);

  useEffect(() => {
    if (!currentUser || canCreateRegistrations(currentUser.role)) {
      return;
    }

    if (view === 'form') {
      setView('dashboard');
    }
  }, [currentUser, view]);

  useEffect(() => {
    if (!currentUser || view !== 'map') return;

    let cancelled = false;

    const pollData = async () => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        const { indications, churchesData, municipalitiesData } = await fetchAllData();
        if (cancelled) return;
        setApiSupporters(indications.map(mapIndicationToSupporter));
        setChurches(churchesData);
        setMunicipalities(municipalitiesData);
      } catch (error) {
        if (isUnauthorized(error)) {
          handleLogout();
          return;
        }
      } finally {
        refreshInFlight.current = false;
      }
    };

    pollData();
    const interval = setInterval(pollData, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, view]);

  const ensureChurch = async (name: string) => {
    const trimmed = name.trim();
    const existing = churches.find((church) => church.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const created = await createChurch(trimmed);
    setChurches((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const ensureMunicipality = async (name: string) => {
    const trimmed = name.trim();
    const existing = municipalities.find(
      (municipality) => municipality.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;

    const created = await createMunicipality(trimmed);
    setMunicipalities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const submitRegistration = async (payload: RegistrationPayload) => {
    if (!currentUser) return false;

    if (payload.target === SUPPORTER_REGISTRATION_TARGET) {
      const normalizedPhone = normalizePhone(payload.whatsapp);
      const existing = allSupporters.find((supporter) => supporter.whatsapp === normalizedPhone);
      if (existing) {
        if (!canViewSupporterIdentity(currentUser.role)) {
          alert('Este WhatsApp ja foi cadastrado na sua rede.');
          return false;
        }

        if (confirm('WhatsApp ja cadastrado. Visualizar?')) {
          setSelectedSupporter(existing);
          setView('detail');
        }
        return false;
      }

      try {
        const [church, municipality] = await Promise.all([
          ensureChurch(payload.churchName),
          ensureMunicipality(payload.municipalityName)
        ]);

        const indication = await createIndication({
          name: payload.name.trim(),
          phone: normalizedPhone,
          churchId: church.id,
          municipalityId: municipality.id
        });

        const newSupporter = mapIndicationToSupporter(indication);
        setApiSupporters((prev) => [newSupporter, ...prev]);
        return true;
      } catch (error) {
        if (isUnauthorized(error)) {
          handleLogout();
          return false;
        }

        alert(getApiErrorMessage(error, 'Erro ao salvar indicacao.'));
        return false;
      }
    }

    try {
      await createUser({
        name: payload.name.trim(),
        email: payload.email.trim(),
        password: payload.password,
        role: payload.target
      });
      return true;
    } catch (error) {
      if (isUnauthorized(error)) {
        handleLogout();
        return false;
      }

      alert(getApiErrorMessage(error, 'Erro ao criar acesso.'));
      return false;
    }
  };

  const deleteSupporter = async (id: string) => {
    try {
      await deleteIndication(id);
      setApiSupporters((prev) => prev.filter((supporter) => supporter.id !== id));
      setView('list');
      setSelectedSupporter(null);
    } catch (error) {
      if (isUnauthorized(error)) {
        handleLogout();
        return;
      }

      alert(getApiErrorMessage(error, 'Erro ao excluir indicacao.'));
    }
  };

  const updateSupporter = (updated: Supporter) => {
    setApiSupporters((prev) =>
      prev.map((supporter) => (supporter.id === updated.id ? updated : supporter))
    );
    setSelectedSupporter((prev) => (prev?.id === updated.id ? updated : prev));
  };

  const changeSupporterStatus = async (
    supporterId: string,
    status: SupportStatus.ACTIVE | SupportStatus.INACTIVE
  ) => {
    try {
      const updated = mapIndicationToSupporter(await updateIndicationStatus(supporterId, status));
      updateSupporter(updated);
    } catch (error) {
      if (isUnauthorized(error)) {
        handleLogout();
        return;
      }

      throw new Error(getApiErrorMessage(error, 'Erro ao atualizar status do apoiador.'));
    }
  };

  if (isPublicThanks) {
    return <PublicThanks />;
  }

  if (isPublicRoute) {
    return <PublicSignup />;
  }

  if (isPublicEventoRoute) {
    return <PublicEventoIndicacao />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const canOpenManagementPanel = canAccessManagementPanel(currentUser.role);
  const canAccessSupporterDirectory = canViewSupporterIdentity(currentUser.role);
  const canCreateNewEntries = canCreateRegistrations(currentUser.role);
  const canExportData = currentUser.role === 'COORDENADOR';
  const isMapView = view === 'map';
  const mainWidthClass = isMapView ? 'max-w-none w-full px-2 sm:px-4 lg:px-8' : 'max-w-4xl';

  return (
    <div
      className={`min-h-screen md:pl-24 transition-colors duration-500 ${
        isMapView ? 'pb-0' : 'pb-24 md:pb-0'
      }`}
    >
      <header className="fixed top-0 left-0 md:left-24 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b dark:border-gray-800 px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setView('dashboard')}
        >
          <div className="theme-brand-mark w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xl">
            G
          </div>
          <div>
            <h1 className="font-black text-lg leading-none">Rede SP</h1>
            <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase">Guti 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleLogout} className="text-red-500 font-bold text-sm">
            Sair
          </button>
        </div>
      </header>

      <main
        className={`w-full mx-auto ${mainWidthClass} ${
          isMapView
            ? 'mt-16 sm:mt-20 h-[calc(100vh-9rem)] sm:h-[calc(100vh-10rem)] md:h-[calc(100vh-5rem)] overflow-hidden'
            : 'px-4 sm:px-6 py-6 pt-24 sm:pt-28'
        }`}
      >
        {(isLoading || dataError) && (
          <div className="mb-6 space-y-2">
            {isLoading && (
              <div className="px-4 py-3 rounded-2xl bg-blue-50 text-blue-700 text-sm font-semibold">
                Carregando dados do backend...
              </div>
            )}
            {dataError && (
              <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">
                {dataError}
              </div>
            )}
          </div>
        )}

        {view === 'dashboard' && (
          <Dashboard
            supporters={allSupporters}
            currentUser={currentUser}
            onViewList={() => setView('list')}
            onViewSupporter={(supporter) => {
              setSelectedSupporter(supporter);
              setView('detail');
            }}
          />
        )}

        {view === 'form' && canCreateNewEntries && (
          <SupporterForm
            currentUser={currentUser}
            churches={churches}
            municipalities={municipalities}
            onSubmit={submitRegistration}
            onCancel={() => setView('dashboard')}
          />
        )}

        {view === 'list' && canAccessSupporterDirectory && (
          <SupporterList
            supporters={allSupporters}
            user={currentUser}
            municipalities={municipalities}
            onSelect={(supporter) => {
              setSelectedSupporter(supporter);
              setView('detail');
            }}
          />
        )}

        {view === 'map' && canAccessSupporterDirectory && (
          <MapView
            supporters={allSupporters}
            onSelectSupporter={(supporter) => {
              setSelectedSupporter(supporter);
              setView('detail');
            }}
          />
        )}

        {view === 'detail' && canAccessSupporterDirectory && selectedSupporter && (
          <SupporterDetail
            supporter={selectedSupporter}
            allSupporters={allSupporters}
            user={currentUser}
            onStatusChange={changeSupporterStatus}
            onDelete={deleteSupporter}
            onBack={() => setView('list')}
          />
        )}

        {view === 'admin' && canOpenManagementPanel && (
          <AdminPanel
            supporters={allSupporters}
            onImport={(data) => setApiSupporters((prev) => [...data, ...prev])}
            currentUser={currentUser}
            churches={churches}
            municipalities={municipalities}
            onSubmitRegistration={submitRegistration}
          />
        )}

        {view === 'export' && canExportData && (
          <ExportPanel supporters={allSupporters} />
        )}

        {view === 'eventos' && (
          <EventoList
            currentUser={currentUser}
            onSelect={(evento: Evento) => {
              setSelectedEventoId(evento.id);
              setView('evento-detalhe');
            }}
            onNovo={() => setView('evento-novo')}
            onLogout={handleLogout}
          />
        )}

        {view === 'evento-novo' && currentUser.role === 'COORDENADOR' && (
          <EventoForm
            onSave={() => setView('eventos')}
            onCancel={() => setView('eventos')}
            onLogout={handleLogout}
          />
        )}

        {view === 'evento-detalhe' && selectedEventoId && (
          <EventoDetail
            eventoId={selectedEventoId}
            currentUser={currentUser}
            onBack={() => setView('eventos')}
            onLogout={handleLogout}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex justify-around items-center h-20 md:hidden px-4">
        <button
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center ${view === 'dashboard' ? 'text-blue-600' : 'opacity-30'}`}
        >
          <i className="fa-solid fa-chart-line text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Dashboard</span>
        </button>
        {canAccessSupporterDirectory && (
          <button
            onClick={() => setView('list')}
            className={`flex flex-col items-center ${view === 'list' ? 'text-blue-600' : 'opacity-30'}`}
          >
            <i className="fa-solid fa-users text-xl mb-1"></i>
            <span className="text-[9px] font-black uppercase">Apoiadores</span>
          </button>
        )}
        {canCreateNewEntries && (
          <div className="relative -top-10">
            <button
              onClick={() => setView('form')}
              className="theme-brand-mark w-16 h-16 rounded-[1.75rem] flex items-center justify-center text-3xl transition-transform active:scale-90"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
        )}
        {canAccessSupporterDirectory && (
          <button
            onClick={() => setView('map')}
            className={`flex flex-col items-center ${view === 'map' ? 'text-blue-600' : 'opacity-30'}`}
          >
            <i className="fa-solid fa-map-location-dot text-xl mb-1"></i>
            <span className="text-[9px] font-black uppercase">Mapa</span>
          </button>
        )}
        {canOpenManagementPanel && (
          <button
            onClick={() => setView('admin')}
            className={`flex flex-col items-center ${view === 'admin' ? 'text-blue-600' : 'opacity-30'}`}
          >
            <i className="fa-solid fa-sitemap text-xl mb-1"></i>
            <span className="text-[9px] font-black uppercase">Rede</span>
          </button>
        )}
        {canExportData && (
          <button
            onClick={() => setView('export')}
            className={`flex flex-col items-center ${view === 'export' ? 'text-blue-600' : 'opacity-30'}`}
          >
            <i className="fa-solid fa-file-export text-xl mb-1"></i>
            <span className="text-[9px] font-black uppercase">Exportar</span>
          </button>
        )}
        <button
          onClick={() => setView('eventos')}
          className={`flex flex-col items-center ${['eventos', 'evento-novo', 'evento-detalhe'].includes(view) ? 'text-blue-600' : 'opacity-30'}`}
        >
          <i className="fa-solid fa-calendar-days text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Eventos</span>
        </button>
      </nav>

      <nav className="hidden md:flex fixed top-0 left-0 bottom-0 w-24 bg-white dark:bg-gray-900 border-r dark:border-gray-800 z-50 flex-col items-center pt-28 gap-8">
        <button
          onClick={() => setView('dashboard')}
          className={`p-4 rounded-2xl transition-all ${
            view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
          }`}
          title="Dashboard"
        >
          <i className="fa-solid fa-chart-line text-xl"></i>
        </button>
        {canAccessSupporterDirectory && (
          <button
            onClick={() => setView('list')}
            className={`p-4 rounded-2xl transition-all ${
              view === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
            }`}
            title="Apoiadores"
          >
            <i className="fa-solid fa-users text-xl"></i>
          </button>
        )}
        {canCreateNewEntries && (
          <button
            onClick={() => setView('form')}
            className={`p-4 rounded-2xl transition-all ${
              view === 'form' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
            }`}
            title="Novo Cadastro"
          >
            <i className="fa-solid fa-plus text-xl"></i>
          </button>
        )}
        {canAccessSupporterDirectory && (
          <button
            onClick={() => setView('map')}
            className={`p-4 rounded-2xl transition-all ${
              view === 'map' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
            }`}
            title="Mapa"
          >
            <i className="fa-solid fa-map-location-dot text-xl"></i>
          </button>
        )}
        {canOpenManagementPanel && (
          <button
            onClick={() => setView('admin')}
            className={`p-4 rounded-2xl transition-all ${
              view === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
            }`}
            title="Rede"
          >
            <i className="fa-solid fa-sitemap text-xl"></i>
          </button>
        )}
        {canExportData && (
          <button
            onClick={() => setView('export')}
            className={`p-4 rounded-2xl transition-all ${
              view === 'export' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
            }`}
            title="Exportar"
          >
            <i className="fa-solid fa-file-export text-xl"></i>
          </button>
        )}
        <button
          onClick={() => setView('eventos')}
          className={`p-4 rounded-2xl transition-all ${
            ['eventos', 'evento-novo', 'evento-detalhe'].includes(view)
              ? 'bg-blue-600 text-white shadow-lg'
              : 'opacity-30'
          }`}
          title="Eventos"
        >
          <i className="fa-solid fa-calendar-days text-xl"></i>
        </button>
      </nav>
    </div>
  );
};

export default App;
