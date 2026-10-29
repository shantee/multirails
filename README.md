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
- [ ] Idées non faites : aiguillages à choix, tunnels, second univers (cité des engrenages, monde des bonbons).
- [ ] Toute intégration à Calcoolos attend une décision explicite.

## Retour arrière

Rien n'est installé hors du dossier du projet. Arrêter Vite (Ctrl+C). Clés `localStorage` propres au jeu :
`multirail-prefs`, `multirail-records`, `multirail-mastery`.

## Journal

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
