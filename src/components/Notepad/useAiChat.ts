import { useState } from 'react';

import { EDIT_TOKEN_KEY, readStorage } from '@/components/shared';

import { AI_ERRORS } from './constants';
import type { AiTurn } from './types';

type Options = {
  /** Clé API de la personne (envoyée au serveur pour cette seule demande). */
  apiKey: string;
  model: string;
  /** Claude a modifié la bibliothèque : la scène doit se recharger. */
  onChanged?: () => void;
};

/** Conversation avec Claude : tours, question en cours, attente et erreur. */
export const useAiChat = ({ apiKey, model, onChanged }: Options) => {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (text: string): Promise<void> => {
    const q = text.trim();
    if (!q || !apiKey.trim() || busy) return;
    const next: AiTurn[] = [...turns, { role: 'user', content: q, at: Date.now() }];
    setTurns(next);
    setQuestion('');
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: apiKey.trim(),
          messages: next.map(({ role, content }) => ({ role, content })),
          // jeton d'Édition : prouve que le code a été saisi (les modifications de Claude en ont besoin)
          token: readStorage(EDIT_TOKEN_KEY),
          model,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        text?: string;
        reason?: string;
        changed?: boolean;
        actions?: string[];
      };
      if (data.ok && data.text) {
        setTurns([
          ...next,
          { role: 'assistant', content: data.text, actions: data.actions, at: Date.now() },
        ]);
        if (data.changed) onChanged?.();
      } else {
        setTurns(turns); // la question reste à poser : on la remet dans le champ
        setQuestion(q);
        setError(AI_ERRORS[data.reason ?? 'error'] ?? AI_ERRORS.error!);
      }
    } catch {
      setTurns(turns);
      setQuestion(q);
      setError(AI_ERRORS.error!);
    } finally {
      setBusy(false);
    }
  };

  /** Nouvelle conversation : on repart de zéro (la question en cours est gardée). */
  const reset = (): void => {
    setTurns([]);
    setError('');
  };

  return { question, setQuestion, turns, busy, error, setError, send, reset };
};
