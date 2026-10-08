import { NextResponse } from 'next/server';

import { EDIT_CODE, isEditToken, sameSecret, signEditToken } from '@/lib/edit';

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
    if (!sameSecret(body.code, EDIT_CODE)) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, token: signEditToken() });
  }
  if (isEditToken(body.token)) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false }, { status: 401 });
};
