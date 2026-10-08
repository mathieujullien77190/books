'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import Button from '@/components/ui/Button';

import { AI_ERRORS, KEY_STORAGE } from './constants';
import type { AiTurn } from './types';

/** La clé reste dans ce navigateur (jamais en base) : chacun utilise la sienne. */
const readKey = (): string => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};

const writeKey = (key: string): void => {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // stockage indisponible (navigation privée) : la clé reste en mémoire pour la session
  }
};

export const AiTab = () => {
  const [key, setKey] = useState(readKey);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [turns, busy]);

  const ask = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const q = question.trim();
    if (!q || !key.trim() || busy) return;
    const next: AiTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setQuestion('');
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), messages: next }),
      });
      const data = (await res.json()) as { ok: boolean; text?: string; reason?: string };
      if (data.ok && data.text) setTurns([...next, { role: 'assistant', content: data.text }]);
      else {
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

  return (
    <div className="border-t border-ink/10 px-3.5 py-2">
      <label className="mb-1 block text-xs text-muted" htmlFor="aiKey">
        Clé API Anthropic · gardée dans ce navigateur uniquement
      </label>
      <input
        id="aiKey"
        type="password"
        className="mb-2 w-full rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-sm text-ink"
        placeholder="sk-ant-…"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          writeKey(e.target.value.trim());
        }}
      />
      {turns.length > 0 && (
        <div className="mb-2 max-h-52 [scrollbar-width:thin] space-y-1.5 overflow-y-auto text-sm">
          {turns.map((t, i) => (
            <p
              key={i}
              className={`m-0 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap ${
                t.role === 'user' ? 'bg-ink/5 text-ink' : 'bg-accent/10 text-ink'
              }`}
            >
              {t.content}
            </p>
          ))}
          {busy && <p className="m-0 px-2.5 text-xs text-muted">Claude réfléchit…</p>}
          <div ref={end} />
        </div>
      )}
      {error && <p className="m-0 mb-1.5 text-xs text-[#c0392b]">{error}</p>}
      <form onSubmit={ask} className="flex flex-col gap-1.5">
        <textarea
          className="block h-24 min-h-16 w-full resize-y rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-sm leading-relaxed text-ink"
          placeholder={
            key.trim()
              ? 'Ta question sur la bibliothèque… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)'
              : 'Colle d’abord ta clé…'
          }
          aria-label="Question pour Claude"
          disabled={!key.trim()}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button
          variant="primary"
          type="submit"
          className="self-end"
          disabled={busy || !key.trim() || !question.trim()}
        >
          Envoyer
        </Button>
      </form>
      {turns.length > 0 && (
        <button
          type="button"
          className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink"
          onClick={() => {
            setTurns([]);
            setError('');
          }}
        >
          Nouvelle conversation
        </button>
      )}
    </div>
  );
};
