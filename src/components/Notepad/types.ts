export type NotepadStatus = 'loading' | 'saving' | 'saved' | 'offline';

export type NotepadTab = 'notes' | 'ai';

/** Un message de la conversation avec Claude. */
export type AiTurn = { role: 'user' | 'assistant'; content: string };

export type NotepadProps = {
  className?: string;
};
