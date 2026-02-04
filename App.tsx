
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Church, Municipality, Region, Supporter, SupportStatus, SupporterType, User, UserRole } from './types';
import {
  ApiIndication,
  createChurch,
  createIndication,
  createMunicipality,
  deleteIndication,
  fetchChurches,
  fetchIndications,
  fetchMunicipalities,
  getApiErrorMessage,
  isUnauthorized
} from './api';
import Dashboard from './components/Dashboard';
import SupporterForm from './components/SupporterForm';
import SupporterList from './components/SupporterList';
import SupporterDetail from './components/SupporterDetail';
import PastorForm from './components/PastorForm';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import MapView from './components/MapView';
import PublicSignup from './components/PublicSignup';
import PublicThanks from './components/PublicThanks';

const LOCAL_PASTORS_KEY = 'guti_local_pastors';

const loadLocalPastors = (): Supporter[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_PASTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Supporter[])
      .filter(Boolean)
      .map((item) => ({
        ...item,
        type: item.type ? SupporterType.PASTOR,
        status: item.status ? SupportStatus.ACTIVE,
        createdAt: item.createdAt ? new Date().toISOString()
      }));
  } catch {
    return [];
  }
};

const saveLocalPastors = (pastors: Supporter[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_PASTORS_KEY, JSON.stringify(pastors));
};

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `pastor-${crypto.randomUUID()}`;
  }
  return `pastor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const mergeSupporters = (localPastors: Supporter[], apiSupporters: Supporter[]) => {
  return [...localPastors, ...apiSupporters].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('guti_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [apiSupporters, setApiSupporters] = useState<Supporter[]>([]);
  const [localPastors, setLocalPastors] = useState<Supporter[]>(() => loadLocalPastors());
  const [churches, setChurches] = useState<Church[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [view, setView] = useState<'dashboard' | 'form' | 'pastor-form' | 'list' | 'detail' | 'admin' | 'map'>('dashboard');
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isPublicRoute, setIsPublicRoute] = useState(() => window.location.hash.startsWith('#/cadastro'));
  const [isPublicThanks, setIsPublicThanks] = useState(() => window.location.hash.startsWith('#/obrigado'));
  const refreshInFlight = useRef(false);
  const POLL_INTERVAL_MS = 15000;

  const allSupporters = useMemo(
    () => mergeSupporters(localPastors, apiSupporters),
    [localPastors, apiSupporters]
  );

  

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      setIsPublicRoute(hash.startsWith('#/cadastro'));
      setIsPublicThanks(hash.startsWith('#/obrigado'));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    saveLocalPastors(localPastors);
  }, [localPastors]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('guti_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('guti_user');
    localStorage.removeItem('guti_token');
  };

  const mapIndicationToSupporter = (indication: ApiIndication): Supporter => {
    return {
      id: indication.id,
      name: indication.name,
      whatsapp: indication.phone ? normalizePhone(indication.phone) : '',
      church: indication.church?.name ? '',
      region: 'Interior (outros)' as Region,
      createdAt: indication.createdAt,
      createdBy: indication.createdBy?.id ? indication.createdById ? 'system',
      status: SupportStatus.ACTIVE,
      notes: indication.municipality?.name ? '',
      indicatedBy: indication.indicatedBy,
      type: SupporterType.SUPPORTER
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
    if (!currentUser) return;
    const shouldPoll = view === 'map';
    if (!shouldPoll) return;

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

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  };

  const ensureChurch = async (name: string) => {
    const trimmed = name.trim();
    const existing = churches.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const created = await createChurch(trimmed);
    setChurches((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const ensureMunicipality = async (name: string) => {
    const trimmed = name.trim();
    const existing = municipalities.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const created = await createMunicipality(trimmed);
    setMunicipalities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const addSupporter = async (data: {
    name: string;
    whatsapp: string;
    churchName: string;
    municipalityName: string;
    indicatedBy?: string;
  }) => {
    if (!currentUser) return false;

    const normalizedPhone = normalizePhone(data.whatsapp);
    const existing = allSupporters.find(s => s.whatsapp === normalizedPhone);
    if (existing) {
      if (confirm('WhatsApp já cadastrado. Visualizar?')) {
        setSelectedSupporter(existing);
        setView('detail');
      }
      return false;
    }

    try {
      const [church, municipality] = await Promise.all([
        ensureChurch(data.churchName),
        ensureMunicipality(data.municipalityName)
      ]);

      const indication = await createIndication({
        name: data.name.trim(),
        phone: normalizedPhone,
        indicatedBy: data.indicatedBy?.trim() || 'Cadastro direto',
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
      alert(getApiErrorMessage(error, 'Erro ao salvar indicação.'));
      return false;
    }
  };

  const addPastor = (data: Partial<Supporter>) => {
    if (!currentUser) return false;

    const normalizedPhone = data.whatsapp ? normalizePhone(data.whatsapp) : '';
    if (!normalizedPhone) {
      alert('WhatsApp inválido.');
      return false;
    }

    const existing = allSupporters.find(s => s.whatsapp === normalizedPhone);
    if (existing) {
      if (confirm('WhatsApp já cadastrado. Visualizar?')) {
        setSelectedSupporter(existing);
        setView('detail');
      }
      return false;
    }

    const referrer = data.referredBy ? allSupporters.find(s => s.id === data.referredBy) : undefined;
    const createdAt = new Date().toISOString();
    const municipalityNote = data.notes ? (data as { municipality?: string }).municipality ? '';
    const newPastor: Supporter = {
      id: createLocalId(),
      name: (data.name ? '').trim(),
      whatsapp: normalizedPhone,
      church: (data.church ? '').trim(),
      region: (data.region ? 'Interior (outros)') as Region,
      createdAt,
      createdBy: currentUser.id,
      status: SupportStatus.ACTIVE,
      notes: municipalityNote,
      photo: data.photo,
      type: SupporterType.PASTOR,
      birthDate: data.birthDate,
      cpf: data.cpf,
      churchDenomination: data.churchDenomination,
      isMainBranch: data.isMainBranch,
      ministryRole: data.ministryRole,
      churchAddress: data.churchAddress,
      churchCNPJ: data.churchCNPJ,
      churchSocialMedia: data.churchSocialMedia,
      churchMembersCount: data.churchMembersCount,
      hasSocialProjects: data.hasSocialProjects,
      socialProjectsDescription: data.socialProjectsDescription,
      referredBy: data.referredBy,
      indicatedBy: referrer?.name || 'Cadastro Pastor'
    };

    setLocalPastors((prev) => [newPastor, ...prev]);
    setSelectedSupporter(newPastor);
    setView('detail');
    return true;
  };

  const deleteSupporter = async (id: string) => {
    if (id.startsWith('pastor-')) {
      setLocalPastors((prev) => prev.filter(s => s.id !== id));
      setView('list');
      setSelectedSupporter(null);
      return;
    }
    try {
      await deleteIndication(id);
      setApiSupporters((prev) => prev.filter(s => s.id !== id));
      setView('list');
      setSelectedSupporter(null);
    } catch (error) {
      if (isUnauthorized(error)) {
        handleLogout();
        return;
      }
      alert(getApiErrorMessage(error, 'Erro ao excluir indicação.'));
    }
  };

  if (isPublicThanks) {
    return <PublicThanks />;
  }

  if (isPublicRoute) {
    return <PublicSignup />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const isMapView = view === 'map';
  const mainWidthClass = isMapView ? 'max-w-none w-full px-2 sm:px-4 lg:px-8' : 'max-w-4xl';

  return (
    <div
      className={`min-h-screen md:pl-24 transition-colors duration-500 ${
        isMapView ? 'pb-0' : 'pb-24 md:pb-0'
      }`}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b dark:border-gray-800 px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/20">G</div>
          <div>
            <h1 className="font-black text-lg leading-none">Rede SP</h1>
            <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase">Guti 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleLogout} className="text-red-500 font-bold text-sm">Sair</button>
        </div>
      </header>

      <main
        className={`w-full mx-auto ${mainWidthClass} ${
          isMapView
            ? 'mt-20 h-[calc(100vh-10rem)] md:h-[calc(100vh-5rem)] overflow-hidden'
            : 'p-6 pt-28'
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
            onViewSupporter={(s) => { setSelectedSupporter(s); setView('detail'); }}
            onAddLeader={() => setView('form')}
            onAddPastor={() => setView('pastor-form')}
          />
        )}
        {view === 'form' && (
          <SupporterForm 
            supporters={allSupporters}
            churches={churches}
            municipalities={municipalities}
            onSave={addSupporter} 
            onCancel={() => setView('dashboard')}
          />
        )}
        {view === 'pastor-form' && (
          <PastorForm 
            supporters={allSupporters}
            onSave={addPastor}
            onCancel={() => setView('dashboard')}
          />
        )}
        {view === 'list' && (
          <SupporterList 
            supporters={allSupporters} 
            user={currentUser}
            municipalities={municipalities}
            onSelect={(s) => { setSelectedSupporter(s); setView('detail'); }} 
          />
        )}
        {view === 'map' && (
          <MapView
            supporters={allSupporters}
            onSelectSupporter={(s) => {
              setSelectedSupporter(s);
              setView('detail');
            }}
          />
        )}
        {view === 'detail' && selectedSupporter && (
          <SupporterDetail 
            supporter={selectedSupporter} 
            allSupporters={allSupporters}
            user={currentUser}
            onUpdate={(updated) => setSelectedSupporter(updated)}
            onDelete={deleteSupporter}
            onBack={() => setView('list')}
          />
        )}
        {view === 'admin' && currentUser.role === UserRole.ADMIN && (
          <AdminPanel 
            supporters={allSupporters}
            onImport={(data) => setApiSupporters((prev) => [...data, ...prev])}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex justify-around items-center h-20 md:hidden px-4">
        <button onClick={() => setView('dashboard')} className={`flex flex-col items-center ${view === 'dashboard' ? 'text-blue-600' : 'opacity-30'}`}>
          <i className="fa-solid fa-chart-line text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Dashboard</span>
        </button>
        <button onClick={() => setView('list')} className={`flex flex-col items-center ${view === 'list' ? 'text-blue-600' : 'opacity-30'}`}>
          <i className="fa-solid fa-users text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Apoiadores</span>
        </button>
        <div className="relative -top-10">
          <button onClick={() => setView('form')} className="w-16 h-16 bg-blue-600 text-white rounded-[1.75rem] shadow-2xl shadow-blue-500/50 flex items-center justify-center text-3xl transition-transform active:scale-90">
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
        <button onClick={() => setView('map')} className={`flex flex-col items-center ${view === 'map' ? 'text-blue-600' : 'opacity-30'}`}>
          <i className="fa-solid fa-map-location-dot text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Mapa</span>
        </button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center ${view === 'admin' ? 'text-blue-600' : 'opacity-30'}`}>
          <i className="fa-solid fa-shield-halved text-xl mb-1"></i>
          <span className="text-[9px] font-black uppercase">Admin</span>
        </button>
      </nav>

      {/* Desktop Nav */}
      <nav className="hidden md:flex fixed top-0 left-0 bottom-0 w-24 bg-white dark:bg-gray-900 border-r dark:border-gray-800 z-50 flex-col items-center pt-28 gap-8">
        <button onClick={() => setView('dashboard')} className={`p-4 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'}`} title="Dashboard"><i className="fa-solid fa-chart-line text-xl"></i></button>
        <button onClick={() => setView('list')} className={`p-4 rounded-2xl transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'}`} title="Apoiadores"><i className="fa-solid fa-users text-xl"></i></button>
        <button
          onClick={() => setView('form')}
          className={`p-4 rounded-2xl transition-all ${
            view === 'form' || view === 'pastor-form' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'
          }`}
          title="Novo Cadastro"
        >
          <i className="fa-solid fa-plus text-xl"></i>
        </button>
        <button onClick={() => setView('map')} className={`p-4 rounded-2xl transition-all ${view === 'map' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'}`} title="Mapa"><i className="fa-solid fa-map-location-dot text-xl"></i></button>
        <button onClick={() => setView('admin')} className={`p-4 rounded-2xl transition-all ${view === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-30'}`} title="Admin"><i className="fa-solid fa-shield-halved text-xl"></i></button>
      </nav>
    </div>
  );
};

export default App;

