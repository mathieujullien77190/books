import { useState } from 'react';

import Notepad from '@/components/Notepad';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Sheet from '@/components/ui/Sheet';

import { BookPanel } from './BookPanel';
import { FLOAT_SHADOW } from './constants';
import { LibraryPanel } from './LibraryPanel';
import type { LayoutProps } from './types';

/** Téléphone : pas de colonne de droite, deux boutons en bas à gauche qui ouvrent des feuilles. */
export const PhoneLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => {
  /** Feuille ouverte par les deux boutons du bas (une seule à la fois). */
  const [sheet, setSheet] = useState<'library' | 'claude' | null>(null);
  /** Livre dont la fiche est affichée (par le bouton « Détail » sous le livre). */
  const [detailFor, setDetailFor] = useState<string | null>(null);

  return (
    <>
      {sheet && (
        <Sheet>
          {sheet === 'library' ? (
            <LibraryPanel engine={engine} snap={snap} lock={lock} defaultOpen />
          ) : (
            <Notepad
              defaultOpen
              onChanged={() => engine?.reload()}
              onOpenBook={(id) => {
                setSheet(null);
                engine?.openBook(id);
              }}
            />
          )}
        </Sheet>
      )}
      {openBook && detailFor !== openBook.id && (
        <Button
          className={`fixed bottom-[76px] left-1/2 z-20 h-10 -translate-x-1/2 rounded-2xl bg-white/90 px-5 text-base backdrop-blur-md ${FLOAT_SHADOW}`}
          onClick={() => setDetailFor(openBook.id)}
        >
          📖 Détail
        </Button>
      )}
      {openBook && detailFor === openBook.id && (
        <Sheet>
          <BookPanel
            engine={engine}
            snap={snap}
            labels={labels}
            openBook={openBook}
            lock={lock}
            onClose={() => setDetailFor(null)}
          />
        </Sheet>
      )}
      {snap.openId && (
        <>
          <IconButton
            className="fixed top-[92px] right-3 z-30 h-11 w-11 bg-white/90 text-lg shadow-[0_10px_30px_rgba(31,42,55,0.2)] backdrop-blur-md"
            label="Fermer le livre"
            title="Fermer"
            onClick={() => engine?.closeBook()}
          >
            ✕
          </IconButton>
          <IconButton
            className="fixed top-1/2 left-2 z-20 h-12 w-11 -translate-y-1/2 bg-white/80 text-2xl backdrop-blur-md"
            label="Livre précédent"
            disabled={!snap.hasPrev}
            onClick={() => engine?.stepBook(-1)}
          >
            ‹
          </IconButton>
          <IconButton
            className="fixed top-1/2 right-2 z-20 h-12 w-11 -translate-y-1/2 bg-white/80 text-2xl backdrop-blur-md"
            label="Livre suivant"
            disabled={!snap.hasNext}
            onClick={() => engine?.stepBook(1)}
          >
            ›
          </IconButton>
        </>
      )}
      <div className="fixed bottom-4 left-4 z-30 flex gap-2">
        <Button
          variant={sheet === 'library' ? 'active' : 'default'}
          pressed={sheet === 'library'}
          className={`h-11 rounded-2xl px-4 text-base ${FLOAT_SHADOW}`}
          onClick={() => setSheet((s) => (s === 'library' ? null : 'library'))}
        >
          📚 Biblio
        </Button>
        <Button
          variant={sheet === 'claude' ? 'active' : 'default'}
          pressed={sheet === 'claude'}
          className={`h-11 rounded-2xl px-4 text-base ${FLOAT_SHADOW}`}
          onClick={() => setSheet((s) => (s === 'claude' ? null : 'claude'))}
        >
          ✨ Claude
        </Button>
      </div>
    </>
  );
};
