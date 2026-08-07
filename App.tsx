import React, { useEffect, useRef, useState } from 'react';
import { BRAND } from './branding';
import { FEATURES } from './features';
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
import LeaderReportPanel from './components/LeaderReportPanel';
import MetasPanel from './components/metas/MetasPanel';
import EquipesPanel from './components/equipes/EquipesPanel';
import Login from './components/Login';
import MapView from './components/MapView';
import PublicSignup from './components/PublicSignup';
import PublicThanks from './components/PublicThanks';
import EventoList from './components/eventos/EventoList';
import EventoForm from './components/eventos/EventoForm';
import EventoDetail from './components/eventos/EventoDetail';
import PublicEventoIndicacao from './components/PublicEventoIndicacao';
import PublicEventoConfirmacao from './components/PublicEventoConfirmacao';
import PublicAtividadeCadastro from './components/PublicAtividadeCadastro';
import PublicEquipeCadastro from './components/PublicEquipeCadastro';
import PublicEquipeVisita from './components/PublicEquipeVisita';
import PublicIgrejaCadastro from './components/PublicIgrejaCadastro';
import IgrejasPanel from './components/igrejas/IgrejasPanel';
import AtividadesList from './components/atividades/AtividadesList';
import { MensagensPanel } from './components/mensagens/MensagensPanel';
import {
  canAccessEquipes,
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

type AppView = 'dashboard' | 'form' | 'list' | 'detail' | 'admin' | 'map' | 'export' | 'relatorio' |
  'metas' | 'eventos' | 'evento-novo' | 'evento-detalhe' | 'atividades' | 'equipes' | 'igrejas' | 'mensagens';
const persistedAppViews = new Set<AppView>([
  'dashboard', 'form', 'list', 'admin', 'map', 'export', 'relatorio', 'metas',
  'eventos', 'evento-novo', 'atividades', 'equipes', 'igrejas', 'mensagens',
]);
const loadStoredView = (): AppView => {
  const stored = localStorage.getItem('guti_view') as AppView | null;
  return stored && persistedAppViews.has(stored) ? stored : 'dashboard';
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadStoredUser());
  const [apiSupporters, setApiSupporters] = useState<Supporter[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<AppView>(() => loadStoredView());
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);
  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('guti_view', persistedAppViews.has(view) ? view : 'dashboard');
  }, [view]);

  const isPublicEventoIndicacao = (hash: string) =>
    hash.startsWith('#/eventos/') && hash.includes('/indicacao');

  const isPublicEventoConfirmacao = (hash: string) =>
    hash.startsWith('#/eventos/') && hash.includes('/confirmacao');

  const isPublicAtividadeCadastro = (hash: string) =>
    hash.startsWith('#/atividades/cadastro');

  const isPublicEquipeCadastro = (hash: string) => hash.startsWith('#/equipes/cadastro');

  const isPublicEquipeVisita = (hash: string) => hash.startsWith('#/equipes/visita');

  const isPublicIgrejaCadastro = (hash: string) => hash.startsWith('#/igrejas/cadastro');

  const [isPublicRoute, setIsPublicRoute] = useState(() =>
    window.location.hash.startsWith('#/cadastro')
  );
  const [isPublicThanks, setIsPublicThanks] = useState(() =>
    window.location.hash.startsWith('#/obrigado')
  );
  const [isPublicEventoRoute, setIsPublicEventoRoute] = useState(() =>
    isPublicEventoIndicacao(window.location.hash)
  );
  const [isPublicConfirmacaoRoute, setIsPublicConfirmacaoRoute] = useState(() =>
    isPublicEventoConfirmacao(window.location.hash)
  );
  const [isPublicAtividadeRoute, setIsPublicAtividadeRoute] = useState(() =>
    isPublicAtividadeCadastro(window.location.hash)
  );
  const [isPublicEquipeCadastroRoute, setIsPublicEquipeCadastroRoute] = useState(() =>
    isPublicEquipeCadastro(window.location.hash)
  );
  const [isPublicEquipeVisitaRoute, setIsPublicEquipeVisitaRoute] = useState(() =>
    isPublicEquipeVisita(window.location.hash)
  );
  const [isPublicIgrejaCadastroRoute, setIsPublicIgrejaCadastroRoute] = useState(() =>
    isPublicIgrejaCadastro(window.location.hash)
  );
  // Barra inferior (mobile): abre o menu "Mais" com os destinos secundários.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const refreshInFlight = useRef(false);
  // Mapa pede dados quase em tempo real; demais telas se contentam com 60s.
  const MAP_POLL_INTERVAL_MS = 15000;
  const DEFAULT_POLL_INTERVAL_MS = 60000;

  const allSupporters = apiSupporters;

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      setIsPublicRoute(hash.startsWith('#/cadastro'));
      setIsPublicThanks(hash.startsWith('#/obrigado'));
      setIsPublicEventoRoute(isPublicEventoIndicacao(hash));
      setIsPublicConfirmacaoRoute(isPublicEventoConfirmacao(hash));
      setIsPublicAtividadeRoute(isPublicAtividadeCadastro(hash));
      setIsPublicEquipeCadastroRoute(isPublicEquipeCadastro(hash));
      setIsPublicEquipeVisitaRoute(isPublicEquipeVisita(hash));
      setIsPublicIgrejaCadastroRoute(isPublicIgrejaCadastro(hash));
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
    if (!currentUser) {
      return;
    }

    const canDirectory = canViewSupporterIdentity(currentUser.role);
    const leader = currentUser.role === 'LIDER_REGIONAL';

    // O mapa continua restrito a quem enxerga a base completa.
    if (view === 'map' && !canDirectory) {
      setView('dashboard');
      return;
    }

    if (view === 'mensagens' && currentUser.role !== 'COORDENADOR') {
      setView('dashboard');
      return;
    }

    // Lista e detalhe ficam liberados para quem vê a base OU para a liderança
    // (que enxerga apenas os apoiadores do próprio link, em modo leitura).
    if ((view === 'list' || view === 'detail') && !canDirectory && !leader) {
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
    if (!currentUser) return;

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
    const interval = setInterval(
      pollData,
      view === 'map' ? MAP_POLL_INTERVAL_MS : DEFAULT_POLL_INTERVAL_MS
    );
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
          payload.churchName ? ensureChurch(payload.churchName) : Promise.resolve(null),
          ensureMunicipality(payload.municipalityName)
        ]);

        const indication = await createIndication({
          name: payload.name.trim(),
          phone: normalizedPhone,
          churchId: church?.id,
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
        role: payload.target,
        whatsapp: payload.whatsapp
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

  const handleBulkImport = async (supporters: Supporter[]) => {
    const uniqueChurchNames = [...new Set(supporters.map((s) => s.church).filter(Boolean))];
    const uniqueMunicipalityNames = [...new Set(supporters.map((s) => s.region).filter(Boolean))];

    const churchMap: Record<string, { id: string; name: string }> = {};
    const municipalityMap: Record<string, { id: string; name: string }> = {};

    if (FEATURES.churchFieldEnabled) {
      for (const name of uniqueChurchNames) {
        try { churchMap[name] = await ensureChurch(name); } catch { /* skip */ }
      }
    }
    for (const name of uniqueMunicipalityNames) {
      try { municipalityMap[name] = await ensureMunicipality(name); } catch { /* skip */ }
    }

    const results = await Promise.allSettled(
      supporters.map(async (supporter) => {
        const church = FEATURES.churchFieldEnabled ? churchMap[supporter.church] : undefined;
        const municipality = municipalityMap[supporter.region];
        if ((FEATURES.churchFieldEnabled && !church) || !municipality) {
          throw new Error(
            FEATURES.churchFieldEnabled ? 'Igreja ou município não encontrado' : 'Município não encontrado'
          );
        }
        const indication = await createIndication({
          name: supporter.name.trim(),
          phone: normalizePhone(supporter.whatsapp),
          churchId: church?.id,
          municipalityId: municipality.id
        });
        return mapIndicationToSupporter(indication);
      })
    );

    const created = results
      .filter((r): r is PromiseFulfilledResult<Supporter> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (created.length > 0) {
      setApiSupporters((prev) => [...created, ...prev]);
    }

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      alert(`${created.length} importados. ${failed} não puderam ser salvos (duplicados ou erro de conexão).`);
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

  if (isPublicConfirmacaoRoute) {
    return <PublicEventoConfirmacao />;
  }

  if (isPublicAtividadeRoute) {
    return <PublicAtividadeCadastro />;
  }

  if (isPublicEquipeVisitaRoute) {
    return <PublicEquipeVisita />;
  }

  if (isPublicEquipeCadastroRoute) {
    return <PublicEquipeCadastro />;
  }

  if (isPublicIgrejaCadastroRoute) {
    return <PublicIgrejaCadastro />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const canOpenManagementPanel = canAccessManagementPanel(currentUser.role);
  const canAccessSupporterDirectory = canViewSupporterIdentity(currentUser.role);
  // Liderança regional: pode visualizar (somente leitura) os apoiadores que
  // cadastrou pelo próprio link, mesmo sem acesso à base completa.
  const isLeader = currentUser.role === 'LIDER_REGIONAL';
  const canBrowseSupporters = canAccessSupporterDirectory || isLeader;
  const supporterDirectoryLabel = isLeader ? 'Meus Cadastros' : 'Apoiadores';
  const canCreateNewEntries = canCreateRegistrations(currentUser.role);
  const canExportData = currentUser.role === 'COORDENADOR';
  const canManageEquipes = canAccessEquipes(currentUser.role);
  const isMapView = view === 'map';
  const mainWidthClass = isMapView ? 'max-w-none w-full px-2 sm:px-4 lg:px-8' : 'max-w-4xl';

  // ── Navegação: uma única fonte de verdade para a barra (mobile) e o trilho
  // lateral (desktop). Evita duplicação e mantém tudo responsivo/rolável. ──────
  type NavEntry = {
    id: AppView;
    label: string;
    icon: string; // classe FontAwesome completa
    color?: 'emerald';
    show: boolean;
    active: boolean;
    fab?: boolean; // renderizado como botão central de ação no mobile
  };

  const eventoActive = ['eventos', 'evento-novo', 'evento-detalhe'].includes(view);
  const allNavItems: NavEntry[] = [
    { id: 'dashboard', label: 'Painel', icon: 'fa-solid fa-chart-line', show: true, active: view === 'dashboard' },
    { id: 'list', label: supporterDirectoryLabel, icon: 'fa-solid fa-users', show: canBrowseSupporters, active: view === 'list' },
    { id: 'form', label: 'Cadastrar', icon: 'fa-solid fa-plus', show: canCreateNewEntries, active: view === 'form', fab: true },
    { id: 'map', label: 'Mapa', icon: 'fa-solid fa-map-location-dot', show: canAccessSupporterDirectory, active: view === 'map' },
    { id: 'admin', label: 'Rede', icon: 'fa-solid fa-sitemap', show: canOpenManagementPanel, active: view === 'admin' },
    { id: 'eventos', label: 'Eventos', icon: 'fa-solid fa-calendar-days', show: true, active: eventoActive },
    { id: 'atividades', label: 'Atividades', icon: 'fa-solid fa-clipboard-list', color: 'emerald', show: true, active: view === 'atividades' },
    { id: 'equipes', label: 'Equipes', icon: 'fa-solid fa-car-side', show: canManageEquipes, active: view === 'equipes' },
    { id: 'igrejas', label: 'Igrejas', icon: 'fa-solid fa-church', show: canManageEquipes, active: view === 'igrejas' },
    { id: 'mensagens', label: 'Mensagens', icon: 'fa-brands fa-whatsapp', color: 'emerald', show: canExportData, active: view === 'mensagens' },
    { id: 'metas', label: 'Metas', icon: 'fa-solid fa-bullseye', show: canExportData, active: view === 'metas' },
    { id: 'relatorio', label: 'Relatório', icon: 'fa-solid fa-ranking-star', show: canExportData, active: view === 'relatorio' },
    { id: 'export', label: 'Exportar', icon: 'fa-solid fa-file-export', show: canExportData, active: view === 'export' },
  ];

  const visibleNav = allNavItems.filter((i) => i.show);
  const fabItem = visibleNav.find((i) => i.fab) ?? null;
  const menuItems = visibleNav.filter((i) => !i.fab); // trilho desktop + folha "Mais"

  // Mobile: no máx. 3 destinos diretos na barra; o restante vai para "Mais".
  const mobilePrimary = (['dashboard', 'list', 'map', 'admin', 'eventos', 'atividades'] as AppView[])
    .map((id) => menuItems.find((i) => i.id === id))
    .filter((i): i is NavEntry => Boolean(i))
    .slice(0, 3);
  const mobilePrimaryIds = new Set(mobilePrimary.map((i) => i.id));
  const moreActive = menuItems.some((i) => i.active && !mobilePrimaryIds.has(i.id));
  const mobileLeft = fabItem ? mobilePrimary.slice(0, 2) : mobilePrimary;
  const mobileRight = fabItem ? mobilePrimary.slice(2) : [];

  const activeBg = (item: NavEntry) => (item.color === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600');
  const activeText = (item: NavEntry) => (item.color === 'emerald' ? 'text-emerald-600' : 'text-blue-600');
  const go = (v: AppView) => {
    setView(v);
    setMoreMenuOpen(false);
  };

  const renderMobileTab = (item: NavEntry) => (
    <button
      key={item.id}
      onClick={() => go(item.id)}
      aria-current={item.active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center flex-1 min-w-0 gap-1 px-1 transition-colors ${
        item.active ? activeText(item) : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      <i className={`${item.icon} text-lg leading-none`}></i>
      <span className="text-[10px] font-bold leading-none truncate max-w-full">{item.label}</span>
    </button>
  );

  return (
    <div
      className={`min-h-screen md:pl-24 transition-colors duration-500 ${
        isMapView ? 'pb-0' : 'pb-24 md:pb-0'
      }`}
    >
      <header
        className="fixed top-0 left-0 md:left-24 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b dark:border-gray-800 px-4 sm:px-6 pt-[env(safe-area-inset-top,0px)] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] h-[calc(env(safe-area-inset-top,0px)+4rem)] sm:h-[calc(env(safe-area-inset-top,0px)+5rem)] flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setView('dashboard')}
        >
          <div className="theme-brand-mark w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xl">
            {BRAND.initial}
          </div>
          <div>
            <h1 className="font-black text-lg leading-none">{BRAND.name}</h1>
            <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase">{BRAND.campaign}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="text-red-500 font-bold text-sm px-3 py-2 -mr-2 min-h-[44px] inline-flex items-center justify-center rounded-xl active:bg-red-500/10 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main
        className={`w-full mx-auto ${mainWidthClass} ${
          isMapView
            ? 'mt-[calc(env(safe-area-inset-top,0px)+4rem)] sm:mt-[calc(env(safe-area-inset-top,0px)+5rem)] pb-4 md:pb-0 md:h-[calc(100dvh-5rem-env(safe-area-inset-top,0px))] md:overflow-hidden'
            : 'px-4 sm:px-6 py-6 pt-[calc(env(safe-area-inset-top,0px)+6rem)] sm:pt-[calc(env(safe-area-inset-top,0px)+7rem)]'
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

        {view === 'list' && canBrowseSupporters && (
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

        {view === 'detail' && canBrowseSupporters && selectedSupporter && (
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
            onImport={handleBulkImport}
            currentUser={currentUser}
            churches={churches}
            municipalities={municipalities}
            onSubmitRegistration={submitRegistration}
          />
        )}

        {view === 'export' && canExportData && (
          <ExportPanel supporters={allSupporters} />
        )}

        {view === 'relatorio' && canExportData && (
          <LeaderReportPanel supporters={allSupporters} />
        )}

        {view === 'metas' && canExportData && (
          <MetasPanel municipalities={municipalities} />
        )}

        {view === 'equipes' && canManageEquipes && (
          <EquipesPanel currentUser={currentUser} />
        )}

        {view === 'igrejas' && canManageEquipes && (
          <IgrejasPanel currentUser={currentUser} />
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

        {view === 'evento-novo' && (currentUser.role === 'COORDENADOR' || currentUser.role === 'VERIFICADORA') && (
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

        {view === 'atividades' && (
          <AtividadesList currentUser={currentUser} onLogout={handleLogout} />
        )}

        {view === 'mensagens' && currentUser.role === 'COORDENADOR' && (
          <MensagensPanel />
        )}
      </main>

      {/* ── Barra inferior (mobile): destinos primários + FAB + "Mais" ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t dark:border-gray-800"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)'
        }}
      >
        <div className="flex items-stretch h-16">
          {mobileLeft.map(renderMobileTab)}
          {fabItem && (
            <div className="relative -top-5 flex-shrink-0 w-16 flex items-center justify-center">
              <button
                onClick={() => go(fabItem.id)}
                className="theme-brand-mark w-14 h-14 rounded-[1.5rem] flex items-center justify-center text-2xl text-white shadow-lg transition-transform active:scale-90"
                aria-label="Novo cadastro"
              >
                <i className="fa-solid fa-plus"></i>
              </button>
            </div>
          )}
          {mobileRight.map(renderMobileTab)}
          <button
            onClick={() => setMoreMenuOpen(true)}
            aria-haspopup="true"
            aria-expanded={moreMenuOpen}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 gap-1 px-1 transition-colors ${
              moreActive ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            <i className="fa-solid fa-ellipsis text-lg leading-none"></i>
            <span className="text-[10px] font-bold leading-none">Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Folha "Mais" (mobile): menu completo e rolável ── */}
      {moreMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-up"
            onClick={() => setMoreMenuOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl border-t dark:border-gray-800 shadow-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[80vh] overflow-y-auto no-scrollbar animate-fade-up">
            <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <p className="font-black text-lg">Menu</p>
              <button
                onClick={() => setMoreMenuOpen(false)}
                aria-label="Fechar menu"
                className="w-9 h-9 rounded-xl opacity-50 hover:opacity-100 active:scale-90 transition-all"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-3 min-h-[80px] transition-all active:scale-95 ${
                    item.active
                      ? `${activeBg(item)} text-white shadow-lg`
                      : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <i className={`${item.icon} text-xl`}></i>
                  <span className="text-[11px] font-bold leading-tight text-center">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Trilho lateral (desktop): rolável, com rótulos ── */}
      <nav className="hidden md:flex fixed top-0 left-0 bottom-0 w-24 bg-white dark:bg-gray-900 border-r dark:border-gray-800 z-50 flex-col items-center pt-24 pb-6 gap-1.5 overflow-y-auto no-scrollbar [scrollbar-width:none]">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => go(item.id)}
            title={item.label}
            aria-current={item.active ? 'page' : undefined}
            className={`shrink-0 w-16 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${
              item.active
                ? `${activeBg(item)} text-white shadow-lg`
                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <i className={`${item.icon} text-lg`}></i>
            <span className="text-[9px] font-bold uppercase leading-tight tracking-tight text-center">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
