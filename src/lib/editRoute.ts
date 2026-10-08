import { NextResponse } from 'next/server';

import { isEditToken } from '@/lib/edit';
import { hasMongoConfig } from '@/lib/mongodb';

/** Ce que renvoient les fonctions de `library.ts` : `ok` ou une erreur lisible. */
type Outcome = { ok?: boolean; error?: string };

/**
 * Corps commun des routes d'écriture (`/api/books/*`) : lit le JSON, exige le jeton d'Édition et la base,
 * puis passe le corps à `handle`, qui renvoie `null` si ses champs sont invalides ou le résultat de
 * l'opération (200 si `ok`, sinon 404 avec la raison).
 */
export const editRoute =
  <Body extends { token?: unknown }>(handle: (body: Body) => Promise<Outcome | null>) =>
  async (request: Request): Promise<NextResponse> => {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
    }
    if (!isEditToken(body.token))
      return NextResponse.json({ ok: false, reason: 'locked' }, { status: 401 });
    if (!hasMongoConfig())
      return NextResponse.json({ ok: false, reason: 'no-db' }, { status: 503 });
    const result = await handle(body);
    if (!result) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
    return NextResponse.json(result.ok ? result : { ok: false, reason: result.error }, {
      status: result.ok ? 200 : 404,
    });
  };
