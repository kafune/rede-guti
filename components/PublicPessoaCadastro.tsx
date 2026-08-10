import React, { useEffect, useRef, useState } from 'react';
import { BRAND } from '../branding';
import { PessoaPublica } from '../types';
import { fetchPublicPessoa, getApiErrorMessage, submitPublicPessoaCadastro } from '../api';
import { onlyDigits } from './equipes/equipeShared';
import { parsePessoaCadastroHash, pessoaTipoLabel } from './equipes/pessoaShared';

const MAX_DOCUMENTOS = 6;

const TIPOS_DOCUMENTO = [
  'RG / CNH (frente)',
  'RG / CNH (verso)',
  'CPF',
  'Comprovante de residência',
  'Título de eleitor',
  'Outro documento'
];

interface Draft {
  nomeCompleto: string;
  cpf: string;
  rg: string;
  dataNascimento: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  observacoes: string;
  consentimento: boolean;
}

interface DocumentoDraft {
  tipo: string;
  imagemUrl: string;
}

const emptyDraft = (): Draft => ({
  nomeCompleto: '',
  cpf: '',
  rg: '',
  dataNascimento: '',
  telefone: '',
  email: '',
  cep: '',
  endereco: '',
  bairro: '',
  cidade: '',
  observacoes: '',
  consentimento: false
});

const formatCpf = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  let out = d.slice(0, 3);
  if (d.length > 3) out += `.${d.slice(3, 6)}`;
  if (d.length > 6) out += `.${d.slice(6, 9)}`;
  if (d.length > 9) out += `-${d.slice(9, 11)}`;
  return out;
};

const formatCep = (value: string) => {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// Redimensiona a foto no cliente para um JPEG leve em data URL (igual às visitas).
const resizeImage = (file: File, maxDim = 1400, quality = 0.72): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const inputClass =
  'w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm';
const labelClass = 'block text-[10px] font-black uppercase tracking-widest opacity-40 mb-1';

const PublicPessoaCadastro: React.FC = () => {
  const { equipeId, pessoa } = parsePessoaCadastroHash(window.location.hash);

  const [info, setInfo] = useState<PessoaPublica | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [documentos, setDocumentos] = useState<DocumentoDraft[]>([]);
  const [tipoDoc, setTipoDoc] = useState(TIPOS_DOCUMENTO[0]);
  const [fotoLoading, setFotoLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prefill = (p: PessoaPublica) => {
    const c = p.cadastro;
    setDraft({
      nomeCompleto: c?.nomeCompleto || p.nomeIndicado || '',
      cpf: c?.cpf || '',
      rg: c?.rg || '',
      dataNascimento: c?.dataNascimento || '',
      telefone: c?.telefone || p.telefone || '',
      email: c?.email || '',
      cep: c?.cep || '',
      endereco: c?.endereco || '',
      bairro: c?.bairro || '',
      cidade: c?.cidade || '',
      observacoes: c?.observacoes || '',
      consentimento: c?.consentimento ?? false
    });
  };

  useEffect(() => {
    if (!equipeId || !pessoa) {
      setLoadError('Link inválido. Solicite um novo link à coordenação.');
      setLoading(false);
      return;
    }
    fetchPublicPessoa(equipeId, pessoa)
      .then((p) => {
        setInfo(p);
        prefill(p);
      })
      .catch((err) => setLoadError(getApiErrorMessage(err, 'Cadastro não encontrado.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId, pessoa]);

  const setField = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const handleFoto = async (file: File | undefined) => {
    if (!file) return;
    if (documentos.length >= MAX_DOCUMENTOS) {
      setSubmitError(`Máximo de ${MAX_DOCUMENTOS} documentos.`);
      return;
    }
    setFotoLoading(true);
    setSubmitError(null);
    try {
      const imagemUrl = await resizeImage(file);
      setDocumentos((prev) => [...prev, { tipo: tipoDoc, imagemUrl }]);
    } catch {
      setSubmitError('Não foi possível processar a foto. Tente outra.');
    } finally {
      setFotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDocumento = (index: number) =>
    setDocumentos((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;

    if (draft.nomeCompleto.trim().length < 2) {
      setSubmitError('Informe o nome completo.');
      return;
    }
    const cpfDigits = onlyDigits(draft.cpf);
    if (cpfDigits && cpfDigits.length !== 11) {
      setSubmitError('CPF deve ter 11 dígitos.');
      return;
    }
    if (!draft.consentimento) {
      setSubmitError('É necessário aceitar o termo de participação para concluir.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitPublicPessoaCadastro(info.equipeId, pessoa, {
        nomeCompleto: draft.nomeCompleto.trim(),
        cpf: cpfDigits || undefined,
        rg: draft.rg.trim() || undefined,
        dataNascimento: draft.dataNascimento || undefined,
        telefone: draft.telefone.trim() || undefined,
        email: draft.email.trim() || undefined,
        cep: onlyDigits(draft.cep) || undefined,
        endereco: draft.endereco.trim() || undefined,
        bairro: draft.bairro.trim() || undefined,
        cidade: draft.cidade.trim() || undefined,
        observacoes: draft.observacoes.trim() || undefined,
        consentimento: draft.consentimento,
        documentos: documentos.map((d) => ({ tipo: d.tipo, imagemUrl: d.imagemUrl }))
      });
      setDocumentos([]);
      setSucesso(true);
      // Recarrega para refletir os documentos já enviados e o cadastro salvo.
      const atualizado = await fetchPublicPessoa(info.equipeId, pessoa).catch(() => null);
      if (atualizado) {
        setInfo(atualizado);
        prefill(atualizado);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Erro ao enviar o cadastro.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{loadError ?? 'Cadastro não encontrado.'}</p>
      </div>
    );
  }

  const jaEnviados = info.cadastro?.documentos ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center mb-2">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">{BRAND.publicHeader}</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Cadastro individual</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <i className={`fa-solid ${info.tipo === 'MOTORISTA' ? 'fa-id-card' : 'fa-user'}`}></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
              {pessoaTipoLabel(info.tipo)}
            </span>
          </div>
          <h2 className="font-black text-lg leading-tight">{info.nomeIndicado}</h2>
          <p className="text-sm opacity-60 font-semibold mt-1">
            Equipe {info.equipeNome} · Liderança {info.liderNome}
          </p>
          <p className="text-xs opacity-50 font-semibold mt-2">
            Confirme seus dados pessoais, aceite o termo de participação e envie as fotos dos seus
            documentos. Isso conclui o seu cadastro na equipe.
          </p>
        </div>

        {sucesso && (
          <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
            <i className="fa-solid fa-circle-check"></i> Cadastro enviado com sucesso! Obrigado.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4"
        >
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Dados pessoais</p>

          {submitError && (
            <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
              {submitError}
            </div>
          )}

          <div>
            <label className={labelClass}>Nome completo *</label>
            <input
              type="text"
              className={inputClass}
              value={draft.nomeCompleto}
              onChange={(e) => setField('nomeCompleto', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>CPF</label>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                placeholder="000.000.000-00"
                value={formatCpf(draft.cpf)}
                onChange={(e) => setField('cpf', onlyDigits(e.target.value).slice(0, 11))}
              />
            </div>
            <div>
              <label className={labelClass}>RG</label>
              <input
                type="text"
                className={inputClass}
                value={draft.rg}
                onChange={(e) => setField('rg', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Nascimento</label>
              <input
                type="date"
                className={inputClass}
                value={draft.dataNascimento}
                onChange={(e) => setField('dataNascimento', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input
                type="tel"
                className={inputClass}
                placeholder="(11) 99999-9999"
                value={draft.telefone}
                onChange={(e) => setField('telefone', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>E-mail</label>
            <input
              type="email"
              className={inputClass}
              placeholder="seu@email.com"
              value={draft.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>CEP</label>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                placeholder="00000-000"
                value={formatCep(draft.cep)}
                onChange={(e) => setField('cep', onlyDigits(e.target.value).slice(0, 8))}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Endereço (rua, número)</label>
              <input
                type="text"
                className={inputClass}
                value={draft.endereco}
                onChange={(e) => setField('endereco', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Bairro</label>
              <input
                type="text"
                className={inputClass}
                value={draft.bairro}
                onChange={(e) => setField('bairro', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Cidade</label>
              <input
                type="text"
                className={inputClass}
                value={draft.cidade}
                onChange={(e) => setField('cidade', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Algo que a coordenação deva saber (opcional)"
              value={draft.observacoes}
              onChange={(e) => setField('observacoes', e.target.value)}
            />
          </div>

          {/* Documentos */}
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
              Fotos de documentos
            </p>

            {jaEnviados.length > 0 && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <i className="fa-solid fa-paperclip mr-1"></i>
                {jaEnviados.length} documento(s) já enviado(s):{' '}
                {jaEnviados.map((d) => d.tipo).join(', ')}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <select
                value={tipoDoc}
                onChange={(e) => setTipoDoc(e.target.value)}
                className={`${inputClass} col-span-2`}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label
                className={`flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-widest rounded-2xl cursor-pointer active:scale-95 transition-transform ${
                  documentos.length >= MAX_DOCUMENTOS
                    ? 'bg-gray-100 dark:bg-gray-900 opacity-40 cursor-not-allowed'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {fotoLoading ? (
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                ) : (
                  <>
                    <i className="fa-solid fa-camera"></i> Foto
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={documentos.length >= MAX_DOCUMENTOS || fotoLoading}
                  onChange={(e) => handleFoto(e.target.files?.[0])}
                />
              </label>
            </div>

            {documentos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {documentos.map((doc, index) => (
                  <div key={index} className="relative w-20 text-center">
                    <img
                      src={doc.imagemUrl}
                      alt={doc.tipo}
                      className="w-20 h-20 rounded-xl object-cover border dark:border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => removeDocumento(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs active:scale-95"
                      title="Remover"
                      aria-label="Remover documento"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                    <span className="block text-[8px] font-bold opacity-50 mt-0.5 leading-tight truncate">
                      {doc.tipo}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] opacity-40 ml-1">
              Você pode enviar agora ou voltar depois neste mesmo link para anexar mais documentos.
            </p>
          </div>

          {/* Termo de participação */}
          <label className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 w-5 h-5 accent-blue-600 shrink-0"
              checked={draft.consentimento}
              onChange={(e) => setField('consentimento', e.target.checked)}
            />
            <span className="text-[11px] leading-snug opacity-80">
              Declaro que li e concordo em participar do trabalho da equipe{' '}
              <b>{info.equipeNome}</b> (liderança {info.liderNome}) e autorizo o uso dos meus dados
              pessoais e das fotos dos documentos enviados para fins de cadastro e organização das
              equipes.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !draft.consentimento}
            className="w-full bg-blue-600 text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Enviando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-check"></i>
                {info.cadastro ? 'Atualizar meu cadastro' : 'Concluir meu cadastro'}
              </span>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">{BRAND.publicHeader}</p>
      </div>
    </div>
  );
};

export default PublicPessoaCadastro;
