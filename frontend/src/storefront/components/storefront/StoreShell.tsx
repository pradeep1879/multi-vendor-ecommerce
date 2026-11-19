import type { ReactNode } from 'react';
import { Header } from '../layout/Header';
import { Footer } from '../layout/Footer';
import { BagDrawer } from '../../features/cart/BagDrawer';

export function StoreShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1} className={className}>
        {children}
      </main>
      <Footer />
      <BagDrawer />
    </>
  );
}
