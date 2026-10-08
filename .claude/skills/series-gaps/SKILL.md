---
name: series-gaps
description: Vérifier ce qui manque dans la bibliothèque : numéros de tomes ou de numéros manquants dans chaque série (La Hulotte, L'Assassin royal, Bételgeuse, Origami…), y compris après le dernier tome possédé. À utiliser quand l'utilisateur demande "ce qui me manque", "les tomes manquants", "les numéros manquants des séries", "complète mes séries" ("what am I missing", "missing volumes").
---

# Séries incomplètes

Objectif : dire, série par série, quels numéros manquent dans la collection (base MongoDB `books`), sans rien modifier.

## 1. Lire l'inventaire (déterministe)

Depuis la racine du projet :

```bash
node .claude/skills/series-gaps/series-gaps.mjs .
```

Il lit `MONGODB_URI` dans `.env.local` et affiche un JSON :

- `seriesWithGaps` : séries avec des trous **entre** le premier et le dernier numéro possédés ;
- `seriesComplete` : séries d'au moins 2 volumes sans trou (à vérifier quand même au point 2) ;
- `singles` : séries dont un seul numéro est possédé (souvent des tomes isolés à compléter) ;
- `notNumbered` : nombre de livres sans numéro détectable (ignorés).

Les titres sont analysés avec les mêmes règles que l'appli (`T.3`, `Tome 3`, `Épisode 3`, `n°36/37` pour un
numéro double, chiffres romains, chiffre final). Si une série sort mal découpée (nom différent selon les
tomes), le dire dans le rapport au lieu de la corriger en base.

## 2. Compléter avec la réalité des séries (web)

Le script ne voit pas ce qui manque **avant ou après** les numéros possédés. Pour chaque série de
`seriesWithGaps`, `seriesComplete` et `singles` dont le titre est une vraie série éditée :

1. Chercher le nombre total de tomes de la série (édition française) : Wikipédia, éditeur
   (`lahulotte.fr` pour La Hulotte — API `https://lahulotte.fr/wp-json/wc/store/v1/products?per_page=100`), Babelio, Open Library.
2. Comparer : numéros manquants = tous les numéros publiés moins ceux possédés (y compris après le dernier).
3. Signaler les séries encore en cours de publication (le total augmente) et les numéros doubles
   (ex. La Hulotte 36/37 : un seul volume pour deux numéros, ce n'est pas un trou).
4. Ne rien inventer : si le total n'est pas établi par une source, écrire « total inconnu ».

## 3. Rapport

Court, en français, sans modifier la base ni le code :

| Série | Possédés | Manquants (entre) | Manquants (après / avant) | Source du total |

puis une phrase par série atypique (série mal découpée, numéro double, série en cours). Terminer par la
liste des séries complètes.

## Règles

- Lecture seule : aucune écriture en base, aucun fichier du projet modifié.
- Un « manque » est un numéro publié absent de la base ; un livre rangé « à côté » compte comme possédé.
- Mentionner la caisse (`P2`, `M4`…) où se trouve chaque série possédée, utile pour savoir où ranger un
  tome acheté ensuite.
