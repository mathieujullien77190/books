import { NextResponse } from 'next/server';

import { clearFails, clientKey, isBlocked, recordFail } from '@/lib/attempts';
import { EDIT_CODE, editEnabled, isEditToken, sameSecret, signEditToken } from '@/lib/edit';

/**
 * POST /api/edit — { code } : si le code est bon, renvoie un jeton que le client garde dans son
 * localStorage ; { token } : dit si ce jeton est (encore) valide. Le code n'est jamais envoyé au client.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  let body: { code?: unknown; token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof body.code === 'string') {
    // pas de EDIT_CODE dans l'environnement : Édition désactivée, aucun code n'est accepté
    if (!editEnabled) return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 503 });
    const key = clientKey(request);
    // trop d'essais ratés : plus aucun essai (même le bon code) pendant quelques minutes
    if (await isBlocked(key))
      return NextResponse.json({ ok: false, reason: 'too-many' }, { status: 429 });
    if (!sameSecret(body.code, EDIT_CODE)) {
      await recordFail(key);
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    await clearFails(key);
    return NextResponse.json({ ok: true, token: signEditToken() });
  }
  if (isEditToken(body.token)) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false }, { status: 401 });
};
