import Notepad from '@/components/Notepad';

import { BookPanel } from './BookPanel';
import { LibraryPanel } from './LibraryPanel';
import type { LayoutProps } from './types';

/** Bureau : colonne de droite avec la bibliothèque, Claude et la fiche du livre sorti. */
export const DesktopLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => (
  <div className="pointer-events-none fixed top-[88px] right-4 bottom-[76px] z-10 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3">
    <LibraryPanel engine={engine} snap={snap} lock={lock} />
    <Notepad
      className="shrink-0"
      onChanged={() => engine?.reload()}
      onOpenBook={(id) => engine?.openBook(id)}
    />
    <BookPanel
      engine={engine}
      snap={snap}
      labels={labels}
      openBook={openBook}
      lock={lock}
      onClose={() => engine?.closeBook()}
    />
  </div>
);
