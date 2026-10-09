import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const m = vi.hoisted(() => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`api ${status}`);
    }
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  return {
    APIError,
    AuthenticationError,
    PermissionDeniedError,
    RateLimitError,
    create: vi.fn(),
    ctor: vi.fn(),
    isEditToken: vi.fn(),
    hasMongoConfig: vi.fn(),
    lib: {
      addBook: vi.fn(),
      crateContents: vi.fn(),
      deleteBook: vi.fn(),
      moveBook: vi.fn(),
      overview: vi.fn(),
      searchLibrary: vi.fn(),
      seriesGaps: vi.fn(),
      setBookDimensions: vi.fn(),
      swapBooks: vi.fn(),
    },
  };
});

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = m.APIError;
    static AuthenticationError = m.AuthenticationError;
    static PermissionDeniedError = m.PermissionDeniedError;
    static RateLimitError = m.RateLimitError;
    messages = { create: m.create };
    constructor(opts: unknown) {
      m.ctor(opts);
    }
  }
  return { default: Anthropic };
});
vi.mock('@/lib/edit', () => ({ isEditToken: m.isEditToken }));
vi.mock('@/lib/mongodb', () => ({ hasMongoConfig: m.hasMongoConfig }));
vi.mock('@/lib/library', () => m.lib);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MSGS = [{ role: 'user', content: 'Où est Zorro ?' }];
const call = (body: unknown) =>
  POST(new Request('http://x/api/ai', { method: 'POST', body: JSON.stringify(body) }));
const ask = (extra: Json = {}) => call({ key: 'sk-test', messages: MSGS, ...extra });

const answer = (text: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
});
const use = (name: string, input: unknown, id = `t-${name}`) => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const tools = (...content: unknown[]) => ({ stop_reason: 'tool_use', content });
const toolNames = (req: Json) => (req.tools as { name: string }[]).map((t) => t.name);

/** Une réponse d'outil suivie de la réponse finale ; renvoie la requête n°2 et le corps. */
const withTool = async (block: unknown, extra: Json = { token: 't' }) => {
  m.create.mockResolvedValueOnce(tools(block)).mockResolvedValueOnce(answer('fini'));
  const res = await ask(extra);
  return { body: (await res.json()) as Json, second: m.create.mock.calls[1]![0] as Json };
};

beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockReset();
  m.isEditToken.mockReturnValue(false);
  m.hasMongoConfig.mockReturnValue(true);
  m.lib.overview.mockResolvedValue('3 livres.');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/ai : validation', () => {
  it('400 sur un corps illisible', async () => {
    const res = await POST(new Request('http://x/api/ai', { method: 'POST', body: '{nope' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['absente', undefined],
    ['non textuelle', 42],
    ['blanche', '   '],
  ])('400 no-key quand la clé est %s', async (_, key) => {
    const res = await call({ key, messages: MSGS });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'no-key' });
  });

  it('no-key passe avant la validation des messages', async () => {
    const res = await call({ messages: 'x' });
    expect(await res.json()).toEqual({ ok: false, reason: 'no-key' });
  });

  it.each([
    ['pas un tableau', 'bonjour'],
    ['tableau vide', []],
    ['trop de tours', Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' }))],
    ['rôle inconnu', [{ role: 'system', content: 'x' }]],
    ['contenu non textuel', [{ role: 'user', content: 3 }]],
    ['élément nul', [null]],
    ['contenu blanc', [{ role: 'user', content: '  ' }]],
    ['contenu trop long', [{ role: 'user', content: 'x'.repeat(4001) }]],
    [
      'commence par l’assistant',
      [
        { role: 'assistant', content: 'a' },
        { role: 'user', content: 'b' },
      ],
    ],
    [
      'finit par l’assistant',
      [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    ],
  ])('400 invalid : %s', async (_, messages) => {
    const res = await call({ key: 'k', messages });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('accepte 20 tours alternés et un contenu de 4000 caractères', async () => {
    const messages = Array.from({ length: 19 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: 'x'.repeat(i === 0 ? 4000 : 1),
    }));
    m.create.mockResolvedValue(answer('ok'));
    const res = await call({ key: 'k', messages });
    expect(res.status).toBe(200);
  });

  it('503 sans base', async () => {
    m.hasMongoConfig.mockReturnValue(false);
    const res = await ask();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: 'no-db' });
    expect(m.ctor).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai : réponse directe', () => {
  it('renvoie le texte, sans modification, avec les seuls outils de lecture', async () => {
    m.create.mockResolvedValue(answer('  Dans P2.  '));
    const res = await ask({ key: '  sk-test  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: 'Dans P2.', changed: false, actions: [] });
    expect(m.ctor).toHaveBeenCalledWith({ apiKey: 'sk-test', maxRetries: 1 });
    const req = m.create.mock.calls[0]![0] as Json;
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req).not.toHaveProperty('output_config');
    expect(req.max_tokens).toBe(2000);
    expect(toolNames(req)).toEqual(['search_books', 'series_gaps', 'get_crate_contents']);
    expect(req.messages).toEqual(MSGS);
    expect(req.system[0].text).toContain("Tu n'as que des outils de consultation");
    expect(req.system[0].text).not.toContain('delete_book : demande');
    expect(req.system[1]).toMatchObject({
      text: "Vue d'ensemble : 3 livres.",
      cache_control: { type: 'ephemeral' },
    });
  });

  it("avec le jeton d'Édition, propose aussi les outils d'écriture", async () => {
    m.isEditToken.mockReturnValue(true);
    m.create.mockResolvedValue(answer('ok'));
    await ask({ token: 'tok' });
    expect(m.isEditToken).toHaveBeenCalledWith('tok');
    const req = m.create.mock.calls[0]![0] as Json;
    expect(toolNames(req)).toEqual([
      'search_books',
      'series_gaps',
      'get_crate_contents',
      'move_book',
      'swap_books',
      'add_book',
      'set_book_dimensions',
      'delete_book',
    ]);
    expect(req.system[0].text).toContain('delete_book : demande toujours une confirmation');
    expect(req.system[0].text).not.toContain("Tu n'as que des outils de consultation");
  });

  it.each([
    ['sonnet', 'claude-sonnet-5-5', true],
    ['opus', 'claude-opus-5-5', true],
    ['haiku', 'claude-haiku-5-5', false],
    ['inconnu', 'claude-haiku-5-5', false],
    [12, 'claude-haiku-5-5', false],
  ])('modèle %s → %s (effort réglé : %s)', async (model, expected, effort) => {
    m.create.mockResolvedValue(answer('ok'));
    await ask({ model });
    const req = m.create.mock.calls[0]![0] as Json;
    expect(req.model).toBe(expected);
    if (effort) expect(req.output_config).toEqual({ effort: 'low' });
    else expect(req).not.toHaveProperty('output_config');
  });

  it('assemble les blocs de texte et ignore les autres', async () => {
    m.create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: 'Un ' },
        { type: 'text', text: 'deux' },
      ],
    });
    expect(await (await ask()).json()).toMatchObject({ text: 'Un deux' });
  });

  it('remplace une réponse vide', async () => {
    m.create.mockResolvedValue({ stop_reason: 'max_tokens', content: [] });
    expect(await (await ask()).json()).toMatchObject({ ok: true, text: '(réponse vide)' });
  });

  it('transmet un refus tel quel', async () => {
    m.create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'refusal' });
  });
});

describe('POST /api/ai : outils', () => {
  it('search_books : convertit les arguments et renvoie le résultat sérialisé', async () => {
    m.lib.searchLibrary.mockResolvedValue({ total: 1, books: [] });
    const { body, second } = await withTool(
      use('search_books', {
        query: 'zorro',
        author: '',
        crate: 'P2',
        kind: 'bd',
        limit: 3,
        details: true,
      }),
      {},
    );
    expect(m.lib.searchLibrary).toHaveBeenCalledWith({
      query: 'zorro',
      author: undefined,
      crate: 'P2',
      kind: 'bd',
      limit: 3,
      details: true,
    });
    expect(body).toEqual({ ok: true, text: 'fini', changed: false, actions: [] });
    const [assistant, user] = second.messages.slice(-2);
    expect(assistant.role).toBe('assistant');
    expect(assistant.content[0].name).toBe('search_books');
    expect(user).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't-search_books',
          content: JSON.stringify({ total: 1, books: [] }),
        },
      ],
    });
  });

  it('search_books : arguments invalides ignorés', async () => {
    m.lib.searchLibrary.mockResolvedValue({});
    await withTool(use('search_books', { query: 5, limit: 'dix', details: 'oui' }), {});
    expect(m.lib.searchLibrary).toHaveBeenCalledWith({
      query: undefined,
      author: undefined,
      crate: undefined,
      kind: undefined,
      limit: undefined,
      details: false,
    });
  });

  it('une entrée absente ou nulle équivaut à un objet vide', async () => {
    m.lib.searchLibrary.mockResolvedValue({});
    await withTool(use('search_books', null), {});
    expect(m.lib.searchLibrary).toHaveBeenCalledWith(expect.objectContaining({ details: false }));
    m.create.mockReset();
    await withTool(use('search_books', undefined), {});
    expect(m.lib.searchLibrary).toHaveBeenCalledTimes(2);
  });

  it('limit infinie ignorée', async () => {
    m.lib.searchLibrary.mockResolvedValue({});
    await withTool(use('search_books', { limit: Infinity }), {});
    expect(m.lib.searchLibrary.mock.calls[0]![0].limit).toBeUndefined();
  });

  it('series_gaps', async () => {
    m.lib.seriesGaps.mockResolvedValue({ withGaps: [] });
    await withTool(use('series_gaps', { series: 'hulotte' }), {});
    expect(m.lib.seriesGaps).toHaveBeenCalledWith({ series: 'hulotte' });
    m.create.mockReset();
    await withTool(use('series_gaps', {}), {});
    expect(m.lib.seriesGaps).toHaveBeenLastCalledWith({ series: undefined });
  });

  it('get_crate_contents', async () => {
    m.lib.crateContents.mockResolvedValue({ crate: 'P2', books: [] });
    await withTool(use('get_crate_contents', { crate: 'P2' }), {});
    expect(m.lib.crateContents).toHaveBeenCalledWith('P2');
    m.create.mockReset();
    await withTool(use('get_crate_contents', {}), {});
    expect(m.lib.crateContents).toHaveBeenLastCalledWith('');
  });

  describe('outils d’écriture avec le jeton', () => {
    beforeEach(() => m.isEditToken.mockReturnValue(true));

    it('move_book réussi : action et changed', async () => {
      m.lib.moveBook.mockResolvedValue({ ok: true, title: 'Zorro', from: 'P1', to: 'G1' });
      const { body } = await withTool(
        use('move_book', { book_id: 'z', crate: 'G1', after_book_id: 'a', position: 2 }),
      );
      expect(m.lib.moveBook).toHaveBeenCalledWith({
        book_id: 'z',
        crate: 'G1',
        after_book_id: 'a',
        position: 2,
      });
      expect(body).toEqual({
        ok: true,
        text: 'fini',
        changed: true,
        actions: ['Déplacé « Zorro » : P1 → G1'],
      });
    });

    it('move_book en erreur : pas d’action', async () => {
      m.lib.moveBook.mockResolvedValue({ error: 'Livre introuvable : z' });
      const { body, second } = await withTool(use('move_book', {}));
      expect(m.lib.moveBook).toHaveBeenCalledWith({
        book_id: '',
        crate: '',
        after_book_id: undefined,
        position: undefined,
      });
      expect(body).toMatchObject({ changed: false, actions: [] });
      expect(second.messages.at(-1).content[0].content).toBe(
        JSON.stringify({ error: 'Livre introuvable : z' }),
      );
    });

    it('swap_books réussi', async () => {
      m.lib.swapBooks.mockResolvedValue({
        ok: true,
        a: { title: 'A', from: 'P1', to: 'G1' },
        b: { title: 'B', from: 'G1', to: 'P1' },
      });
      const { body } = await withTool(use('swap_books', { book_a: 'a', book_b: 'b' }));
      expect(m.lib.swapBooks).toHaveBeenCalledWith({ book_a: 'a', book_b: 'b' });
      expect(body.actions).toEqual(['Échangé « A » (P1) et « B » (G1)']);
    });

    it('swap_books en erreur', async () => {
      m.lib.swapBooks.mockResolvedValue({ error: 'Il faut deux livres différents' });
      const { body } = await withTool(use('swap_books', {}));
      expect(m.lib.swapBooks).toHaveBeenCalledWith({ book_a: '', book_b: '' });
      expect(body).toMatchObject({ changed: false, actions: [] });
    });

    it('add_book réussi : tous les champs sont convertis', async () => {
      m.lib.addBook.mockResolvedValue({ ok: true, title: 'Neuf', crate: 'M1' });
      const { body } = await withTool(
        use('add_book', {
          title: 'Neuf',
          crate: 'M1',
          author: 'Moi',
          publisher: 'Éd.',
          year: 2020,
          kind: 'bd',
          summary: 'Résumé',
          height_cm: 21,
          depth_cm: 14,
          thickness_cm: 2,
          after_book_id: 'a',
        }),
      );
      expect(m.lib.addBook).toHaveBeenCalledWith({
        title: 'Neuf',
        crate: 'M1',
        author: 'Moi',
        publisher: 'Éd.',
        year: 2020,
        kind: 'bd',
        summary: 'Résumé',
        height_cm: 21,
        depth_cm: 14,
        thickness_cm: 2,
        after_book_id: 'a',
      });
      expect(body.actions).toEqual(['Ajouté « Neuf » dans M1']);
    });

    it('add_book en erreur, champs facultatifs absents', async () => {
      m.lib.addBook.mockResolvedValue({ error: 'Titre vide' });
      const { body } = await withTool(use('add_book', {}));
      expect(m.lib.addBook).toHaveBeenCalledWith({
        title: '',
        crate: '',
        author: undefined,
        publisher: undefined,
        year: undefined,
        kind: undefined,
        summary: undefined,
        height_cm: undefined,
        depth_cm: undefined,
        thickness_cm: undefined,
        after_book_id: undefined,
      });
      expect(body.actions).toEqual([]);
    });

    it('set_book_dimensions : transmet les dimensions et résume le changement', async () => {
      m.lib.setBookDimensions.mockResolvedValue({
        ok: true,
        title: 'Zorro',
        height_cm: 28,
        depth_cm: 20,
        thickness_mm: 35,
      });
      const { body } = await withTool(
        use('set_book_dimensions', { book_id: 'z', height_cm: 28, depth_cm: 20, thickness_mm: 35 }),
      );
      expect(m.lib.setBookDimensions).toHaveBeenCalledWith({
        book_id: 'z',
        height_cm: 28,
        depth_cm: 20,
        thickness_mm: 35,
      });
      expect(body.actions).toEqual(["Dimensions de « Zorro » : 28 × 20 cm, 35 mm d'épaisseur"]);
      expect(body.changed).toBe(true);
    });

    it('set_book_dimensions : une erreur ne donne aucune action', async () => {
      m.lib.setBookDimensions.mockResolvedValue({ error: 'height_cm hors limites' });
      const { body } = await withTool(use('set_book_dimensions', { book_id: 'z', height_cm: 'x' }));
      expect(m.lib.setBookDimensions).toHaveBeenCalledWith({
        book_id: 'z',
        height_cm: undefined,
        depth_cm: undefined,
        thickness_mm: undefined,
      });
      expect(body).toMatchObject({ changed: false, actions: [] });
    });

    it('delete_book confirmé', async () => {
      m.lib.deleteBook.mockResolvedValue({ ok: true, deleted: 'Zorro', was_in: 'P1' });
      const { body } = await withTool(use('delete_book', { book_id: 'z', confirmed: true }));
      expect(m.lib.deleteBook).toHaveBeenCalledWith({ book_id: 'z', confirmed: true });
      expect(body.actions).toEqual(['Supprimé « Zorro » (P1)']);
    });

    it('delete_book : « confirmed » doit être exactement true', async () => {
      m.lib.deleteBook.mockResolvedValue({ error: 'Suppression non confirmée' });
      const { body } = await withTool(use('delete_book', { book_id: 'z', confirmed: 'true' }));
      expect(m.lib.deleteBook).toHaveBeenCalledWith({ book_id: 'z', confirmed: false });
      expect(body).toMatchObject({ changed: false, actions: [] });
    });

    it('cumule les actions de plusieurs outils dans un même tour', async () => {
      m.lib.moveBook.mockResolvedValue({ ok: true, title: 'A', from: 'P1', to: 'G1' });
      m.lib.deleteBook.mockResolvedValue({ ok: true, deleted: 'B', was_in: 'M1' });
      m.create
        .mockResolvedValueOnce(
          tools(
            { type: 'text', text: 'Je m’en occupe' },
            use('move_book', { book_id: 'a', crate: 'G1' }, 'u1'),
            use('delete_book', { book_id: 'b', confirmed: true }, 'u2'),
          ),
        )
        .mockResolvedValueOnce(answer('fait'));
      const body = (await (await ask({ token: 't' })).json()) as Json;
      expect(body.actions).toHaveLength(2);
      const results = (m.create.mock.calls[1]![0] as Json).messages.at(-1).content;
      expect(results.map((r: Json) => r.tool_use_id)).toEqual(['u1', 'u2']);
    });
  });

  it('refuse un outil d’écriture sans jeton, sans l’exécuter', async () => {
    const { body, second } = await withTool(
      use('delete_book', { book_id: 'z', confirmed: true }),
      {},
    );
    expect(m.lib.deleteBook).not.toHaveBeenCalled();
    expect(body).toMatchObject({ changed: false, actions: [] });
    expect(second.messages.at(-1).content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 't-delete_book',
        is_error: true,
        content: 'Outil indisponible.',
      },
    ]);
  });

  it('refuse un outil inventé, même avec le jeton', async () => {
    m.isEditToken.mockReturnValue(true);
    const { second } = await withTool(use('rm_rf', {}));
    expect(second.messages.at(-1).content[0]).toMatchObject({
      is_error: true,
      content: 'Outil indisponible.',
    });
  });

  it('s’arrête après 5 tours d’outils avec un message de repli', async () => {
    m.isEditToken.mockReturnValue(true);
    m.lib.moveBook.mockResolvedValue({ ok: true, title: 'A', from: 'P1', to: 'G1' });
    m.create.mockResolvedValue(tools(use('move_book', { book_id: 'a', crate: 'G1' })));
    const res = await ask({ token: 't' });
    expect(m.create).toHaveBeenCalledTimes(5);
    const body = (await res.json()) as Json;
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.text).toContain('Je n’ai pas réussi à terminer');
    expect(body.changed).toBe(true);
    expect(body.actions).toHaveLength(5);
  });
});

describe('POST /api/ai : erreurs du SDK', () => {
  it.each([
    ['AuthenticationError', m.AuthenticationError, 401, { ok: false, reason: 'bad-key' }],
    ['PermissionDeniedError', m.PermissionDeniedError, 401, { ok: false, reason: 'bad-key' }],
    ['RateLimitError', m.RateLimitError, 429, { ok: false, reason: 'rate-limit' }],
    ['APIError', m.APIError, 502, { ok: false, reason: 'api', status: 503 }],
  ])('%s → %i', async (_, Cls, status, expected) => {
    m.create.mockRejectedValue(new Cls(Cls === m.APIError ? 503 : 400));
    const res = await ask();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(expected);
  });

  it('erreur inconnue → 500', async () => {
    m.create.mockRejectedValue(new Error('boum'));
    const res = await ask();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, reason: 'error' });
  });

  it('une base injoignable pendant la préparation → 500', async () => {
    m.lib.overview.mockRejectedValue(new Error('down'));
    const res = await ask();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, reason: 'error' });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('une erreur d’outil en cours de route → 500', async () => {
    m.lib.searchLibrary.mockRejectedValue(new Error('down'));
    m.create.mockResolvedValue(tools(use('search_books', {})));
    const res = await ask();
    expect(res.status).toBe(500);
  });
});
