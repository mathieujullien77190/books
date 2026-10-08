# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Projet

« Bibliothèque » : rangement 3D de livres dans des caisses (Next.js 16 + React 19 + three.js, Tailwind 4). Une seule page (`src/app/page.tsx` → `CratesApp`). Code et commentaires en français.

## Commandes

```bash
npm run dev          # serveur dev (aussi accessible depuis le LAN, voir allowedDevOrigins dans next.config.ts)
npm run build
npm run lint         # eslint ; lint:fix pour corriger
npm run typecheck    # tsc --noEmit
npm run format       # prettier (format:check pour vérifier)
```

Pas de suite de tests.

## Architecture

- **`src/engine/CrateEngine.ts` détient tout l'état du domaine** (caisses, livres, sélection, mode, historique d'annulation). React ne possède pas cet état : il s'abonne via `subscribe`/`getSnapshot` (`useSyncExternalStore`, voir `CratesApp/helpers.ts`) et appelle les méthodes publiques du moteur (`addCrate`, `addBook`, `updateBook`, `setCrateFlat`…). Toute mutation passe par `pushHistory()` puis `refresh()` (placement → layout des livres → sauvegarde → emit).
- **Persistance : MongoDB uniquement** (`MONGODB_URI` dans `.env.local`, voir `.env.local.example`). Au démarrage le moteur lit `GET /api/state` (`hydrate()`), puis chaque modification envoie l'état complet (débattu 800 ms) à `POST /api/sync`, qui **remplace** les collections `crates`/`books` (champ `order` ajouté pour garder l'ordre, retiré à la lecture). Tant que l'état Mongo n'est pas lu (`hydrated`), rien n'est envoyé : sinon une page fraîche écraserait la base. Pas de base / injoignable = scène vide, rien n'est sauvegardé. Base vide au premier lancement : migration unique de l'ancienne sauvegarde `localStorage` (clé `STORE_KEY`) ou des caisses par défaut, puis la clé locale est effacée.
- **Caisses** : tailles `S`/`M`/`L` (bois, cotes fixes dans `SIZES`) et `X` (transparente, `dims` libres). Unités scène : 1 = 10 cm. Le `y` d'une caisse est recalculé par gravité dans `placeCrates()` selon l'ordre du tableau `crates` (la dernière posée atterrit sur celles qu'elle chevauche). Les étiquettes affichées (`P2`, `G1`, `M3`, `T1`…) ne sont pas stockées : `crateLabels()` les dérive de la lettre de taille (`SIZE_LETTERS` : S→P, M→M, L→G, X→T) + le rang parmi les caisses de même taille dans l'ordre du tableau. Réordonner `crates` renumérote donc les caisses.
- **Livres** : `book.crate` = id de caisse ou `null` (pile « à côté »). `engine/books.ts` calcule le repère intérieur d'une caisse selon son orientation (`crateFrame`) puis place les livres (`placeInCrate`) debout ou à plat ; un livre qui ne rentre pas part dans la pile à côté (compté dans `full`). Pas de redistribution automatique entre caisses.
- **Rendu** : deux passes — couche 0 la scène, couche 1 le livre « sorti » dessiné par-dessus. Gizmos de déplacement/rotation dans `moveGizmo.ts`/`rotateGizmo.ts`, orientation des caisses par quaternions à pas de 90° (`orientation.ts`).

- **Modes** : l'appli démarre en **Lecture** (clic sur un livre = l'ouvrir ; grille, repère et coques des caisses transparentes masqués). En **Édition**, un clic sur un livre sélectionne sa caisse ; on déplace/tourne les caisses et on glisse les livres.

## Ajouter ou compléter un livre

Quand un livre est ajouté (photo, titre) ou que sa fiche est incomplète, **aller chercher la couverture et les infos** au lieu de les laisser vides :

- **Couverture** : la vraie couverture (jamais une page intérieure), dans `public/covers/`, référencée `/covers/<fichier>`, ~500 px de large. Sources : site de l'éditeur (La Hulotte : API WooCommerce publique `https://lahulotte.fr/wp-json/wc/store/v1/products?per_page=100`, images + descriptions), puis par ISBN : Amazon `https://m.media-amazon.com/images/P/<ISBN10>.01._SCLZZZZZZZ_.jpg`, Google Books `https://books.google.com/books/content?vid=ISBN:<isbn>&printsec=frontcover&img=1&zoom=1`, Open Library (`search.json` pour l'ISBN, puis `covers.openlibrary.org/b/isbn/<isbn>-L.jpg`). Photo fournie par l'utilisateur : la recadrer et redresser (elle est prise en perspective). Regarder chaque image téléchargée (planche-contact pour un lot) avant de la garder.
- **`color`** = couleur dominante de la couverture (histogramme 8 niveaux par canal, pondéré par la saturation, noir pénalisé) : elle colore le dos, la tranche et les bords, qui doivent aller avec le recto.
- **Infos** : `summary` (résumé de l'éditeur), `author`, `publisher`, `kind`, `year`, et les dimensions réelles `h`/`d`/`t` (cm / 10 ; épaisseur en mm / 100). N'écrire `year` que s'il est établi, ne pas le deviner : dire ce qui manque.
- **Écriture directe en base** (script Node avec le driver `mongodb`, URI lue dans `.env.local`) : incrémenter `meta` `{ _id: 'state' }.rev` avant et après, sinon une page ouverte écrase la modification (`/api/sync` refuse une révision périmée). Garder `order` (intercaler à `order + 0.5`).

## Conventions

- Un dossier par composant avec barrel `index.ts` et fichiers `constants.ts`/`helpers.ts`/`types.ts` ; partagés dans `src/{constants,helpers,types}` et `src/components/ui`. Alias `@/*` → `src/*`.
- `index.html` à la racine est l'ancien prototype autonome, pas utilisé par l'appli Next.
