# Consignes pour les agents (Claude Code)

- Réponds toujours en français, de façon concise.
- Lire d'abord [REPRISE.md](REPRISE.md) (état, bugs connus, idées), puis [src/README.md](src/README.md) (règles, architecture).
- Le code est dans `src/` : `npm ci`, `npm test`, `npm run build`, `npm run dev` (http://127.0.0.1:5173).
- Avant de terminer une tâche : `npm test` et `npm run build` verts ; changement visuel vérifié dans un navigateur
  (Playwright, captures) à 60 i/s ; jeu en français seulement.
- Ne jamais toucher à Calcoolos (jeux, comptes, base, serveur, site public) ; pas de CDN ni de ressource externe.
- Compléter le journal de [README.md](README.md) et [REPRISE.md](REPRISE.md) à la fin d'une session.
- Aucun secret dans le dépôt (il est public).
