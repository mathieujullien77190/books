'use client';

import { useEffect, useRef, useState } from 'react';

import { SAVE_DELAY_MS, STATUS_TEXT } from './constants';
import type { NotepadStatus } from './types';

export const NotesTab = () => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<NotepadStatus>('loading');
  /** Rien n'est envoyé avant d'avoir lu la base : sinon un calepin vide écraserait les notes. */
  const loaded = useRef(false);
  const timer = useRef(0);
  const latest = useRef('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notes', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ ok: boolean; text?: string }>)
      .then((d) => {
        if (cancelled) return;
        if (!d.ok) return setStatus('offline');
        loaded.current = true;
        latest.current = d.text ?? '';
        setText(latest.current);
        setStatus('saved');
      })
      .catch(() => !cancelled && setStatus('offline'));
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, []);

  const save = (): void => {
    window.clearTimeout(timer.current);
    if (!loaded.current) return;
    setStatus('saving');
    fetch('/api/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: latest.current }),
      keepalive: true,
    })
      .then((r) => r.json() as Promise<{ ok: boolean }>)
      .then((d) => setStatus(d.ok ? 'saved' : 'offline'))
      .catch(() => setStatus('offline'));
  };

  return (
    <div>
      <textarea
        className="block h-40 w-full resize-y border-t border-ink/10 bg-transparent px-3.5 py-2 leading-relaxed text-ink outline-none"
        placeholder="Notes…"
        aria-label="Notes"
        disabled={status === 'loading' || status === 'offline'}
        value={text}
        onChange={(e) => {
          latest.current = e.target.value;
          setText(e.target.value);
          setStatus('saving');
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(save, SAVE_DELAY_MS);
        }}
        onBlur={save}
      />
      <div className="px-3.5 pb-2 text-right text-xs text-muted">{STATUS_TEXT[status]}</div>
    </div>
  );
};
