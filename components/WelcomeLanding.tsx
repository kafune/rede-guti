
import React from 'react';

interface Props {
  name: string;
  groupLink?: string;
}

const WelcomeLanding: React.FC<Props> = ({ name, groupLink }) => {
  const resolvedGroupLink = groupLink?.trim();

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
          <div className="theme-brand-mark w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6">G</div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">Bem-vindo à Família Guti 2026!</h1>
          <p className="text-blue-100 font-medium opacity-80">
            Olá, <span className="text-white font-bold">{name.split(' ')[0]}</span>! Seu cadastro foi realizado com sucesso.
          </p>
        </div>
      </div>

      {/* Video Section */}
      <div className="px-6 -mt-16 relative z-20 max-w-lg mx-auto w-full">
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden p-3 border dark:border-gray-700">
          <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 rounded-[2rem] overflow-hidden relative flex items-center justify-center p-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/80 text-2xl text-gray-700 shadow-sm dark:bg-white/10 dark:text-white">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-black text-gray-900 dark:text-white">
                  Vídeo temporariamente indisponível
                </p>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Tivemos problemas com o vídeo e estamos corrigindo isso.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 px-8 py-12 max-w-lg mx-auto w-full space-y-8 text-center">
        <div className="space-y-4">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
            Estamos ajustando esse conteúdo para você
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            Tivemos um problema com o vídeo exibido aqui. Em breve vamos publicar a versão correta.
          </p>
        </div>

        {resolvedGroupLink ? (
          <div className="space-y-4">
            <a
              href={resolvedGroupLink}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-accent-button group block w-full py-5 rounded-[2rem] font-black text-lg transition-all active:scale-95 relative overflow-hidden"
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
        ) : (
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Link do grupo disponível com o responsável.
          </p>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-8 text-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Guti 2026 • Rede Evangélica SP</p>
      </div>
    </div>
  );
};

export default WelcomeLanding;
