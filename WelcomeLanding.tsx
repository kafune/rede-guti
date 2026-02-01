
import React, { useState } from 'react';

interface Props {
  name: string;
  shareUrl: string;
  onFinish: () => void;
}

const WelcomeLanding: React.FC<Props> = ({ name, shareUrl, onFinish }) => {
  const [copyLabel, setCopyLabel] = useState('Copiar link');
  // Link para o grupo de conexão
  const GROUP_LINK = "https://chat.whatsapp.com/exemplo-grupo-guti";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Link copiado!');
      window.setTimeout(() => setCopyLabel('Copiar link'), 1500);
    } catch {
      setCopyLabel('Nao foi possivel copiar');
      window.setTimeout(() => setCopyLabel('Copiar link'), 1800);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-blue-700 to-blue-900 pt-12 pb-24 px-6 text-center text-white relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-lg mx-auto">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 backdrop-blur-md border border-white/20 shadow-xl">G</div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">Bem-vindo à Família Guti 2026!</h1>
          <p className="text-blue-100 font-medium opacity-80">Olá, <span className="text-white font-bold">{name.split(' ')[0]}</span>! Seu cadastro foi realizado com sucesso.</p>
        </div>
      </div>

      {/* Video Section */}
      <div className="px-6 -mt-16 relative z-20 max-w-lg mx-auto w-full">
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden p-3 border dark:border-gray-700">
          <div className="aspect-video bg-gray-900 rounded-[2rem] overflow-hidden relative group">
            {/* Placeholder para o vídeo real do Guti */}
            <iframe 
              className="w-full h-full"
              src="https://www.youtube.com/embed/dQw4w9WgXcQ" // Substituir pelo ID real do vídeo do Guti
              title="Apresentação Guti 2026"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 px-8 py-12 max-w-lg mx-auto w-full space-y-8 text-center">
        <div className="space-y-4">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
            Assista ao recado que o Guti preparou para você
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            Estamos construindo a maior rede de conexões evangélicas de São Paulo. Sua presença é fundamental para o sucesso deste projeto!
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-[2rem] p-5 border dark:border-gray-700 shadow-sm text-left space-y-3">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-link text-blue-500"></i>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Link de indicacao</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Compartilhe este link para novos cadastros entrarem com sua indicacao.
          </p>
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 text-[11px] font-semibold truncate"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
            >
              {copyLabel}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-900 rounded-2xl font-bold text-xs text-center transition-all"
            >
              Abrir
            </a>
          </div>
        </div>
        {/* CTA Button */}
        <div className="space-y-4">
          <a 
            href={GROUP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group block w-full py-5 bg-green-500 hover:bg-green-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-green-500/30 transition-all active:scale-95 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center justify-center gap-3">
              <i className="fa-brands fa-whatsapp text-2xl"></i>
              ENTRAR NO GRUPO DE CONEXÃO
            </div>
            {/* Pulsing indicator */}
            <span className="absolute top-3 right-6 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
          </a>
          
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Exclusivo para lideranças cadastradas
          </p>
        </div>

        <button 
          onClick={onFinish}
          className="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline"
        >
          Ir para o meu painel agora
        </button>
      </div>

      {/* Footer Info */}
      <div className="p-8 text-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Guti 2026 • Rede Evangélica SP</p>
      </div>
    </div>
  );
};

export default WelcomeLanding;
