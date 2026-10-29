# Reprise du développement — MULTIRAIL

État au 2026-10-29, au moment du passage sur GitHub (développement poursuivi avec Claude dans le cloud).

## Démarrer

```sh
git clone https://github.com/shantee/multirails.git
cd multirails/src
npm ci
npm test          # 20 tests de logique
npm run build     # TypeScript strict + version statique dans dist/
npm run dev       # http://127.0.0.1:5173
```

Node.js 22 ou plus récent. Aucun compte, aucun serveur, aucune ressource externe : tout (formes, couleurs, sons)
est produit par le code. Règles du jeu, architecture et paramètres de test : [src/README.md](src/README.md).

Paramètres d'adresse utiles pour essayer vite : `?graine=42` (monde reproductible), `?depart=1.6` (partir à 1,6 km),
`?auto=1.2` (répond juste après 1,2 s), `?auto=faux` (répond faux), `?vite=2` (temps accéléré).
`window.__multirail` (en développement ou avec `?test`) expose l'état : `state`, `s`, `v`, `run`, `shot`, `region`,
`fall`, `info()`, `regions()`, `segs()`, `start()`, `lose()`.

## État actuel

- Prototype jouable de bout en bout : accueil, Aventure, Entraînement, pause, fin de voyage, records et maîtrise
  des tables en `localStorage`.
- **Chantier 2 (branche `chantier-2-voyage`)** : sept régions avec leurs décors, habitants et monuments, montée en
  altitude, îles de contemplation aux frontières ; caméra « réalisatrice » ; nouvelle chute en parachute (torchon à
  carreaux) ; construction des ponts plus spectaculaire ; **la Mer des Lanternes** (bassins inondés, pluie, enseignes,
  gares à cloche, voyageurs-ombres), hommage au train du *Voyage de Chihiro* sans en reprendre personnages ni décors.
  Détails dans [src/README.md](src/README.md).
- Vérifié dans Chrome headless (rendu logiciel SwiftShader, donc pas de mesure d'images par seconde fiable) :
  ordinateur 1280 × 800, tablette 820 × 1180, téléphone 390 × 844 ; 0 erreur console ; 20 tests de logique verts.
- Captures : [diag/captures/](diag/captures/) (16 à 40 pour le chantier 2, 34 à 40 pour la Mer des Lanternes).
- **Pas encore fait** : essai sur une vraie tablette (images par seconde !), écoute réelle du son, essai avec un enfant.

## Points faibles et bugs connus

- **Performances à vérifier sur tablette** : 130 à 290 appels de dessin, 115 000 à 240 000 triangles selon la région
  (qualité haute). Les Hameaux Perchés sont la région la plus lourde. Leviers : `QUALITY` dans `main.ts`
  (densité, nombre de scènes vivantes par île, poussières), plafond de décors par île dans `islands.ts`.
- La locomotive et les wagons restent faits de nombreux petits maillages (~150 appels de dessin à eux seuls) :
  les fusionner serait le plus gros gain.
- Les caméras de côté se placent au-dessus du vide, hors de l'emprise des îles ; il n'y a pas de test de collision
  réel avec le décor. Un très grand élément (champignon géant, monument) peut passer près de l'objectif.
- La chute a été vérifiée dans les Prés-Volants et les Hameaux Perchés, pas encore depuis un Grand Pont ni dans la Mer.
- Mer des Lanternes : l'eau est opaque (pas de vrai reflet du train ni des décors, seulement du ciel et des 12 lanternes
  les plus proches) ; les monuments peuvent se cacher derrière les grands cumulus ; la pluie ne s'arrête pas sous les
  auvents des gares.
- `game/main.ts` reste le chef d'orchestre (~1 000 lignes) ; caméra, chute, décors et vie sont désormais à part.
- Shaders GLSL écrits à la main (injectés par `onBeforeCompile`), WebGL 2 seulement.

## Prochaines idées

1. **Calculs plus riches** (demandé par Philippe pour une étape suivante) : additions et multiplications combinées
   (« 15 + 27 + 3 × 2 »). Point d'entrée : `Fact` / `answerOf` / `QuestionDeck` dans `model.ts` et l'affichage de la
   plaque dans `ui.ts` (`showQuestion`) ; la longueur des brèches est déjà calée sur un temps de réponse
   (`referenceTime`), qu'il faudra moduler selon la difficulté du calcul.
2. Fusionner les maillages du train (gain de performances).
3. Aiguillages à choix, tunnels, autres régions (monde des bonbons…).

## Règles du projet

- Prototype **autonome** : ne pas toucher à Calcoolos (jeux existants, comptes, base, serveur, site public).
  Toute intégration attend une décision explicite de Philippe.
- Langue du jeu : français uniquement pour l'instant (ne pas traduire, ne pas tester d'autres langues).
- Aucune ressource externe ni CDN : tout reste dans le dépôt ou dans les paquets npm.
- Vérifier chaque changement visuel dans un vrai navigateur (captures) et garder 60 i/s.
