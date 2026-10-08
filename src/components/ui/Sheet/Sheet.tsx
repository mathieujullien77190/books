import type { SheetProps } from './types';

/** Feuille du téléphone : colonne posée au-dessus des boutons du bas, qui laisse passer les touchers autour. */
const Sheet = ({ children }: SheetProps) => (
  <div className="pointer-events-none fixed inset-x-4 bottom-[76px] z-20 flex max-h-[60dvh] flex-col">
    {children}
  </div>
);

export default Sheet;
