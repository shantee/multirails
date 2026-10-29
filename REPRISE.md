# Reprise du développement — MULTIRAIL

État au 2026-10-29, au moment du passage sur GitHub (développement poursuivi avec Claude dans le cloud).

## Démarrer

```sh
git clone https://github.com/shantee/multirails.git
cd multirails/src
npm ci
npm test          # 14 tests de logique
npm run build     # TypeScript strict + version statique dans dist/
npm run dev       # http://127.0.0.1:5173
```

Node.js 22 ou plus récent. Aucun compte, aucun serveur, aucune ressource externe : tout (formes, couleurs, sons)
est produit par le code. Règles du jeu, architecture et paramètres de test : [src/README.md](src/README.md).

Paramètres d'adresse utiles pour essayer vite : `?graine=42` (monde reproductible), `?depart=1.6` (partir à 1,6 km),
`?auto=1.2` (répond juste après 1,2 s), `?auto=faux` (répond faux). `window.__multirail` expose l'état
(`state`, `s`, `v`, `run`, `fps`, `info()`, `setQuality()`, `start()`, `segs()`).

## État actuel

- Prototype jouable de bout en bout : accueil, Aventure, Entraînement, pause, fin de voyage, records et maîtrise
  des tables en `localStorage`.
- Vérifié dans Chrome (WebGL 2) sur ordinateur 1280 × 800, tablette 820 × 1180 et téléphone 390 × 844 / 844 × 390 :
  60 i/s dans les trois qualités, ~190 appels de dessin, ~160 000 triangles.
- Captures réelles : [diag/captures/](diag/captures/).
- **Pas encore fait** : essai sur une vraie tablette, écoute réelle du son, essai avec un enfant.

## Points faibles et bugs connus

Rien de bloquant n'est connu. Points relevés à la relecture du code et pendant les essais :

- **Caméra** (`updateCamera`, `game/main.ts`) : une seule caméra de poursuite, assez rigide (11,5 m derrière,
  7,4 m au-dessus, visée 22 m devant). Le passage vers le plan de côté du Grand Pont et le retour se font par simple
  interpolation : la bascule est un peu brusque. Ce plan ne se déclenche que si les trois travées sont construites.
- **Chute en parachute** (`startFall`, `updateFall`, `makeParachute`) : courte (4,2 s, la locomotive descend d'une
  dizaine de mètres seulement), caméra fixe au bord du vide, écran de fin qui coupe la descente. Les wagons et
  voyageurs restants ne suivent pas. Le parachute est recréé à chaque chute (géométries non mises en cache).
- **Variété** : 4 biomes d'îles (prairie, cerisiers, automne, menthe) qui ne changent que les couleurs sur la même
  structure ; 5 ambiances de ciel de 1,5 km chacune, qui bouclent après 7,5 km ; une seule créature (la baleine-nuage).
- **Relief** : la voie monte et descend un peu, mais le voyage reste à altitude à peu près constante.
- `game/main.ts` (~1 100 lignes) concentre conduite, caméra, mise en scène et états : à découper avant de gros ajouts.
- `window.__multirail` (outil de test) est présent aussi dans la version de production.
- WebGL 2 seulement ; shaders GLSL écrits à la main (injectés par `onBeforeCompile` dans les matériaux Three.js).

## Prochaines idées

1. **Caméra vivante** : plans variés selon la situation (départ, virage, brèche dangereuse, Ébullition, Grand Pont),
   transitions douces, léger décalage dans les virages, plans larges de temps en temps.
2. **Chute en parachute** : une vraie séquence de fin, plus longue, caméra qui accompagne la descente dans la mer de
   nuages, wagons et voyageurs qui suivent avec leurs parapluies, atterrissage ou rebond comique avant l'écran de fin.
3. **Biomes variés** : de vraies différences de forme et pas seulement de couleur (forêt de champignons géants,
   îles de glace et cristaux, jardins suspendus, cité d'engrenages, monde des bonbons), avec leurs décors et leurs sons.
4. **Toujours plus haut et plus loin** : le voyage monte au fil des kilomètres (mer de nuages, puis ciel ouvert,
   puis étoiles), avec des horizons qui changent et un sentiment de progression.
5. **Univers vivant** : oiseaux, bancs de poissons volants, montgolfières, autres trains au loin, habitants des îles
   qui saluent ; la baleine-nuage et d'autres créatures avec des comportements.
6. **Moments de contemplation** : de courtes pauses sans calcul après un Grand Pont ou un changement d'ambiance
   (caméra large, musique qui respire), pour souffler entre deux séries.

Autres pistes notées : aiguillages à choix, tunnels.

## Règles du projet

- Prototype **autonome** : ne pas toucher à Calcoolos (jeux existants, comptes, base, serveur, site public).
  Toute intégration attend une décision explicite de Philippe.
- Langue du jeu : français uniquement pour l'instant (ne pas traduire, ne pas tester d'autres langues).
- Aucune ressource externe ni CDN : tout reste dans le dépôt ou dans les paquets npm.
- Vérifier chaque changement visuel dans un vrai navigateur (captures) et garder 60 i/s.
