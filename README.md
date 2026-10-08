# Bibliothèque

Range tes livres dans des caisses, en 3D. Une appli Next.js où chaque caisse en bois (ou transparente)
contient ses livres, avec leur couverture, leur tranche et leur résumé au dos. Les données vivent dans
MongoDB ; un assistant Claude peut répondre aux questions sur la collection et la modifier.

## Ce que fait l'appli

- **Scène 3D** : caisses petites, moyennes, grandes ou transparentes, empilables (gravité et aimantation), livres
  debout ou à plat, couvertures et tranches dessinées. Un Rubik's cube décoratif se déplace librement.
- **Lecture** (mode par défaut) : cliquer un livre le sort devant toi, le retourne pour lire le résumé, et montre
  les voisins (précédent / suivant) à côté. La fiche (titre, auteur, éditeur, année, type, résumé, série) est à droite.
- **Recherche** en grand en haut : sans accents, avec une faute de frappe tolérée ; Entrée présente tous les
  résultats devant toi, du premier au dernier.
- **Édition** : déplacer et tourner les caisses, déplacer le cube. Protégée par un code vérifié côté serveur.
- **Calepin** : onglet _Notes_ (enregistrées en base) et onglet _IA_ pour interroger Claude sur ta bibliothèque,
  avec ta propre clé API.
- **Téléphone** : un seul livre à la fois, au maximum de l'écran, parcouru avec ‹ ›, boutons Biblio et Calepin.

## Installation

Prérequis : Node.js 20 ou plus et une base MongoDB (locale ou Atlas).

```bash
npm install
cp .env.local.example .env.local   # puis renseigner la connexion MongoDB
npm run dev                        # http://localhost:3000
```

Variables d'environnement (`.env.local`, jamais versionné) :

| Variable      | Rôle                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `MONGODB_URI` | chaîne de connexion MongoDB (obligatoire : sans base, rien n'est sauvegardé) |
| `MONGODB_DB`  | nom de la base (`bibliotheque` par défaut)                                   |
| `EDIT_CODE`   | code qui déverrouille l'Édition (`supermatou` par défaut : à changer)        |
| `EDIT_SECRET` | clé de signature du jeton d'Édition (facultative)                            |

Au premier lancement, la base est vide : l'appli crée des caisses de départ.

## Commandes

```bash
npm run dev          # serveur de développement
npm run build        # build de production
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run format       # prettier
```

## Données

Quatre collections dans MongoDB : `crates` (caisses : taille, position, orientation), `books` (livres : titre,
auteur, couverture, dimensions, caisse, ordre), `props` (objets libres, le cube), `notes` (calepin), plus `meta`
(révision de l'état). Les couvertures sont des fichiers dans `public/covers/`.

L'appli envoie l'état complet à la base à chaque modification. Une révision (`meta.rev`) empêche une page
ouverte d'écraser une modification faite ailleurs : elle recharge la base à la place.

## Assistant Claude

L'onglet IA du calepin pose des questions à Claude sur la collection (« où est La Hulotte n°8 ? »,
« quels livres de Robin Hobb ai-je ? »). Claude interroge la base avec des outils (`src/lib/library.ts`) et, si
l'Édition est déverrouillée, peut aussi déplacer, ajouter ou supprimer un livre (la suppression demande une
confirmation).

Chaque personne saisit **sa propre clé API Anthropic** : elle reste dans son navigateur (`localStorage`), n'est
envoyée au serveur que pour la requête en cours, et n'est ni enregistrée ni journalisée. Chaque question consomme
du crédit sur le compte de la clé utilisée.

## Structure

```
src/app/            page unique et routes API (state, sync, edit, notes, ai)
src/engine/         moteur three.js : CrateEngine, livres, caisses, cube, gizmos
src/components/     interface React (CratesApp, SidePanel, BookDetail, SearchBar, Notepad…)
src/lib/            code serveur partagé : MongoDB, code d'Édition, outils de Claude
public/covers/      couvertures des livres
.claude/skills/     compétences du projet (séries incomplètes)
```

Voir `CLAUDE.md` pour l'architecture détaillée et les conventions.
