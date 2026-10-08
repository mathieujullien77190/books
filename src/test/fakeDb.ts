import type { Db } from 'mongodb';
import { vi } from 'vitest';

/** Faux `Db` MongoDB en mémoire, limité aux opérations utilisées par l'appli. */
export type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = { $set?: Doc; $unset?: Doc; $inc?: Record<string, number> };
type FindOptions = { projection?: Record<string, 0 | 1>; sort?: Record<string, 1 | -1> };

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([k, cond]) => {
    if (cond && typeof cond === 'object' && '$nin' in cond)
      return !(cond as { $nin: unknown[] }).$nin.includes(doc[k]);
    return doc[k] === cond;
  });

const applyUpdate = (doc: Doc, update: Update): void => {
  Object.assign(doc, update.$set);
  for (const k of Object.keys(update.$unset ?? {})) delete doc[k];
  for (const [k, n] of Object.entries(update.$inc ?? {})) doc[k] = ((doc[k] as number) ?? 0) + n;
};

const project = (doc: Doc, projection?: Record<string, 0 | 1>): Doc => {
  const out = { ...doc };
  for (const [k, v] of Object.entries(projection ?? {})) if (v === 0) delete out[k];
  return out;
};

class FakeCollection {
  constructor(readonly docs: Doc[]) {}

  find = (filter: Filter = {}, opts: FindOptions = {}) => {
    let found = this.docs.filter((d) => matches(d, filter));
    const sort = Object.entries(opts.sort ?? {})[0];
    if (sort)
      found = [...found].sort(
        (a, b) => (((a[sort[0]] as number) ?? -1e12) - ((b[sort[0]] as number) ?? -1e12)) * sort[1],
      );
    return { toArray: async () => found.map((d) => project(d, opts.projection)) };
  };

  findOne = async (filter: Filter = {}, opts: FindOptions = {}) => {
    const d = this.docs.find((x) => matches(x, filter));
    return d ? project(d, opts.projection) : null;
  };

  insertOne = async (doc: Doc) => {
    if (doc._id !== undefined && this.docs.some((d) => d._id === doc._id))
      throw new Error('E11000 duplicate key');
    this.docs.push({ ...doc });
    return { acknowledged: true };
  };

  updateOne = async (filter: Filter, update: Update, opts: { upsert?: boolean } = {}) => {
    const d = this.docs.find((x) => matches(x, filter));
    if (d) applyUpdate(d, update);
    else if (opts.upsert) {
      const created: Doc = { ...filter };
      applyUpdate(created, update);
      this.docs.push(created);
    }
    return { acknowledged: true };
  };

  findOneAndUpdate = async (filter: Filter, update: Update) => {
    const d = this.docs.find((x) => matches(x, filter));
    if (!d) return null;
    applyUpdate(d, update);
    return { ...d };
  };

  deleteOne = async (filter: Filter) => {
    const i = this.docs.findIndex((x) => matches(x, filter));
    if (i >= 0) this.docs.splice(i, 1);
    return { acknowledged: true };
  };

  bulkWrite = async (
    ops: Record<string, { filter: Filter; replacement?: Doc; upsert?: boolean }>[],
  ) => {
    for (const op of ops) {
      if (op.replaceOne) {
        const { filter, replacement, upsert } = op.replaceOne;
        const i = this.docs.findIndex((x) => matches(x, filter));
        if (i >= 0) this.docs[i] = { _id: this.docs[i]!._id, ...replacement };
        else if (upsert) this.docs.push({ ...replacement });
      } else if (op.deleteMany) {
        const keep = this.docs.filter((x) => !matches(x, op.deleteMany!.filter));
        this.docs.splice(0, this.docs.length, ...keep);
      }
    }
    return { acknowledged: true };
  };
}

/** Crée un faux `Db` ; `data` expose le contenu de chaque collection pour les assertions. */
export const createFakeDb = (initial: Record<string, Doc[]> = {}) => {
  const data: Record<string, Doc[]> = {};
  for (const [name, docs] of Object.entries(initial)) data[name] = docs.map((d) => ({ ...d }));
  const cols = new Map<string, FakeCollection>();
  const collection = vi.fn((name: string) => {
    let c = cols.get(name);
    if (!c) {
      c = new FakeCollection((data[name] ??= []));
      cols.set(name, c);
    }
    return c;
  });
  return { db: { collection } as unknown as Db, data, collection };
};
