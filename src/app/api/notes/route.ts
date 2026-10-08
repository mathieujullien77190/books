import { NextResponse } from 'next/server';

import { getDb, hasMongoConfig } from '@/lib/mongodb';

type Note = { _id: string; text: string };
const NOTE_ID = 'main';
/** Garde-fou : un calepin, pas un fichier. */
const MAX_LENGTH = 100_000;

/** GET /api/notes — texte du calepin. */
export const GET = async (): Promise<NextResponse> => {
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' });
  try {
    const db = await getDb();
    const note = await db.collection<Note>('notes').findOne({ _id: NOTE_ID });
    return NextResponse.json({ ok: true, text: note?.text ?? '' });
  } catch (err) {
    console.error('load notes failed', err);
    return NextResponse.json({ ok: false, reason: 'error' });
  }
};

/** PUT /api/notes — remplace le texte du calepin. */
export const PUT = async (request: Request): Promise<NextResponse> => {
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' });
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.length > MAX_LENGTH)
      return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
    const db = await getDb();
    await db
      .collection<Note>('notes')
      .updateOne({ _id: NOTE_ID }, { $set: { text: body.text } }, { upsert: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('save notes failed', err);
    return NextResponse.json({ ok: false, reason: 'error' });
  }
};
