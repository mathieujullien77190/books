'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { KEY_STORAGE, MODEL_STORAGE, useLocalStorageState } from '@/components/shared';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Select from '@/components/ui/Select';
import TextArea from '@/components/ui/TextArea';
import TextInput from '@/components/ui/TextInput';

import { DEFAULT_MODEL, MODEL_OPTIONS } from './constants';
import { useAiChat } from './useAiChat';
import { useSpeechRecognition } from './useSpeechRecognition';

const timeOf = (at?: number): string =>
  at ? new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

const BOOK_LINK = /\[([^\]]+)\]\(livre:([A-Za-z0-9_-]+)\)/g;

/** La clé est stockée sans espaces autour, mais gardée telle quelle dans le champ. */
const trimKey = (key: string): string => key.trim();
const isModel = (id: string): boolean => MODEL_OPTIONS.some((o) => o.id === id);

/** Texte d'une réponse : les liens [Titre](livre:id) deviennent des boutons qui affichent le livre en 3D. */
const renderAnswer = (text: string, onOpenBook?: (id: string) => void) => {
  const parts: (string | { title: string; id: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(BOOK_LINK)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ title: m[1]!, id: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      p
    ) : (
      <button
        key={i}
        type="button"
        className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#027eb5] underline decoration-dotted underline-offset-2 hover:text-[#015f8a]"
        title="Afficher en 3D"
        onClick={() => onOpenBook?.(p.id)}
      >
        {p.title}
      </button>
    ),
  );
};

export const AiTab = ({
  onChanged,
  onOpenBook,
}: {
  onChanged?: () => void;
  onOpenBook?: (id: string) => void;
}) => {
  // la clé reste dans ce navigateur (jamais en base) : chacun utilise la sienne
  const [key, setKey] = useLocalStorageState(KEY_STORAGE, '', { normalize: trimKey });
  const [model, setModel] = useLocalStorageState(MODEL_STORAGE, DEFAULT_MODEL, {
    validate: isModel,
  });
  /** Champ de la clé replié derrière le bouton 🔑 ; ouvert d'office tant qu'il n'y a pas de clé. */
  const [showKey, setShowKey] = useState(() => !key);
  const { question, setQuestion, turns, busy, error, setError, send, reset } = useAiChat({
    apiKey: key,
    model,
    onChanged,
  });
  /** Dicte la question : le texte s'affiche pendant qu'on parle, puis part tout seul à la fin de la phrase. */
  const {
    listening,
    canSpeak,
    toggle: toggleMic,
  } = useSpeechRecognition({
    onTranscript: setQuestion,
    onFinal: (heard) => void send(heard),
    onStart: () => setError(''),
    onError: setError,
  });
  const end = useRef<HTMLDivElement>(null);
  const hasKey = !!key.trim();

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, busy]);

  const ask = (e: FormEvent): void => {
    e.preventDefault();
    void send(question);
  };

  const showLog = turns.length > 0 || busy;

  return (
    <div className="border-t border-ink/10 px-3.5 py-2">
      <div className="mb-2 flex items-center gap-1.5">
        <IconButton
          className={`h-8 w-9 shrink-0 rounded-lg bg-white text-base ${showKey ? 'border-ink' : ''}`}
          label="Clé API Anthropic"
          aria-expanded={showKey}
          onClick={() => setShowKey((v) => !v)}
        >
          🔑
        </IconButton>
        {showKey && (
          <TextInput
            id="aiKey"
            type="text"
            className="h-8 min-w-0 flex-1 py-0"
            placeholder="sk-ant-…"
            aria-label="Clé API Anthropic"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
        <Select
          aria-label="Modèle"
          className={`h-8 px-2 py-0 ${showKey ? 'w-28 shrink-0' : 'w-auto min-w-0 flex-1'}`}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {MODEL_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {!hasKey && (
        <p className="m-0 mb-2 rounded-lg bg-ink/5 px-2.5 py-2 text-xs leading-relaxed text-ink">
          Cette fonction utilise l’API d’Anthropic, qui est <strong>payante</strong> : chaque
          question consomme du crédit. Pour la tester, colle ta propre clé (bouton 🔑) : elle reste
          dans ton navigateur et ne sert qu’à tes questions. Par prudence, crée une clé dédiée sur
          console.anthropic.com avec une limite de dépense basse, et supprime-la juste après
          l’essai.
        </p>
      )}
      {/* zone toujours présente (vide au départ) pour que les lecteurs d'écran lisent les messages qui arrivent */}
      <div
        role="log"
        aria-label="Conversation avec Claude"
        aria-live="polite"
        className={
          showLog
            ? 'mb-2 flex max-h-72 [scrollbar-width:thin] flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#efeae2] p-2 text-sm'
            : undefined
        }
      >
        {showLog && (
          <>
            {turns.map((t, i) => {
              const mine = t.role === 'user';
              return (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 whitespace-pre-wrap text-[#111b21] shadow-sm ${
                    mine
                      ? 'self-end rounded-tr-none bg-[#d9fdd3]'
                      : 'self-start rounded-tl-none bg-white'
                  }`}
                >
                  {!mine && (
                    <span className="mb-0.5 block text-xs font-semibold text-[#06795f]">
                      Claude
                    </span>
                  )}
                  {t.actions?.map((a) => (
                    <span key={a} className="mb-1 block text-xs text-[#667781]">
                      ✅ {a}
                    </span>
                  ))}
                  {mine ? t.content : renderAnswer(t.content, onOpenBook)}
                  <span className="mt-0.5 block text-right text-[10px] text-[#667781]">
                    {timeOf(t.at)}
                  </span>
                </div>
              );
            })}
            {busy && (
              <div className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-xs text-[#667781] shadow-sm">
                Claude écrit…
              </div>
            )}
            <div ref={end} />
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 mb-1.5 text-xs text-[#c0392b]">
          {error}
        </p>
      )}
      <form onSubmit={ask} className="flex flex-col gap-1.5">
        <TextArea
          className="block h-24 min-h-16 resize-y py-1.5 leading-relaxed"
          placeholder={
            hasKey
              ? 'Ta question sur la bibliothèque… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)'
              : 'Colle d’abord ta clé…'
          }
          aria-label="Question pour Claude"
          disabled={!hasKey}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-1.5">
          {canSpeak && (
            <Button
              variant={listening ? 'active' : 'default'}
              pressed={listening}
              aria-label={listening ? 'Arrêter la dictée' : 'Parler à Claude'}
              disabled={busy || !hasKey}
              onClick={toggleMic}
            >
              {listening ? '⏹ J’écoute…' : '🎤 Parler'}
            </Button>
          )}
          <Button
            variant="primary"
            type="submit"
            loading={busy}
            disabled={!hasKey || !question.trim()}
          >
            Envoyer
          </Button>
        </div>
      </form>
      {turns.length > 0 && (
        <button
          type="button"
          className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink max-md:min-h-11"
          onClick={reset}
        >
          Nouvelle conversation
        </button>
      )}
    </div>
  );
};
