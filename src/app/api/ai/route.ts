import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { isEditToken } from '@/lib/edit';
import {
  addBook,
  crateContents,
  deleteBook,
  moveBook,
  overview,
  searchLibrary,
} from '@/lib/library';
import { hasMongoConfig } from '@/lib/mongodb';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 20;
const MAX_CHARS = 4000;
/** Tours d'outils maximum pour une même question (recherche, puis modification, puis vérification). */
const MAX_STEPS = 8;

type Turn = { role: 'user' | 'assistant'; content: string };
type Input = Record<string, unknown>;

const BASE = `Tu es l'assistant de la bibliothèque personnelle de l'utilisateur, rangée dans des caisses. Tu réponds à ses questions sur CE QU'IL POSSÈDE, en interrogeant la base avec tes outils.
Règles :
- Cherche avant de répondre : utilise search_books ou get_crate_contents, ne devine pas. Cite les titres exactement comme la base les donne, avec leur caisse (« La Hulotte n°8 est dans P2 »).
- Si la base ne contient pas ce qu'on cherche, dis-le. N'invente jamais un livre.
- Pour ce qui dépasse la base (nombre de tomes d'une série, ce qui manque, un résumé), appuie-toi sur ce qu'il possède et précise que le reste vient de tes connaissances.
- Réponds en français, de façon brève et concrète.
Les caisses sont numérotées par une lettre et un rang : P = petite, M = moyenne, G = grande, T = transparente (P1, M3, G2, T5…). « à côté » désigne un livre posé hors des caisses. Dans une caisse, les livres sont listés du premier (le plus à gauche, ou le plus bas d'une pile) au dernier.`;

const WRITE_RULES = `
Tu peux aussi modifier la bibliothèque (move_book, add_book, delete_book) quand l'utilisateur le demande clairement :
- Pour déplacer ou supprimer un livre, retrouve d'abord son id avec search_books ; s'il y a plusieurs livres possibles, demande lequel.
- delete_book : demande toujours une confirmation explicite (« Je supprime X, tu confirmes ? ») et n'appelle l'outil avec confirmed: true qu'APRÈS un « oui » de l'utilisateur dans son message le plus récent.
- Après une modification, dis ce que tu as fait en une phrase. Un livre qui ne rentre pas dans la caisse visée sera posé « à côté » par l'appli.`;

const READ_ONLY = `
L'édition est verrouillée : tu ne peux ni déplacer, ni ajouter, ni supprimer de livre. Si on te le demande, explique qu'il faut d'abord saisir le code d'Édition dans le bloc « Bibliothèque ».`;

const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_books',
    description:
      'Cherche des livres dans la bibliothèque. Sans accents ni majuscules, tolère une faute de frappe. Tous les filtres sont facultatifs et se combinent. Renvoie id, titre, auteur, éditeur, année, type et caisse.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Mots à chercher dans le titre, l'auteur ou l'éditeur",
        },
        author: { type: 'string', description: "Fragment du nom de l'auteur" },
        crate: { type: 'string', description: 'Caisse (P2, M3, G1, T5…) ou « à côté »' },
        kind: {
          type: 'string',
          enum: ['roman', 'bd', 'documentaire', 'guide', 'dictionnaire', 'autre'],
        },
        limit: {
          type: 'integer',
          description: 'Nombre maximum de résultats (50 au plus, 25 par défaut)',
        },
      },
    },
  },
  {
    name: 'get_crate_contents',
    description: "Liste tous les livres d'une caisse, dans leur ordre de rangement.",
    input_schema: {
      type: 'object',
      properties: {
        crate: { type: 'string', description: 'Caisse (P2, M3, G1, T5…) ou « à côté »' },
      },
      required: ['crate'],
    },
  },
];

const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'move_book',
    description:
      'Range un livre existant dans une caisse (ou « à côté »). Par défaut il se place à la fin de la rangée ; after_book_id le place juste après un autre livre.',
    input_schema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'id du livre (donné par search_books)' },
        crate: { type: 'string', description: 'Caisse de destination (P2, M3…) ou « à côté »' },
        after_book_id: {
          type: 'string',
          description: 'id du livre après lequel le placer (facultatif)',
        },
      },
      required: ['book_id', 'crate'],
    },
  },
  {
    name: 'add_book',
    description:
      'Ajoute un nouveau livre dans une caisse. Les dimensions sont facultatives (poche par défaut) et en centimètres.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        crate: { type: 'string', description: 'Caisse (P2, M3…) ou « à côté »' },
        author: { type: 'string' },
        publisher: { type: 'string' },
        year: { type: 'integer' },
        kind: {
          type: 'string',
          enum: ['roman', 'bd', 'documentaire', 'guide', 'dictionnaire', 'autre'],
        },
        summary: { type: 'string' },
        height_cm: { type: 'number' },
        depth_cm: { type: 'number' },
        thickness_cm: { type: 'number' },
        after_book_id: {
          type: 'string',
          description: 'id du livre après lequel le placer (facultatif)',
        },
      },
      required: ['title', 'crate'],
    },
  },
  {
    name: 'delete_book',
    description:
      "Supprime définitivement un livre. N'appelle cet outil avec confirmed: true qu'après que l'utilisateur a explicitement confirmé la suppression dans son dernier message.",
    input_schema: {
      type: 'object',
      properties: {
        book_id: { type: 'string' },
        confirmed: { type: 'boolean', description: "true seulement si l'utilisateur a confirmé" },
      },
      required: ['book_id', 'confirmed'],
    },
  },
];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Exécute un outil ; renvoie le résultat pour Claude et, si la base a changé, une ligne pour l'utilisateur. */
const runTool = async (
  name: string,
  input: Input,
): Promise<{ result: unknown; action?: string }> => {
  switch (name) {
    case 'search_books':
      return {
        result: await searchLibrary({
          query: str(input.query) || undefined,
          author: str(input.author) || undefined,
          crate: str(input.crate) || undefined,
          kind: str(input.kind) || undefined,
          limit: num(input.limit),
        }),
      };
    case 'get_crate_contents':
      return { result: await crateContents(str(input.crate)) };
    case 'move_book': {
      const r = (await moveBook({
        book_id: str(input.book_id),
        crate: str(input.crate),
        after_book_id: str(input.after_book_id) || undefined,
      })) as { ok?: boolean; title?: string; from?: string; to?: string };
      return {
        result: r,
        action: r.ok ? `Déplacé « ${r.title} » : ${r.from} → ${r.to}` : undefined,
      };
    }
    case 'add_book': {
      const r = (await addBook({
        title: str(input.title),
        crate: str(input.crate),
        author: str(input.author) || undefined,
        publisher: str(input.publisher) || undefined,
        year: num(input.year),
        kind: str(input.kind) || undefined,
        summary: str(input.summary) || undefined,
        height_cm: num(input.height_cm),
        depth_cm: num(input.depth_cm),
        thickness_cm: num(input.thickness_cm),
        after_book_id: str(input.after_book_id) || undefined,
      })) as { ok?: boolean; title?: string; crate?: string };
      return { result: r, action: r.ok ? `Ajouté « ${r.title} » dans ${r.crate}` : undefined };
    }
    case 'delete_book': {
      const r = (await deleteBook({
        book_id: str(input.book_id),
        confirmed: input.confirmed === true,
      })) as { ok?: boolean; deleted?: string; was_in?: string };
      return { result: r, action: r.ok ? `Supprimé « ${r.deleted} » (${r.was_in})` : undefined };
    }
    default:
      return { result: { error: `Outil inconnu : ${name}` } };
  }
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
 * POST /api/ai — pose une question à Claude, qui interroge la bibliothèque avec des outils. La clé API
 * est celle de la personne : elle sert à cette seule requête, jamais enregistrée ni journalisée. Les
 * outils de modification ne sont proposés que si `token` prouve que le code d'Édition a été saisi.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  let body: { key?: unknown; messages?: unknown; token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const turns = parseTurns(body.messages);
  if (!key) return NextResponse.json({ ok: false, reason: 'no-key' }, { status: 400 });
  if (!turns) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' }, { status: 503 });

  const writes = isEditToken(body.token);
  const allowed = new Set([...READ_TOOLS, ...(writes ? WRITE_TOOLS : [])].map((t) => t.name));
  const actions: string[] = [];

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const messages: Anthropic.MessageParam[] = [...turns];
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: BASE + (writes ? WRITE_RULES : READ_ONLY) },
      {
        type: 'text',
        text: `Vue d'ensemble : ${await overview()}`,
        cache_control: { type: 'ephemeral' },
      },
    ];
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system,
        tools: [...READ_TOOLS, ...(writes ? WRITE_TOOLS : [])],
        messages,
      });
      if (response.stop_reason === 'refusal')
        return NextResponse.json({ ok: false, reason: 'refusal' });
      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
          .trim();
        return NextResponse.json({
          ok: true,
          text: text || '(réponse vide)',
          changed: actions.length > 0,
          actions,
        });
      }
      // les blocs de la réponse (réflexion comprise) sont renvoyés tels quels, puis les résultats
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        if (!allowed.has(block.name)) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            is_error: true,
            content: "Outil indisponible : l'édition est verrouillée.",
          });
          continue;
        }
        const { result, action } = await runTool(block.name, (block.input ?? {}) as Input);
        if (action) actions.push(action);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: results });
    }
    return NextResponse.json({
      ok: true,
      text: 'Je n’ai pas réussi à terminer en quelques étapes : reformule ou découpe ta demande.',
      changed: actions.length > 0,
      actions,
    });
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
