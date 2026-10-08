import BookDetail from '@/components/BookDetail';

import type { LayoutProps } from './types';

type BookPanelProps = Pick<LayoutProps, 'engine' | 'snap' | 'labels' | 'openBook' | 'lock'> & {
  /** Fermeture de la fiche : ranger le livre (bureau) ou seulement masquer la fiche (téléphone). */
  onClose: () => void;
};

/** Fiche du livre sorti, reliée au moteur (masquée quand aucun livre n'est sorti). */
export const BookPanel = ({ engine, snap, labels, openBook, lock, onClose }: BookPanelProps) => (
  <BookDetail
    book={openBook}
    crateLabel={openBook?.crate ? (labels.get(openBook.crate) ?? null) : null}
    allBooks={snap.books}
    readOnly={lock.locked}
    onDenied={lock.denied}
    onChange={(patch) => openBook && engine?.updateBook(openBook.id, patch)}
    onOpen={(id) => engine?.openBook(id)}
    onHint={(crateId) => engine?.hintCrate(crateId)}
    onClose={onClose}
  />
);
