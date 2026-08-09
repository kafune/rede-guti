import React, { useEffect, useMemo, useState } from 'react';
import { Equipe, Igreja, IgrejaFormData, User } from '../../types';
import { fetchEquipes, getApiErrorMessage } from '../../api';
import ShareLinkQrCode from '../ShareLinkQrCode';
import ChurchForm from './ChurchForm';
import { exportIgrejasToCSV } from './churchCsv';
import { useChurches } from './useChurches';

interface Props {
  currentUser: User;
}

type Tab = 'lista' | 'cadastro';

const getCadastroLink = (equipeId: string) => {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/igrejas/cadastro?equipe=${equipeId}`;
};

const IgrejasPanel: React.FC<Props> = ({ currentUser }) => {
  const { churches, loading, error, addChurch, updateChurch, deleteChurch } = useChurches();

  const [tab, setTab] = useState<Tab>('lista');
  const [editing, setEditing] = useState<Igreja | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Equipes p/ o gerador de link de autocadastro.
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [linkEquipeId, setLinkEquipeId] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    fetchEquipes()
      .then(setEquipes)
      .catch(() => setEquipes([]));
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return churches;
    return churches.filter((c) =>
      [c.nome, c.denominacao, c.pastor, c.bairro, c.cidade, c.endereco]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [churches, search]);

  const handleCreate = async (data: IgrejaFormData) => {
    await addChurch(data);
    flash('Igreja cadastrada com sucesso!');
    setTab('lista');
  };

  const handleUpdate = async (data: IgrejaFormData) => {
    if (!editing) return;
    await updateChurch(editing.id, data);
    flash('Igreja atualizada com sucesso!');
    setEditing(null);
  };

  const handleDelete = async (igreja: Igreja) => {
    if (!confirm(`Excluir a igreja "${igreja.nome}"?`)) return;
    try {
      await deleteChurch(igreja.id);
      flash('Igreja excluída.');
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Não foi possível excluir a igreja.'));
    }
  };

  const handleCopy = async () => {
    if (!linkEquipeId) return;
    await navigator.clipboard.writeText(getCadastroLink(linkEquipeId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabBtn = (id: Tab, label: string, icon: string) => (
    <button
      onClick={() => {
        setTab(id);
        setEditing(null);
      }}
      className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
        tab === id ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'opacity-40'
      }`}
    >
      <i className={`fa-solid ${icon} mr-1`}></i> {label}
    </button>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <i className="fa-solid fa-church text-blue-500"></i> Igrejas
        </h2>
        <p className="text-sm opacity-60">
          Cadastro de igrejas para mapeamento e mobilização — com autocadastro por link de equipe.
        </p>
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
          <i className="fa-solid fa-circle-check"></i> {notice}
        </div>
      )}
      {(error || actionError) && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-between">
          <span>{error || actionError}</span>
          <button onClick={() => setActionError(null)} className="opacity-60 hover:opacity-100">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
        {tabBtn('lista', 'Lista', 'fa-list')}
        {tabBtn('cadastro', 'Cadastrar', 'fa-plus')}
      </div>

      {/* Editando: abre o form no lugar da lista */}
      {editing && (
        <ChurchForm
          igreja={editing}
          existing={churches}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {tab === 'cadastro' && !editing && (
        <ChurchForm existing={churches} onSubmit={handleCreate} onCancel={() => setTab('lista')} />
      )}

      {tab === 'lista' && !editing && (
        <>
          {/* Link de autocadastro por equipe */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-3">
            <button
              onClick={() => setShowLink((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <span className="text-[10px] font-black uppercase opacity-60 tracking-widest flex items-center gap-2">
                <i className="fa-solid fa-share-nodes text-blue-500"></i> Link de autocadastro por equipe
              </span>
              <i className={`fa-solid ${showLink ? 'fa-chevron-up' : 'fa-chevron-down'} opacity-40`}></i>
            </button>

            {showLink && (
              <div className="space-y-3 pt-1">
                <p className="text-xs opacity-50 font-semibold">
                  Escolha a equipe e compartilhe o link. Toda igreja cadastrada por ele fica
                  vinculada a essa equipe automaticamente (sem exigir login).
                </p>
                {equipes.length === 0 ? (
                  <p className="text-xs opacity-50 font-semibold">
                    Nenhuma equipe cadastrada ainda. Crie uma equipe para gerar o link.
                  </p>
                ) : (
                  <>
                    <select
                      value={linkEquipeId}
                      onChange={(e) => setLinkEquipeId(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    >
                      <option value="">Selecionar equipe...</option>
                      {equipes.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome} — {e.liderNome}
                        </option>
                      ))}
                    </select>
                    {linkEquipeId && (
                      <div className="space-y-2">
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
                          {getCadastroLink(linkEquipeId)}
                        </div>
                        <button
                          onClick={handleCopy}
                          className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
                            copied ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-blue-600 text-white shadow-lg'
                          }`}
                        >
                          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                          {copied ? 'Link copiado!' : 'Copiar link'}
                        </button>
                        <ShareLinkQrCode
                          url={getCadastroLink(linkEquipeId)}
                          ownerName={`igrejas-${equipes.find((e) => e.id === linkEquipeId)?.nome ?? ''}`}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Busca + exportar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, bairro, pastor..."
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm shadow-sm"
              />
            </div>
            <button
              onClick={() => exportIgrejasToCSV(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-40"
            >
              <i className="fa-solid fa-file-csv"></i> Exportar CSV
            </button>
          </div>

          {loading && <p className="text-sm opacity-60">Carregando igrejas...</p>}

          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center opacity-50 flex flex-col items-center gap-3">
              <i className="fa-solid fa-church text-4xl"></i>
              <p className="font-bold text-sm">
                {churches.length === 0 ? 'Nenhuma igreja cadastrada ainda.' : 'Nenhuma igreja encontrada.'}
              </p>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-3">
            {filtered.map((igreja) => (
              <div
                key={igreja.id}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-black text-base truncate">{igreja.nome}</h4>
                    <p className="text-xs opacity-60 font-semibold truncate">
                      {[igreja.denominacao, igreja.bairro, igreja.cidade].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {igreja.origem === 'public' && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase">
                        Público
                      </span>
                    )}
                    <button
                      onClick={() => setEditing(igreja)}
                      className="w-9 h-9 rounded-xl opacity-40 hover:opacity-100 hover:text-blue-600 transition-all"
                      title="Editar"
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(igreja)}
                      className="w-9 h-9 rounded-xl opacity-40 hover:opacity-100 hover:text-red-500 transition-all"
                      title="Excluir"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>

                <div className="text-xs opacity-70 space-y-0.5 font-semibold">
                  {igreja.pastor && (
                    <p><i className="fa-solid fa-user mr-1 opacity-50"></i>{igreja.pastor}</p>
                  )}
                  {igreja.endereco && (
                    <p><i className="fa-solid fa-location-dot mr-1 opacity-50"></i>{igreja.endereco}</p>
                  )}
                  {(igreja.telefone || igreja.email) && (
                    <p>
                      {igreja.telefone && <span><i className="fa-solid fa-phone mr-1 opacity-50"></i>{igreja.telefone}</span>}
                      {igreja.telefone && igreja.email && <span className="mx-1 opacity-30">·</span>}
                      {igreja.email && <span>{igreja.email}</span>}
                    </p>
                  )}
                  {(igreja.zonaEleitoral != null || igreja.membrosEstimados != null) && (
                    <p className="flex flex-wrap gap-2 pt-0.5">
                      {igreja.zonaEleitoral != null && (
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-900 text-[10px] font-black uppercase">
                          Zona {igreja.zonaEleitoral}
                        </span>
                      )}
                      {igreja.membrosEstimados != null && (
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-900 text-[10px] font-black uppercase">
                          ~{igreja.membrosEstimados} membros
                        </span>
                      )}
                    </p>
                  )}
                  {igreja.equipes.length > 0 && (
                    <p className="pt-0.5">
                      <i className="fa-solid fa-car-side mr-1 opacity-50"></i>
                      {igreja.equipes.map((e) => e.equipeNome).join(', ')}
                    </p>
                  )}
                  {(igreja.liderancaLabel || igreja.createdByNome) && (
                    <p className="pt-0.5">
                      <i className="fa-solid fa-user-tie mr-1 opacity-50"></i>
                      Liderança: {igreja.liderancaLabel || igreja.createdByNome}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default IgrejasPanel;
