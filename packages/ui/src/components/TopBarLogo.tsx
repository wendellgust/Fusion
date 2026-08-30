import { FC } from 'react';

import LogoLight from '../assets/logo-icon-light.svg?react';

const logoClass = 'h-6 w-6';

export const TopBarLogo: FC = () => (
  <span className="ml-0.5 flex items-center">
    <LogoLight className={logoClass} />
  </span>
);
