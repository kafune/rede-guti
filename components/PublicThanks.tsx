import React, { useEffect } from 'react';
import WelcomeLanding from '../WelcomeLanding';

const PublicThanks: React.FC = () => {
  const storedName = sessionStorage.getItem('guti_public_name')?.trim() ?? '';
  const displayName = storedName || 'Apoiador';

  useEffect(() => {
    sessionStorage.removeItem('guti_public_name');
  }, []);

  return (
    <WelcomeLanding name={displayName} />
  );
};

export default PublicThanks;
