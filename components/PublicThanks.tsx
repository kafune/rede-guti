import React, { useEffect, useState } from 'react';
import WelcomeLanding from './WelcomeLanding';

const PublicThanks: React.FC = () => {
  const [displayName] = useState(() => {
    const storedName = sessionStorage.getItem('guti_public_name')?.trim() ?? '';
    return storedName || 'Apoiador';
  });
  const [groupLink] = useState(() => sessionStorage.getItem('guti_public_group_link')?.trim() ?? '');

  useEffect(() => {
    sessionStorage.removeItem('guti_public_name');
    sessionStorage.removeItem('guti_public_group_link');
  }, []);

  return (
    <WelcomeLanding name={displayName} groupLink={groupLink} />
  );
};

export default PublicThanks;
