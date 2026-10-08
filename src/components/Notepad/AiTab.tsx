'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import Button from '@/components/ui/Button';

import { AI_ERRORS, EDIT_TOKEN_KEY, KEY_STORAGE, MODEL_OPTIONS, MODEL_STORAGE } from './constants';
import type { AiTurn } from './types';

/** La clé reste dans ce navigateur (jamais en base) : chacun utilise la sienne. */
const readKey = (): string => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};

/** Jeton d'Édition délivré par le serveur : prouve que le code a été saisi (les modifications de Claude en ont besoin). */
const readEditToken = (): string | null => {
  try {
    return localStorage.getItem(EDIT_TOKEN_KEY);
  } catch {
    return null;
  }
};

const readModel = (): string => {
  try {
    const m = localStorage.getItem(MODEL_STORAGE);
    return MODEL_OPTIONS.some((o) => o.id === m) ? m! : 'haiku';
  } catch {
    return 'haiku';
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

export const AiTab = ({ onChanged }: { onChanged?: () => void }) => {
  const [key, setKey] = useState(readKey);
  const [model, setModel] = useState(readModel);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, busy]);

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
        body: JSON.stringify({
          key: key.trim(),
          messages: next.map(({ role, content }) => ({ role, content })),
          token: readEditToken(),
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
        setTurns([...next, { role: 'assistant', content: data.text, actions: data.actions }]);
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
      <select
        aria-label="Modèle"
        className="mb-2 w-full rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-sm text-ink"
        value={model}
        onChange={(e) => {
          setModel(e.target.value);
          try {
            localStorage.setItem(MODEL_STORAGE, e.target.value);
          } catch {
            // stockage indisponible : le choix vaut pour la session
          }
        }}
      >
        {MODEL_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {turns.length > 0 && (
        <div className="mb-2 max-h-52 [scrollbar-width:thin] space-y-3 overflow-y-auto text-sm">
          {turns.map((t, i) => (
            <p
              key={i}
              className={`m-0 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap ${
                t.role === 'user' ? 'bg-ink/5 text-ink' : 'bg-accent/10 text-ink'
              }`}
            >
              <span className="mb-0.5 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                {t.role === 'user' ? 'Moi' : 'Claude'}
              </span>
              {t.actions?.map((a) => (
                <span key={a} className="mb-1 block text-xs text-muted">
                  ✅ {a}
                </span>
              ))}
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
