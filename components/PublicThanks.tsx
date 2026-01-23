import React from 'react';

const PublicThanks: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-blue-600 to-indigo-900 animate-fade-up">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl animate-soft-pop transition-all duration-700 ease-out text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-6 shadow-xl shadow-blue-500/30">G</div>
        <h1 className="text-3xl font-black tracking-tight mb-3">Cadastro enviado</h1>
        <p className="text-sm opacity-70 mb-6">
          Obrigado por apoiar. Seus dados foram recebidos com sucesso.
        </p>
        <button
          onClick={() => {
            window.location.hash = '';
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};

export default PublicThanks;
