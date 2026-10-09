import { useCallback, useEffect, useState } from 'react';

const BOOK_LINK = /\[([^\]]+)\]\(livre:[A-Za-z0-9_-]+\)/g;

/** Texte d'une réponse tel qu'on le prononce : les liens de livres ne gardent que le titre, sans symboles de mise en forme. */
export const plainAnswer = (text: string): string =>
  text
    .replace(BOOK_LINK, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Lecture à voix haute (synthèse vocale du navigateur) : `speak` remplace ce qui se dit, `stop` coupe ; `canSpeak` est faux si le navigateur ne sait pas faire. */
export const useSpeechSynthesis = () => {
  const [canSpeak] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  /** Une réponse est en train d'être lue : l'écoute mains libres attend la fin pour ne pas s'entendre elle-même. */
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback((): void => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [canSpeak]);

  const speak = useCallback(
    (text: string): void => {
      if (!canSpeak || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [canSpeak],
  );

  // quitter le panneau coupe la voix
  useEffect(() => stop, [stop]);

  return { canSpeak, speaking, speak, stop };
};
