import React from 'react';
import WelcomeLanding from '../WelcomeLanding';

const PublicThanks: React.FC = () => {
  const storedName = sessionStorage.getItem('guti_public_name')?.trim() ?? '';
  const displayName = storedName || 'Apoiador';
  const baseUrl = `${window.location.origin}${window.location.pathname}#/cadastro`;
  const shareUrl = storedName ? `${baseUrl}?indicador=${encodeURIComponent(storedName)}` : baseUrl;

  return (
    <WelcomeLanding
      name={displayName}
      shareUrl={shareUrl}
      onFinish={() => {
        sessionStorage.removeItem('guti_public_name');
        window.location.hash = '';
      }}
    />
  );
};

export default PublicThanks;
