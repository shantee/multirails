# MULTIRAIL — L'Express des Nuages

- **Statut** : à confirmer — prototype jouable livré, retour de Philippe attendu
- **Créée** : 2026-10-29
- **Demande initiale** : un nouveau jeu d'arcade 3D de multiplications (tables 1 à 10) pour Calcoolos, dans l'esprit
  de la demoscene : un train fantastique dont les rails se construisent grâce aux bonnes réponses. Prototype autonome,
  sans toucher à Calcoolos, à ses comptes, à sa base ni au serveur.

## Objectif

Une boucle de jeu très plaisante dans un univers abouti, jouable au doigt sur tablette, à essayer avant toute intégration.

## Proposition artistique

- **Bouillotte**, une locomotive-bouilloire turquoise et cuivre : yeux-lanternes sur tiges qui se retournent vers le
  joueur quand elle est fière (et s'écarquillent au bord du vide), couvercle qui saute quand ça bout, moustache en laiton.
- **Les wagons sont des objets** : une tasse de thé, une baignoire à pattes (et son canard), un pot de fleurs avec un
  cactus, un coquetier avec un œuf, une boîte de sardines. Leurs voyageurs **regardent le joueur** : ils applaudissent,
  paniquent, boudent.
- **L'Archipel des Nuages** : îles flottantes « gâteau à étages » (dessus fleuri, dessous en strates pastel), cerisiers,
  champignons géants, cascades qui tombent dans une mer de nuages, une baleine-nuage avec un jardin sur le dos.
  Cinq ambiances du lever à la nuit des aurores.
- **Mécanique** : les wagons sont les vies, et un wagon perdu sert de matériau au pont de secours. Répondre vite donne
  de l'avance, et l'avance fait accélérer le train. Ébullition, Grand Pont, voyageurs à sauver.
- Nom : MULTIRAIL est conservé ; sous-titre « L'Express des Nuages ». Autres pistes possibles : « Bouillotte Express »,
  « Tchou-Fois », « Le Train des Tables ».

## Lancement

```sh
git clone https://github.com/shantee/multirails.git
cd multirails/src
npm ci
npm run dev
```

Puis ouvrir **http://127.0.0.1:5173/** (Node.js 22 ou plus récent). Détails, règles et architecture :
[src/README.md](src/README.md). Reprise du développement (état, bugs connus, idées) : [REPRISE.md](REPRISE.md).
Captures réelles : [diag/captures/](diag/captures/).

## État actuel

- Jouable de bout en bout : accueil (mode, tables, vitesse, réglages), aventure et entraînement, pause, fin de voyage
  avec statistiques et calculs « à revoir », rejouer, records et maîtrise des tables en local.
- 14 tests de logique verts, TypeScript strict, build de production vérifié dans Chrome (0 erreur console).
- Vérifié dans Chrome (WebGL 2) : 1280 × 800, tablette portrait 820 × 1180, téléphone 390 × 844 et 844 × 390 ;
  pas de défilement horizontal ; touches de pavé ≥ 70 px de haut. 60 i/s dans les trois qualités sur ce poste.
- Parcours automatisés vérifiés : bonnes réponses en série (12 calculs en 63 s), Ébullition, Grand Pont,
  erreurs (brèche effondrée), délai dépassé (freinage au bord), sacrifice de wagon, chute en parachute, entraînement.

## Prochaines étapes

- [ ] Philippe : jouer sur ordinateur et sur une vraie tablette ; avis sur le rythme (temps par calcul, accélération).
- [ ] Faire jouer un enfant : vitesse Promenade, lisibilité de la plaque, compréhension des wagons-vies.
- [ ] Écoute réelle du son et de la musique (volumes, fatigue).
- [ ] Idées non faites : aiguillages à choix, tunnels, calculs combinés (additions + multiplications).
- [ ] Toute intégration à Calcoolos attend une décision explicite.

## Retour arrière

Rien n'est installé hors du dossier du projet. Arrêter Vite (Ctrl+C). Clés `localStorage` propres au jeu :
`multirail-prefs`, `multirail-records`, `multirail-mastery`.

## Journal

### 2026-10-29 — Claude (chantier 2 : un voyage vivant)

- Sept régions (Prés-Volants, Forêt des Spores, Hameaux Perchés, Cimes de Givre, Cité des Engrenages, Récif des Nuées,
  Confins Étoilés) avec palettes, ciels, décors animés sur la carte graphique, habitants en petites scènes, volées,
  poussières d'ambiance et un monument chacune ; mélange progressif aux frontières ; la voie monte de région en région ;
  île de contemplation à chaque frontière (pas de calcul, panorama, musique apaisée).
- Caméra réalisatrice (`director.ts`) : poursuite qui respire, profil au bord du vide, plan sur le chantier, monuments,
  panoramas, Grand Pont ; fondus entre plans ; option « Caméra : calme ».
- Chute refaite (`fall.ts`) : bascule au ralenti, torchon à carreaux, soupape, amis aux parapluies, canard, amerrissage ;
  les îles ne dépassent plus sous le bout des rails (c'était la cause du train qui tombait « dans » l'île).
- Ponts : pièces qui montent en tourbillon, souffle et « clac » sonores. Fin de voyage : régions traversées.
- `window.__multirail` n'est plus exposé en production (sauf `?test`). Build vérifié, captures 16 à 33.
- **La Mer des Lanternes** (demande de Philippe : l'ambiance du train inondé du *Voyage de Chihiro*) : bassins flottants
  où la voie file au ras de l'eau, shader d'eau (reflets du ciel et des lanternes, ronds de pluie), pluie, brume,
  enseignes peintes, gares inondées avec cloche et voyageurs-ombres, pêcheurs, Grand Hôtel des Brumes, travelling au ras
  de l'eau, musique en mineur ; gares à cloche aussi dans les Hameaux Perchés. 20 tests verts, captures 34 à 40.

### 2026-10-29 — Claude

- Conception (univers, personnage, mécanique wagons-vies, avance qui accélère) et réalisation complète :
  Three.js + TypeScript + Vite + Web Audio, environ 5 000 lignes.
- Essais dans Chrome via Playwright ; le serveur Vite du bac à sable n'est pas joignable par le navigateur, il a été
  lancé hors bac à sable en écoute 127.0.0.1 seulement, puis arrêté.
- Corrections après essais : caméra placée au-dessus du premier wagon (elle était dans les wagons), vapeur allégée
  (elle masquait la voie), visages des voyageurs, nuages trop proches de la caméra, HUD téléphone, chute finale (le train
  roule d'abord jusqu'au bord ; caméra fixe au bord du vide), rythme (un joueur rapide attendait ~8 s entre deux calculs :
  questions jusqu'à deux brèches d'avance + accélération selon l'avance), plan de côté sur le Grand Pont.

### 2026-10-29 — Claude (publication)

- Projet publié sur GitHub : https://github.com/shantee/multirails (dépôt public), pour poursuivre avec Claude dans
  le cloud. Ajout de `REPRISE.md` (état, bugs connus, idées) et `CLAUDE.md` (consignes agents). Gameplay inchangé.
