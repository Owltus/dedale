# 0017 — Garde-fous permanents : une commande de santé, des hooks git et une CI

- **Date** : 2026-11-25
- **Statut** : accepté (décisions du PO du 25/11/2026). Remplace la décision
  « pas de CI » du 16/08/2026 (skill `deployer`).
- **Plan** : `plan/garde-fous-permanents/` (local).

## Contexte

Le 25/11/2026, un bilan de santé complet a été mené avant de reprendre les
nouvelles fonctionnalités, avec une règle : un point n'est « OK » que s'il est
prouvé par une commande lancée. Verdict : **prêt avec réserves**. Les contrôles
existants (`npm run verify`, hook `check.mjs`, build Vercel) laissaient passer :

- les Edge Functions (Deno) : hors ESLint, hors Prettier, 44 problèmes de lint,
  `deno check` jamais lancé ;
- `schema_complete.sql` **non rejouable** : 10 délimiteurs `$$` tronqués,
  invisibles des tests qui lisent le texte sans l'exécuter ;
- les droits réels (RLS) : sondes impossibles à lancer sans dump de la prod ;
- 2 vulnérabilités dans le code livré, aucun scan de secrets, aucune mesure de
  couverture ni de code mort ;
- les conventions du CLAUDE.md : écrites, pas contrôlées.

La règle du 16/08 (« lancer `verify` à la main avant toute poussée ») portait
sa propre clause de sortie : « si cette règle s'avère trop souvent oubliée, la
conclusion sera de créer la CI — pas de renforcer le rappel ».

## Décision

1. **Une seule commande dit si le dépôt est sain** : `npm run sante`
   (`scripts/sante.mjs`). Chaque point du bilan reçoit OK, ÉCHEC ou NON
   VÉRIFIÉ, avec un extrait réel. Un outil absent n'est **jamais** compté OK ;
   `--strict` en fait un échec. Trois niveaux : `sante:rapide` (fichiers
   indexés), `sante` (avant poussée), `sante:complet` (clone propre, tests
   lancés deux fois, couverture, base locale).
2. **Hooks git versionnés** (`.githooks/`, branchés par `npm install`) :
   avant commit → `sante:rapide` (< 20 s) ; avant poussée → `sante`.
3. **CI GitHub Actions** (`.github/workflows/sante.yml`) à chaque poussée et
   demande de fusion vers `main` : bilan strict + cliquet de couverture,
   gitleaks sur tout l'historique, base locale montée depuis
   `schema_complete.sql` + sondes RLS + tests d'intégration. Dépôt public :
   **aucun secret, aucune connexion à la production**.
4. **Effet cliquet** partout où une dette existe : les écarts de conventions du
   25/11 sont gelés dans `src/lib/conventions-exceptions.json` (avec motif) ;
   la couverture ne peut pas reculer module par module
   (`couverture-plancher.json`). Un nouvel écart est rouge ; une exception
   devenue inutile aussi. **Pas d'objectif chiffré arbitraire.**
5. **Base locale jetable** (`npm run base:monter | base:tester | base:demonter`)
   : la prod n'est plus nécessaire pour démarrer ni pour tester les droits.

## Ce qui n'est PAS gardé automatiquement

Listé dans chaque fichier de `docs/conventions/` (« contrôlé par la revue ») :
choix `.single` / `.maybeSingle`, une modale à la fois, français correct
au-delà des accents, lectures non bornées de petites tables de référence.
Vercel déploie toujours à chaque poussée, même si la CI est rouge : le
réglage « ne déployer que si la CI est verte » reste à décider.

## Conséquences

- Contourner reste possible (`--no-verify`), mais c'est un geste visible, et la
  CI rattrape.
- Une modification de règle se fait dans son contrôle (ESLint, test, script),
  pas seulement dans la doc.
- Corriger un écart gelé = retirer son exception dans le même commit.
