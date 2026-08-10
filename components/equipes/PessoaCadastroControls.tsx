import React, { useState } from 'react';
import { MembroCadastro, MembroCadastroResumo, PessoaTipo } from '../../types';
import {
  buildPessoaCadastroLink,
  buildWhatsappUrl,
  cadastroWhatsappMessage,
  pessoaParam
} from './pessoaShared';

interface Props {
  equipeId: string;
  equipeNome: string;
  tipo: PessoaTipo;
  ordem?: number | null;
  nomeIndicado: string;
  telefone: string;
  resumo: MembroCadastroResumo | null;
  full: MembroCadastro | null;
  loadingFull: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}

const formatCpf = (cpf?: string | null) => {
  const d = (cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf ?? '';
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return '';
  // Aceita 'YYYY-MM-DD' sem virar refém do fuso.
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (iso) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return value;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

const Campo: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{label}</p>
      <p className="text-xs font-semibold break-words">{value}</p>
    </div>
  ) : null;

const chipBase =
  'text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg inline-flex items-center active:scale-95 transition-transform';

const PessoaCadastroControls: React.FC<Props> = ({
  equipeId,
  equipeNome,
  tipo,
  ordem,
  nomeIndicado,
  telefone,
  resumo,
  full,
  loadingFull,
  expanded,
  onToggleExpand
}) => {
  const [copied, setCopied] = useState(false);

  const link = buildPessoaCadastroLink(equipeId, pessoaParam(tipo, ordem));
  const waUrl = buildWhatsappUrl(telefone, cadastroWhatsappMessage(nomeIndicado, equipeNome, link));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem clipboard (contexto inseguro): oferece o link para cópia manual.
      window.prompt('Copie o link de cadastro:', link);
    }
  };

  const endereco = full
    ? [full.endereco, full.bairro, full.cidade, full.cep].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {resumo ? (
          <span
            className={`${chipBase} bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300`}
          >
            <i className="fa-solid fa-user-check mr-1"></i>
            Cadastro enviado
            {resumo.documentosCount > 0 && (
              <span className="ml-1 opacity-80">
                · {resumo.documentosCount} doc{resumo.documentosCount > 1 ? 's' : ''}
              </span>
            )}
          </span>
        ) : (
          <span
            className={`${chipBase} bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400`}
          >
            <i className="fa-solid fa-user-clock mr-1"></i>
            Cadastro pendente
          </span>
        )}

        <button
          type="button"
          onClick={handleCopy}
          title="Copiar link de autocadastro desta pessoa"
          className={`${chipBase} ${
            copied
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30'
              : 'bg-gray-100 dark:bg-gray-900'
          }`}
        >
          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-link'} mr-1`}></i>
          {copied ? 'Link copiado' : 'Link de cadastro'}
        </button>

        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            title="Enviar o link de cadastro por WhatsApp"
            className={`${chipBase} bg-green-600 text-white`}
          >
            <i className="fa-brands fa-whatsapp mr-1"></i>
            Enviar cadastro
          </a>
        )}

        {resumo && (
          <button
            type="button"
            onClick={onToggleExpand}
            className={`${chipBase} bg-gray-100 dark:bg-gray-900`}
          >
            <i className={`fa-solid ${expanded ? 'fa-chevron-up' : 'fa-eye'} mr-1`}></i>
            {expanded ? 'Ocultar dados' : 'Ver dados'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="rounded-xl bg-white dark:bg-gray-900 border dark:border-gray-700 p-3 space-y-3">
          {loadingFull && !full && (
            <p className="text-xs opacity-50 font-semibold">
              <i className="fa-solid fa-circle-notch fa-spin mr-1"></i> Carregando cadastro...
            </p>
          )}

          {full && (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Campo label="Nome completo" value={full.nomeCompleto} />
                <Campo label="CPF" value={formatCpf(full.cpf)} />
                <Campo label="RG" value={full.rg} />
                <Campo label="Nascimento" value={formatDateOnly(full.dataNascimento)} />
                <Campo label="Telefone" value={full.telefone} />
                <Campo label="E-mail" value={full.email} />
                <Campo label="Endereço" value={endereco || undefined} />
                <Campo label="Observações" value={full.observacoes} />
              </div>

              <p
                className={`text-[10px] font-bold ${
                  full.consentimento ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                }`}
              >
                <i
                  className={`fa-solid ${
                    full.consentimento ? 'fa-circle-check' : 'fa-circle-exclamation'
                  } mr-1`}
                ></i>
                {full.consentimento
                  ? `Aceitou o termo de participação${
                      full.consentimentoEm ? ` em ${formatDateTime(full.consentimentoEm)}` : ''
                    }`
                  : 'Ainda não aceitou o termo de participação'}
              </p>

              {full.documentos.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5">
                    Documentos ({full.documentos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {full.documentos.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.imagemUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={doc.tipo}
                        className="w-16 shrink-0 text-center"
                      >
                        <img
                          src={doc.imagemUrl}
                          alt={doc.tipo}
                          className="w-16 h-16 rounded-lg object-cover border dark:border-gray-700"
                        />
                        <span className="block text-[8px] font-bold opacity-50 mt-0.5 leading-tight truncate">
                          {doc.tipo}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[9px] opacity-40 font-semibold">
                Atualizado em {formatDateTime(full.atualizadoEm)}
              </p>
            </>
          )}

          {!loadingFull && !full && (
            <p className="text-xs opacity-50 font-semibold">
              Não foi possível carregar os dados deste cadastro.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PessoaCadastroControls;
