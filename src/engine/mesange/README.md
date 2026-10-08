# Mésange charbonnière

`public/mesange/mesange.glb` : modèle articulé tiré de l'atelier d'animaux du projet lowpoly
(bouton « Mésange charbonnière », `bakeCustomRig`), exporté avec `GLTFExporter` depuis un navigateur
headless (Playwright), sans modifier ce projet.

- Nœuds nommés, pivots aux articulations : `body` (origine à la hanche, y = hauteur des pattes),
  enfants `head` (> `jaw`), `tail`, `wingL`/`wingR` (`extras.axis` = axe de rotation, `extras.side`),
  `thighL`/`thighR` (> `shinL`/`shinR` > `footL`/`footR`).
- Couleurs par sommet (`COLOR_0`, uint8 normalisé), pieds sur y = 0, regarde vers +Z, ~1,1 de haut.
- `animation.ts` porte le comportement `customRigTick` de l'ancien projet, sans déplacement.
