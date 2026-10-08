import {
  MongoClient,
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  type Document,
} from 'mongodb';

/**
 * Connexion MongoDB Atlas partagée entre les requêtes (évite de ré-ouvrir une connexion à chaque
 * appel d'API). Attend `MONGODB_URI` en variable d'environnement (voir .env.local.example) ;
 * `MONGODB_DB` choisit la base (par défaut "bibliotheque").
 */
let clientPromise: Promise<MongoClient> | null = null;

const getClientPromise = (): Promise<MongoClient> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI manquant (voir .env.local.example)');
  if (!clientPromise) clientPromise = new MongoClient(uri).connect();
  return clientPromise;
};

export const getDb = async (): Promise<Db> => {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB || 'bibliotheque');
};

/**
 * Révision de l'état (collection `meta`, document `state`), incrémentée à chaque écriture. Un client
 * qui envoie une révision dépassée n'écrase rien : la base a changé ailleurs (autre onglet, script).
 */
type Meta = { _id: string; rev: number };
const meta = (db: Db) => db.collection<Meta>('meta');

export const readRev = async (db: Db): Promise<number> =>
  (await meta(db).findOne({ _id: 'state' }))?.rev ?? 0;

/** Passe atomiquement de `rev` à `rev + 1` ; false si la base n'est plus à `rev`. */
export const claimRev = async (db: Db, rev: number): Promise<boolean> => {
  if (rev === 0) {
    try {
      await meta(db).insertOne({ _id: 'state', rev: 1 });
      return true;
    } catch {
      return false; // déjà créée ailleurs entre-temps
    }
  }
  return !!(await meta(db).findOneAndUpdate({ _id: 'state', rev }, { $inc: { rev: 1 } }));
};

/**
 * Remplace le contenu d'une collection par `items` (identifiés par leur `id`, `order` = rang) sans jamais la
 * vider : un seul lot ordonné qui écrit (upsert) chaque élément puis supprime ceux qui ne sont plus là. Une
 * panne en cours de route laisse donc au pire des anciens éléments en trop, jamais une collection vide.
 */
export const replaceAll = async <T extends { id: string }>(
  col: Collection<Document>,
  items: T[],
): Promise<void> => {
  const ops: AnyBulkWriteOperation<Document>[] = items.map((item, order) => ({
    replaceOne: { filter: { id: item.id }, replacement: { ...item, order }, upsert: true },
  }));
  ops.push({ deleteMany: { filter: { id: { $nin: items.map((i) => i.id) } } } });
  await col.bulkWrite(ops, { ordered: true });
};

/** true si MONGODB_URI est configuré : permet aux routes de se rabattre proprement sinon. */
export const hasMongoConfig = (): boolean => !!process.env.MONGODB_URI;
