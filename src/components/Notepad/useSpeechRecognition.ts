import { useEffect, useRef, useState } from 'react';

/** Reconnaissance vocale du navigateur (Chrome, Edge, Safari) : types minimaux, absents de lib.dom. */
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

export const speechCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as Record<string, new () => Recognition>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

type Options = {
  /** Texte entendu jusqu'ici, mis à jour pendant qu'on parle. */
  onTranscript: (text: string) => void;
  /** Fin de la phrase : le texte entendu (jamais appelé s'il est vide). */
  onFinal: (text: string) => void;
  /** Début d'une dictée. */
  onStart?: () => void;
  onError: (message: string) => void;
};

/** Dictée vocale : `toggle` démarre ou arrête l'écoute ; `canSpeak` est faux si le navigateur ne sait pas faire. */
export const useSpeechRecognition = (options: Options) => {
  const [listening, setListening] = useState(false);
  const [canSpeak] = useState(() => typeof window !== 'undefined' && !!speechCtor());
  const recognition = useRef<Recognition | null>(null);
  // toujours les derniers rappels, sans recréer la reconnaissance en cours
  const handlers = useRef(options);
  useEffect(() => {
    handlers.current = options;
  });

  const toggle = (): void => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    let heard = '';
    rec.onresult = (e) => {
      heard = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      handlers.current.onTranscript(heard);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        handlers.current.onError('Micro refusé : autorise-le dans le navigateur.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted')
        handlers.current.onError('La dictée n’a pas fonctionné.');
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard) handlers.current.onFinal(heard);
    };
    recognition.current = rec;
    handlers.current.onStart?.();
    setListening(true);
    rec.start();
  };

  useEffect(() => () => recognition.current?.stop(), []);

  return { listening, canSpeak, toggle };
};
