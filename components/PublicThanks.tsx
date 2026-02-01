import React, { useEffect } from 'react';
import WelcomeLanding from './WelcomeLanding';

const PublicThanks: React.FC = () => {
  const storedName = sessionStorage.getItem('guti_public_name')?.trim() ?? '';
  const displayName = storedName || 'Apoiador';
  const groupLink = sessionStorage.getItem('guti_public_group_link')?.trim() ?? '';

  useEffect(() => {
    sessionStorage.removeItem('guti_public_name');
    sessionStorage.removeItem('guti_public_group_link');
  }, []);

  return (
    <WelcomeLanding name={displayName} groupLink={groupLink} />
  );
};

export default PublicThanks;
