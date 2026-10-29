# MULTIRAIL — L'Express des Nuages

Jeu d'arcade 3D de multiplications (tables 1 à 10), autonome : sans compte, sans serveur, sans ressource externe.
Toutes les formes, couleurs et sons sont produits par le code. Seule police embarquée : Fredoka (paquet npm, aucun CDN).

## Lancer

Node.js 22 ou plus récent.

```sh
npm install
npm run dev        # http://127.0.0.1:5173
```

```sh
npm test           # 20 tests de logique (calculs, barème, wagons, tracé, régions)
npm run build      # TypeScript strict + version statique dans dist/
npm run preview    # sert dist/ en local
```

`dist/` est un site statique (chemins relatifs) : il pourra être copié tel quel dans Calcoolos plus tard.

Paramètres d'adresse pour les essais : `?graine=42` (monde reproductible), `?depart=1.6` (partir à 1,6 km),
`?auto=1.2` (répond juste après 1,2 s), `?auto=faux` (répond faux), `?vite=2` (temps du jeu accéléré).
`window.__multirail` expose l'état aux tests (en développement, ou avec `?test` en production) : `state`, `s`, `shot`,
`region`, `fall`, `cam`, `info()`, `regions()`, `segs()`, `start()`, `lose()` (plus aucun wagon), `camera('calme')`.

## La boucle de jeu

- Bouillotte avance seule. Devant elle, les îles sont reliées par des **brèches** : seul un plan holographique
  en pointillés montre où passera la voie.
- Un calcul apparaît sur la plaque émaillée dès qu'une brèche est à portée (jusqu'à deux brèches d'avance).
  La réponse se valide **toute seule** quand elle a le bon nombre de chiffres (✓ et Entrée restent possibles).
- **Juste** : des centaines de pièces (traverses, rails, arches, lanternes) jaillissent du vide et construisent
  le pont en musique ; les voyageurs applaudissent, Bouillotte se retourne vers le joueur.
- **Faux** : la pièce fragile s'effondre, suie, secousse, le train ralentit ; la correction s'affiche et un
  nouveau calcul arrive pour la même brèche. La brèche supporte deux erreurs ; à la troisième elle s'effondre.
- **Trop tard** (le train freine et s'arrête au bord) ou brèche effondrée : le **dernier wagon se démonte**
  et devient un pont de planches branlant ; son voyageur s'envole sous un parapluie en faisant coucou.
  Sans wagon, Bouillotte bascule… et descend en parachute dans la mer de nuages (fin de partie).
- Les **wagons sont les vies** (3 au départ, 5 au maximum). Un **voyageur qui attend** sur une halte flottante
  monte à bord si l'on répond juste : un wagon neuf arrive du ciel sous un ballon.
- **Avance** : plus les ponts sont bâtis loin devant, plus le train file (jusqu'à +70 %). Répondre vite = aller loin.
- **Combo** : seules les réponses rapides comptent (5 s / 4 s / 3 s selon la vitesse). Points = (100 + bonus de
  rapidité jusqu'à 100) × multiplicateur (×2 dès 3, ×3 dès 6, ×4 dès 9). 6 éclairs d'affilée → **Ébullition !**
  10 s : la bouilloire déborde de vapeur arc-en-ciel, ponts arc-en-ciel, points ×2, la baleine-nuage vient saluer.
- **Grand Pont** environ tous les kilomètres : trois calculs d'affilée pour un pont de pierre et de cristal
  au-dessus d'un gouffre ; plan de caméra de côté pendant la traversée ; +300.
- **Le voyage** traverse des régions d'environ 1 km, chacune avec son ciel, sa lumière, ses îles, ses habitants, ses
  poussières dans l'air et son monument : les Prés-Volants 🌼 (moulins, champs, moutons), la Forêt des Spores 🍄
  (champignons géants lumineux), les Hameaux Perchés 🏡 (maisons à colombages, linge, montgolfières), puis dans un ordre
  qui change à chaque partie les Cimes de Givre 💎, la Cité des Engrenages ⚙️ et le Récif des Nuées 🐢, et enfin les
  Confins Étoilés ✨. Ensuite le voyage continue en boucle, dans un nouvel ordre.
- **La Mer des Lanternes** 🏮 (4ᵉ région, puis de temps en temps) : un hommage aux trains rêveurs du cinéma d'animation.
  La voie file au ras de l'eau dans de grands bassins flottants qui débordent en cascades ; crépuscule, brume, pluie ;
  enseignes peintes verticales (« THÉ », « BAINS », « POISSONS »…), réverbères, maisons sur pilotis, portiques à
  lanternes, pêcheurs en barque, voyageurs-ombres ; **gares inondées** (Gare des Lanternes, Quai des Ombres…) dont la
  cloche sonne au passage ; ponts de bois laqué rouge ; musique plus lente, en mineur ; travelling au ras de l'eau.
  Des gares (non inondées) jalonnent aussi les Hameaux Perchés.
- Les régions se mélangent aux frontières : les premiers champignons poussent dans les prés bien avant la forêt.
  La voie **monte** à chaque région (la mer de nuages s'éloigne dessous). Chaque frontière est une longue île
  **de contemplation** : pas de calcul, le train flâne, la musique respire, la caméra fait un grand panorama.
- **La caméra** suit le train en respirant (petits glissements, plans bas, hauts ou rapprochés de temps en temps) et
  change de plan aux moments forts : profil au bord du vide quand une brèche approche, plan sur un pont qui se construit,
  regard vers le monument de la région, Grand Pont de côté. Option « Caméra : calme » sur l'accueil (choisie d'office
  si le système demande moins d'animations).
- **La chute** : au bord du vide, Bouillotte vacille, bascule au ralenti, tombe… et son parachute s'ouvre : un torchon à
  carreaux. Soupape de soulagement, voyageurs perdus qui reviennent l'accompagner sous leurs parapluies, canard de la
  baignoire qui se pose sur le torchon, « plouf » dans la mer de nuages. On peut passer la scène en touchant l'écran.

Vitesses : Promenade (≈12 → 8 s par calcul), Express (9 → 6 s), Bolide (7 → 4,6 s) ; la difficulté monte sur 4,5 km
et ne descend jamais sous 4,6 s. Les calculs difficiles (6×7, 7×8…) n'arrivent qu'après quelques réussites ;
un calcul raté revient deux questions plus tard ; les faits mal connus (erreurs, lenteur) reviennent plus souvent,
d'une partie à l'autre (mémoire locale). 7 × 3 et 3 × 7 sont posés tous les deux.

**Entraînement** : même monde, mais le train s'arrête au bord et attend ; aucune perte de wagon ; bouton « Terminer ».

Commandes : chiffres (rangée ou pavé numérique), Entrée, Retour arrière, Échap/P pause, M son.
Pavé tactile : à droite en paysage, en bas en portrait ; la caméra se décale pour que le pavé ne cache pas le train.
Pause automatique si l'onglet est masqué ou la fenêtre perd le focus.

## Réalisation

TypeScript strict, Vite, **Three.js** (WebGL 2), Web Audio. Une seule bibliothèque de rendu.

| Fichier | Rôle |
|---|---|
| `game/model.ts` | règles pures et testées : choix des calculs, maîtrise, barème, combos, wagons |
| `game/track.ts` | tracé infini (courbure = somme de sinusoïdes), plan îles / brèches calé sur le temps de réponse |
| `game/rails.ts` | voie et ponts : chaque pièce vole à sa place **dans le vertex shader** (aucun calcul CPU), plan holographique |
| `game/islands.ts` | îles flottantes procédurales : forme, couleurs de la région, emplacements des décors et des scènes, cascades |
| `game/sky.ts` | ciel (dégradé, soleil, cirrus, étoiles, aurores), mer de nuages éclairée, cumulus instanciés sur le GPU, ambiances |
| `game/train.ts` | Bouillotte (yeux-lanternes sur tiges, paupières, couvercle qui saute, bielles, moustache) et les wagons-objets |
| `game/creatures.ts` | la baleine-nuage |
| `game/fx.ts` | particules (vapeur, suie, étincelles, étoiles, confettis) et débris 3D |
| `game/post.ts` | post-traitement en une passe : rayons de soleil, flou de vitesse, vignette, étalonnage |
| `game/audio.ts` | tchou-tchou calé sur la vitesse, musique en couches (kalimba, basse, nappe), sifflet de bouilloire |
| `game/ui.ts`, `style.css` | accueil, plaque, pavé, HUD, pause, fin de voyage |
| `game/regions.ts` | les régions du voyage (ordre, palettes, ambiances, poussières), mélange aux frontières, altitude |
| `game/decor.ts` | les « kits » de décor de chaque région, le dessous des îles, les monuments ; animations sur la carte graphique |
| `game/life.ts` | petites scènes vivantes, habitants qui saluent, volées (oiseaux, poissons volants, lanternes…), poussières |
| `game/director.ts` | la réalisatrice : plans de caméra et fondus entre eux |
| `game/mer.ts` | Mer des Lanternes : shader d'eau (reflets du ciel et des lanternes, ronds de pluie), pluie, enseignes (atlas dessiné par le code), gares, ombres |
| `game/fall.ts` | la chute en parachute (trajectoire au-dessus du vide, torchon, canard, amerrissage) |
| `game/main.ts` | boucle, conduite du train, choix des plans, mise en scène |

Qualité graphique : auto (haute sur ordinateur, moyenne sur tactile, baisse d'un cran si l'image passe sous 42 i/s),
ou haute / moyenne / basse (résolution, post-traitement, rayons, nuages, densité des décors).

Données locales (`localStorage`) : `multirail-prefs`, `multirail-records`, `multirail-mastery`. Rien n'est envoyé.

## Limites connues

- WebGL 2 seulement (pas de WebGPU) : les shaders sont écrits à la main en GLSL ; un passage à WebGPU imposerait de
  les réécrire en TSL/WGSL pour un gain faible sur ce type de scène.
- Mesuré à 60 i/s sur le poste Fedora avant le chantier 2 (~190 appels de dessin, ~160 000 triangles). Après le
  chantier 2 : 130 à 290 appels de dessin et 115 000 à 240 000 triangles selon la région (qualité haute, mesuré dans un
  Chrome sans carte graphique, donc sans mesure d'images par seconde fiable). Pas encore essayé sur une vraie tablette.
- Le son a été vérifié par ses appels, pas à l'oreille. La musique est générative et courte en motifs.
