import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { crateLabels } from '@/helpers';
import { getDb, hasMongoConfig } from '@/lib/mongodb';
import type { Book, Crate } from '@/types';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

type Turn = { role: 'user' | 'assistant'; content: string };

const SYSTEM = `Tu es l'assistant d'une bibliothèque personnelle rangée dans des caisses.
Réponds en français, de façon brève et concrète. Appuie-toi sur l'inventaire ci-dessous ; si une information n'y figure pas, dis-le au lieu de l'inventer.
Les caisses sont numérotées par une lettre et un rang : P = petite, M = moyenne, G = grande, T = transparente (P1, M3, G2, T5…). « à côté » désigne un livre posé hors des caisses.`;

/** Inventaire compact, un livre par ligne : caisse | titre | auteur | éditeur | année. */
const inventory = async (): Promise<string> => {
  if (!hasMongoConfig()) return 'Inventaire indisponible (base non configurée).';
  const db = await getDb();
  const crates = await db
    .collection<Crate>('crates')
    .find({}, { projection: { _id: 0 }, sort: { order: 1 } })
    .toArray();
  const books = await db
    .collection<Book>('books')
    .find({}, { projection: { _id: 0 }, sort: { order: 1 } })
    .toArray();
  const labels = crateLabels(crates);
  const lines = books.map((b) =>
    [
      (b.crate && labels.get(b.crate)) || 'à côté',
      b.title,
      b.author ?? '',
      b.publisher ?? '',
      b.year ?? '',
    ].join(' | '),
  );
  return `Inventaire (${books.length} livres) — caisse | titre | auteur | éditeur | année :\n${lines.join('\n')}`;
};

const parseTurns = (raw: unknown): Turn[] | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const t of raw) {
    const { role, content } = (t ?? {}) as Partial<Turn>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    if (!content.trim() || content.length > MAX_CHARS) return null;
    turns.push({ role, content });
  }
  return turns[0]!.role === 'user' && turns[turns.length - 1]!.role === 'user' ? turns : null;
};

/**
 * POST /api/ai — pose une question à Claude sur la bibliothèque. La clé API est celle de la
 * personne qui interroge : elle sert à cette seule requête, elle n'est ni enregistrée ni journalisée.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  let body: { key?: unknown; messages?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const turns = parseTurns(body.messages);
  if (!key) return NextResponse.json({ ok: false, reason: 'no-key' }, { status: 400 });
  if (!turns) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: await inventory(), cache_control: { type: 'ephemeral' } },
      ],
      messages: turns,
    });
    if (response.stop_reason === 'refusal')
      return NextResponse.json({ ok: false, reason: 'refusal' });
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return NextResponse.json({ ok: true, text: text || '(réponse vide)' });
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    )
      return NextResponse.json({ ok: false, reason: 'bad-key' }, { status: 401 });
    if (error instanceof Anthropic.RateLimitError)
      return NextResponse.json({ ok: false, reason: 'rate-limit' }, { status: 429 });
    if (error instanceof Anthropic.APIError)
      return NextResponse.json({ ok: false, reason: 'api', status: error.status }, { status: 502 });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
};
