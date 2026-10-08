import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { APP_DESCRIPTION, APP_NAME } from '@/constants';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="fr">
    <body>{children}</body>
  </html>
);

export default RootLayout;
