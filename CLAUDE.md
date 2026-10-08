# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Projet

« Bibliothèque » : rangement 3D de livres dans des caisses (Next.js 16 + React 19 + three.js, Tailwind 4, MongoDB). Une seule page (`src/app/page.tsx` → `CratesApp`). Code, commentaires et interface en français. Voir `README.md` pour la vue d'ensemble et l'installation.

## Commandes

```bash
npm run dev          # serveur dev (aussi accessible depuis le LAN, voir allowedDevOrigins dans next.config.ts)
npm run build
npm run lint         # eslint ; lint:fix pour corriger
npm run typecheck    # tsc --noEmit
npm run format       # prettier (format:check pour vérifier)
npm test             # vitest (src/**/*.test.ts) ; npm run check = typecheck + lint + test
```

Tests : seulement la logique pure (`helpers`, `cratePlacement`). Pour le reste, `typecheck` + `lint`, et regarder l'appli quand le changement est visuel (si ce n'est pas possible, le dire).

## Architecture

- **`src/engine/CrateEngine.ts` détient tout l'état du domaine** (caisses, livres, sélection, mode, historique d'annulation). React ne possède pas cet état : il s'abonne via `subscribe`/`getSnapshot` (`useSyncExternalStore`, voir `CratesApp/helpers.ts`) et appelle les méthodes publiques du moteur. Toute mutation passe par `pushHistory()` puis `refresh()` (placement → layout des livres → sauvegarde → emit). Le moteur est une façade : `persistence.ts` (base, `rev`, jeton), `history.ts`, `cratePlacement.ts` (gravité, aimantation, fonctions pures), `layout.ts` (cibles des livres), `input.ts` (souris, doigts, clavier), `view.ts` (recentrage, livres voisins), `missingPile.ts`, `decor.ts`.
- **Rendu à la demande** : `tick()` ne redessine que si `dirty` (caméra, livre en mouvement, `emit`, couverture chargée, événement souris/clavier) ; la mésange seule redessine à ~20 i/s et ne recalcule pas les ombres (`shadowDirty`, ombres statiques). Tout nouvel état visible hors de `emit()` doit appeler `touch()`.
- **Persistance : MongoDB uniquement** (`MONGODB_URI` et `MONGODB_DB` dans `.env.local`, voir `.env.local.example`). Au démarrage le moteur lit `GET /api/state` (`hydrate()`), puis chaque modification envoie l'état complet (débattu 800 ms) à `POST /api/sync`, qui écrit `crates` et `books` **par `id`** (`replaceAll` : upsert puis suppression du reste, jamais de collection vidée ; un `id` manquant ou en double est refusé) avec le champ `order` pour garder l'ordre (retiré à la lecture). Une lecture échouée affiche un message avec « Réessayer » (`snap.loadError`) ; `src/app/error.tsx` rattrape les erreurs de rendu. Tant que l'état Mongo n'est pas lu (`hydrated`), rien n'est envoyé : sinon une page fraîche écraserait la base. Pas de base / injoignable = scène vide, rien n'est sauvegardé. Base vide au premier lancement : migration unique de l'ancienne sauvegarde `localStorage` (clé `STORE_KEY`) ou des caisses par défaut.
- **Révision `meta.rev`** : chaque écriture porte la révision sur laquelle elle repose ; `/api/sync` refuse une révision périmée (`conflict`) et le moteur recharge l'état (`hydrate(false)`) au lieu d'écraser. Toute modification faite hors de l'appli (script, Claude) doit incrémenter `meta` `{ _id: 'state' }.rev` **avant et après**, sinon une page ouverte l'efface au prochain envoi.
- **Caisses** : tailles `S`/`M`/`L` (bois, cotes fixes dans `SIZES`) et `X` (transparente, `dims` libres). Unités scène : 1 = 10 cm. Le `y` d'une caisse est recalculé par gravité dans `placeCrates()` selon l'ordre du tableau `crates` (la dernière posée atterrit sur celles qu'elle chevauche). Les étiquettes affichées (`P2`, `G1`, `M3`, `T1`…) ne sont pas stockées : `crateLabels()` les dérive de la lettre de taille (`SIZE_LETTERS` : S→P, M→M, L→G, X→T) + le rang parmi les caisses de même taille dans l'ordre du tableau. Réordonner `crates` renumérote donc les caisses. Réglages par caisse : `flat` (livres à plat en piles ou debout), `overhang` (les livres plus profonds que la caisse y entrent et dépassent devant).
- **Livres** : `book.crate` = id de caisse ou `null` (pile « à côté »). `engine/books.ts` calcule le repère intérieur d'une caisse selon son orientation (`crateFrame`) puis place les livres (`placeInCrate`) debout ou à plat ; un livre qui ne rentre pas part dans la pile à côté (compté dans `full`). Pas de redistribution automatique entre caisses. Un livre ne se déplace **jamais** à la souris : il ne change de caisse que par la base (script ou outils de Claude). Types (`kind`) : roman, bd, documentaire, guide, dictionnaire, autre ; le type est imprimé sur les couvertures dessinées.
- **Rendu** : deux passes — couche 0 la scène, couche 1 le livre « sorti » dessiné par-dessus (en résolution ×2). Livres précédent/suivant présentés à côté (`neighbors`), parcours d'une recherche (`resultIds`), carrousel sur téléphone. Gizmos dans `moveGizmo.ts`/`rotateGizmo.ts`, orientation des caisses par quaternions à pas de 90° (`orientation.ts`).
- **Modes et verrou d'Édition** : l'appli démarre en **Lecture** (clic sur un livre = l'ouvrir). L'**Édition** (déplacer et tourner les caisses) demande un code : `POST /api/edit` le vérifie **côté serveur** (`EDIT_CODE`, `EDIT_SECRET` dans `.env.local`, voir `src/lib/edit.ts`) et renvoie un jeton signé gardé dans le `localStorage` (`edit-token`) et revalidé à chaque chargement. Verrouillé : fiche livre en lecture seule, suppression refusée, message « Super Matou » à chaque tentative.
- **Téléphone** (`useIsPhone`, < 768 px) : pas de colonne de droite ; boutons « Biblio » et « Claude » en bas à gauche ouvrant des feuilles ; en portrait un seul livre, le plus grand possible, avec ‹ › pour parcourir et un bouton « Détail » pour la fiche.
- **IA (`POST /api/ai`)** : le panneau « Claude » (`components/Notepad`) pose une question à Claude avec **la clé API de la personne** (champ dans le panneau, gardée dans son navigateur, jamais en base ni journalisée). La route boucle sur des outils (`src/lib/library.ts`) : `search_books`, `get_crate_contents` (lecture) ; `move_book`, `add_book`, `delete_book` (écriture, **proposés seulement si le jeton d'Édition est valide**, suppression avec `confirmed: true` après accord explicite). Une modification incrémente `meta.rev` et le client recharge la scène (`engine.reload()`). SDK officiel `@anthropic-ai/sdk`, modèle `claude-opus-5-5`.

- **Séries et tomes manquants** : `volumeOf` (champs `series`/`volume` prioritaires, sinon analyse du titre ; ignore les cartes IGN et les nombres ≥ 1000) et `missingVolumes` (de 1 au dernier tome possédé ou `seriesTotal` ; `skipMissing` exclut une série). Alimente la fiche, le tas de livres fantômes à gauche des caisses (`ghosts.ts`, défilé en 3D) et la liste « à acheter ».
- **Mésange** : modèle `public/mesange/mesange.glb`, perchée sur la caisse `MESANGE_PERCH` (`decor.ts`), décalage réglable en Édition et sauvé en base (`meta` `decor`).
- **Intégration dans AOC** : `?embed=1` (fenêtre : lecture seule, sans code d'Édition, Claude sans jeton) et `?embed=bg` (fond de bureau transparent : scène, fiche du livre, étiquette de la mésange). Seuls les sites de `frame-ancestors` (`next.config.ts`) peuvent l'afficher. Les essais ratés du code d'Édition sont limités (`src/lib/attempts.ts`).

## Ajouter ou compléter un livre

Quand un livre est ajouté (photo, titre) ou que sa fiche est incomplète, **aller chercher la couverture et les infos** au lieu de les laisser vides :

- **Couverture** : la vraie couverture (jamais une page intérieure), dans `public/covers/`, référencée `/covers/<fichier>.webp`, au format **WebP** (qualité ~82, `sharp`), ~500 px de large (jamais une photo brute de plusieurs Mo). Sources : site de l'éditeur (La Hulotte : API WooCommerce publique `https://lahulotte.fr/wp-json/wc/store/v1/products?per_page=100`, images + descriptions), puis par ISBN : Amazon `https://m.media-amazon.com/images/P/<ISBN10>.01._SCLZZZZZZZ_.jpg`, Google Books `https://books.google.com/books/content?vid=ISBN:<isbn>&printsec=frontcover&img=1&zoom=1`, Open Library (`search.json` pour l'ISBN, puis `covers.openlibrary.org/b/isbn/<isbn>-L.jpg`). Photo fournie par l'utilisateur : la recadrer et redresser (elle est prise en perspective). Regarder chaque image téléchargée (planche-contact pour un lot) avant de la garder.
- **`color`** = couleur dominante de la couverture (histogramme 8 niveaux par canal, pondéré par la saturation, noir pénalisé) : elle colore le dos, la tranche et les bords, qui doivent aller avec le recto.
- **Infos** : `summary` (résumé de l'éditeur), `author`, `publisher`, `kind`, `year`, et les dimensions réelles `h`/`d`/`t` (cm / 10 ; épaisseur en mm / 100). N'écrire `year` que s'il est établi, ne pas le deviner : dire ce qui manque.
- **Écriture directe en base** (script Node avec le driver `mongodb`, URI lue dans `.env.local`) : incrémenter `meta.rev` avant et après (voir Architecture). Garder `order` (intercaler entre deux livres, par exemple `order + 0.5`).

## Compétences du projet

- **`series-gaps`** (`.claude/skills/series-gaps/`) : liste les numéros manquants des séries (script de lecture de la base + recherche web du nombre total de tomes). Lecture seule.

## Conventions

- Un dossier par composant avec barrel `index.ts` et fichiers `constants.ts`/`helpers.ts`/`types.ts` ; partagés dans `src/{constants,helpers,types}` et `src/components/ui`. Alias `@/*` → `src/*`. Code serveur partagé dans `src/lib/`.
- Pas de secret dans le dépôt : `.env.local` est ignoré, seul `.env.local.example` est versionné.
- `index.html` à la racine est l'ancien prototype autonome, pas utilisé par l'appli Next.
