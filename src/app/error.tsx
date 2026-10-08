'use client';

import { useEffect } from 'react';

import Button from '@/components/ui/Button';

/** Erreur imprévue de l'interface : message et bouton pour réessayer, au lieu d'un écran blanc. */
const ErrorPage = ({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="m-0 text-xl font-semibold">La bibliothèque a rencontré un problème</h1>
      <p className="m-0 max-w-sm text-sm text-muted">
        Rien n’est perdu : tes livres sont dans la base. Réessaie, ou recharge la page.
      </p>
      <Button variant="primary" onClick={() => retry()}>
        Réessayer
      </Button>
    </main>
  );
};

export default ErrorPage;
