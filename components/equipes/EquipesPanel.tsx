import React, { useEffect, useMemo, useState } from 'react';
import { AdminUser, Equipe, User } from '../../types';
import { deleteEquipe, fetchEquipes, fetchUsers, getApiErrorMessage } from '../../api';
import { canManageEquipeValores } from '../../roleUtils';
import ShareLinkQrCode from '../ShareLinkQrCode';
import EquipeCard from './EquipeCard';
import EquipeForm from './EquipeForm';

interface Props {
  currentUser: User;
}

const formatBRLTotal = (total: number) =>
  total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getCadastroLink = (liderId: string) => {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/equipes/cadastro?lider=${liderId}`;
};

const EquipesPanel: React.FC<Props> = ({ currentUser }) => {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [lideres, setLideres] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equipe | null>(null);

  const [linkLiderId, setLinkLiderId] = useState('');
  const [copied, setCopied] = useState(false);

  const isCoordinator = canManageEquipeValores(currentUser.role);

  useEffect(() => {
    let active = true;
    const usersPromise = isCoordinator
      ? fetchUsers().catch(() => [] as AdminUser[])
      : Promise.resolve([] as AdminUser[]);

    Promise.all([fetchEquipes(), usersPromise])
      .then(([list, users]) => {
        if (!active) return;
        setEquipes(list);
        setLideres(
          users
            .filter((u) => u.role === 'LIDER_REGIONAL')
            .map((u) => ({ id: u.id, nome: u.name ?? u.email }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        );
      })
      .catch((err) => active && setError(getApiErrorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isCoordinator]);

  // Visão do coordenador: equipes agrupadas por liderança.
  const grupos = useMemo(() => {
    const map = new Map<string, { liderNome: string; equipes: Equipe[] }>();
    equipes.forEach((e) => {
      const grupo = map.get(e.liderId) ?? { liderNome: e.liderNome, equipes: [] };
      grupo.equipes.push(e);
      map.set(e.liderId, grupo);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.liderNome.localeCompare(b.liderNome, 'pt-BR')
    );
  }, [equipes]);

  const totals = useMemo(() => {
    const valorTotal = equipes.reduce((acc, e) => {
      const parsed = Number(e.valor ?? '');
      return acc + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    const visitasTotal = equipes.reduce((acc, e) => acc + (e.visitasCount ?? 0), 0);
    return { equipes: equipes.length, liderancas: grupos.length, valorTotal, visitasTotal };
  }, [equipes, grupos]);

  const applySaved = (saved: Equipe) => {
    setEquipes((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (equipe: Equipe) => {
    setEditing(equipe);
    setShowForm(true);
  };

  const handleDelete = async (equipe: Equipe) => {
    if (!confirm(`Excluir a equipe "${equipe.nome}"?`)) return;
    try {
      await deleteEquipe(equipe.id);
      setEquipes((prev) => prev.filter((e) => e.id !== equipe.id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir a equipe.'));
    }
  };

  const handleValorSaved = (updated: Equipe) => {
    setEquipes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  // Link de autocadastro: coordenador escolhe a liderança; líder usa o próprio id.
  const activeLinkLiderId = isCoordinator ? linkLiderId : currentUser.id;
  const activeLinkLiderNome = isCoordinator
    ? lideres.find((l) => l.id === linkLiderId)?.nome ?? ''
    : currentUser.name;

  const handleCopyLink = async () => {
    if (!activeLinkLiderId) return;
    await navigator.clipboard.writeText(getCadastroLink(activeLinkLiderId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCard = (equipe: Equipe) => (
    <EquipeCard
      key={equipe.id}
      equipe={equipe}
      canEditValores={isCoordinator}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onValorSaved={handleValorSaved}
    />
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Equipes de Campanha</h2>
          <p className="text-sm opacity-60">
            {isCoordinator
              ? 'Todas as equipes formadas pelas lideranças, para mobilização nas portas das igrejas.'
              : 'Monte suas equipes: 1 motorista com carro próprio + 4 apoiadores.'}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all hover:-translate-y-0.5 inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-plus mr-2"></i>
            Nova equipe
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {showForm && (
        <EquipeForm
          equipe={editing}
          lideres={isCoordinator ? lideres : undefined}
          onSave={applySaved}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {/* Link de autocadastro de equipes de rua */}
      {!showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-share-nodes text-blue-500"></i>
            <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">
              Link de autocadastro de equipes
            </p>
          </div>
          <p className="text-xs opacity-50 font-semibold -mt-1">
            {isCoordinator
              ? 'Escolha a liderança e envie o link. As equipes cadastradas por esse link já ficam vinculadas ao perfil dela.'
              : 'Compartilhe seu link para que suas equipes de rua se cadastrem sozinhas — já vinculadas ao seu perfil.'}
          </p>

          {isCoordinator && (
            <select
              value={linkLiderId}
              onChange={(e) => setLinkLiderId(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            >
              <option value="">Selecionar liderança...</option>
              {lideres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          )}

          {activeLinkLiderId && (
            <div className="space-y-2">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
                {getCadastroLink(activeLinkLiderId)}
              </div>
              <button
                onClick={handleCopyLink}
                className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
                  copied ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-blue-600 text-white shadow-lg'
                }`}
              >
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                {copied ? 'Link copiado!' : 'Copiar link'}
              </button>
              <ShareLinkQrCode
                url={getCadastroLink(activeLinkLiderId)}
                ownerName={activeLinkLiderNome ?? undefined}
              />
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm opacity-60">Carregando equipes...</p>}

      {!loading && equipes.length === 0 && !showForm && (
        <div className="py-16 text-center opacity-50 flex flex-col items-center gap-3">
          <i className="fa-solid fa-car-side text-4xl"></i>
          <p className="font-bold text-sm">
            {isCoordinator
              ? 'Nenhuma equipe cadastrada pelas lideranças ainda.'
              : 'Nenhuma equipe cadastrada ainda. Crie a primeira acima.'}
          </p>
        </div>
      )}

      {/* Resumo (coordenador) */}
      {isCoordinator && equipes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Lideranças</p>
            <p className="text-2xl font-black text-gray-700 dark:text-gray-300">{totals.liderancas}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Equipes</p>
            <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{totals.equipes}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Visitas</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {totals.visitasTotal}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Valor total</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatBRLTotal(totals.valorTotal)}
            </p>
          </div>
        </div>
      )}

      {/* Lista: coordenador agrupada por liderança; líder lista simples */}
      {!loading && equipes.length > 0 && (
        isCoordinator ? (
          <div className="space-y-8">
            {grupos.map((grupo) => (
              <section key={grupo.liderNome} className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                  <i className="fa-solid fa-user-tie"></i>
                  {grupo.liderNome}
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px]">
                    {grupo.equipes.length} {grupo.equipes.length === 1 ? 'equipe' : 'equipes'}
                  </span>
                </h3>
                <div className="grid lg:grid-cols-2 gap-3">{grupo.equipes.map(renderCard)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">{equipes.map(renderCard)}</div>
        )
      )}
    </div>
  );
};

export default EquipesPanel;
