import { useEffect, useRef, useState } from 'react';

import { speechCtor, type Recognition } from './useSpeechRecognition';
import { afterWakeWord } from './wakeWord';

type Options = {
  /** Écoute en continu activée par la personne. */
  enabled: boolean;
  /** Mise en pause (Claude réfléchit ou parle) : on n'écoute pas sa propre voix. */
  paused: boolean;
  /** « Claude » a été entendu : on écoute la question. */
  onWake: () => void;
  /** Question entendue jusqu'ici, mise à jour pendant qu'on parle. */
  onTranscript: (text: string) => void;
  /** Question terminée (jamais appelée si elle est vide). */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

/** Au bout de ce délai sans question après « Claude », on se remet à attendre le mot. */
const QUESTION_TIMEOUT = 10_000;

/**
 * Écoute mains libres : le micro reste ouvert, et quand on dit « Claude » la suite de la phrase devient la
 * question. `awake` est vrai entre « Claude » et la fin de la question. Utilise la reconnaissance vocale du
 * navigateur (Chrome, Edge, Safari), qui s'arrête d'elle-même de temps en temps : on la relance.
 */
export const useWakeWord = (options: Options) => {
  const [awake, setAwake] = useState(false);
  const [canListen] = useState(() => typeof window !== 'undefined' && !!speechCtor());
  const handlers = useRef(options);
  useEffect(() => {
    handlers.current = options;
  });
  const active = options.enabled && !options.paused && canListen;

  useEffect(() => {
    if (!active) return;
    const Ctor = speechCtor();
    if (!Ctor) return;
    let stopped = false;
    let rec: Recognition | null = null;
    let wakeIndex = -1; // rang du résultat où « Claude » a été entendu (-1 : on attend le mot)
    let timer = 0;

    const sleep = (): void => {
      wakeIndex = -1;
      window.clearTimeout(timer);
      setAwake(false);
    };

    const start = (): void => {
      if (stopped) return;
      rec = new Ctor();
      rec.lang = 'fr-FR';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (e) => {
        const last = e.results.length - 1;
        const chunk = e.results[last]!;
        const heard = chunk[0]?.transcript ?? '';
        let question: string | null = null;
        if (wakeIndex < 0) {
          const rest = afterWakeWord(heard);
          if (rest === null) return;
          wakeIndex = last;
          setAwake(true);
          handlers.current.onWake();
          window.clearTimeout(timer);
          timer = window.setTimeout(sleep, QUESTION_TIMEOUT);
          question = rest;
        } else {
          // même phrase que « Claude » : on garde ce qui suit le mot ; phrase suivante : tout est la question
          question = last === wakeIndex ? (afterWakeWord(heard) ?? heard) : heard;
        }
        question = question.trim();
        if (question) handlers.current.onTranscript(question);
        if (chunk.isFinal && question) {
          sleep();
          handlers.current.onFinal(question);
        } else if (chunk.isFinal && last !== wakeIndex) {
          sleep();
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          stopped = true;
          handlers.current.onError('Micro refusé : autorise-le dans le navigateur.');
        }
      };
      // le navigateur coupe l'écoute après un silence : on la relance tant que le mode est actif
      rec.onend = () => {
        sleep(); // une nouvelle écoute repart de zéro : on attend de nouveau « Claude »
        if (!stopped) window.setTimeout(start, 250);
      };
      try {
        rec.start();
      } catch {
        // déjà démarrée : la relance suivante réessaiera
      }
    };

    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (rec) {
        rec.onend = null;
        rec.stop();
      }
      setAwake(false);
    };
  }, [active]);

  return { awake, canListen };
};
