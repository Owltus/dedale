# 0006 — Briques partagées : adoption mesurée, mesures dans la brique

- **Date** : 2026-08-16
- **Statut** : accepté

## Contexte

Un audit UX mené sur les 17 écrans a établi que l'application ne souffrait pas d'un manque de doctrine — elle en avait une, écrite et massivement suivie — mais d'un **écart entre le catalogue de briques et leur adoption réelle**.

Les symptômes se ressemblaient tous :

- `DetailTabsShell` se présentait comme « la géométrie partagée gamme / OT / prestataire » et n'avait **qu'un seul consommateur** ; les deux autres fiches réassemblaient le même montage à la main, et en avaient déjà divergé.
- `DetailHeaderCard` laissait deux mesures à ses sept appelants : la marge basse valait `mb-6`, `mb-4` ou rien selon la fiche, et l'icône de repli `size-8` ou `size-10` dans le même carré de 80 px.
- Le bloc « garde de site » était recopié dans **14 routes**, avec l'identité de page saisie deux fois — et **5 pages sur 6** avaient laissé les deux textes diverger.
- Deux générations de composants de champ coexistaient, la plus ancienne étant maintenue en vie par deux fichiers de `common/` lui-même : le catalogue entretenait la couche qu'il déclarait périmée.

Trois causes reviennent : une brique **non mesurée** (personne ne voyait qu'elle n'avait qu'un usage), une brique **qui ne porte pas ses mesures** (donc chaque appelant décide), et une brique **qu'on ne peut pas étendre** (donc on la contourne).

## Décision

**1. Une brique à un seul consommateur n'est pas une brique.** Soit on la généralise, soit on la retire du catalogue. Exception explicite pour les briques structurellement mono (un cadran = un graphe, un explorateur = un drill), marquées comme telles pour qu'on cesse de les signaler à chaque audit.

**2. Le catalogue porte une colonne « Usages » chiffrée**, recomptée à chaque chantier qui ajoute ou retire un consommateur. C'est elle qui rend la règle 1 applicable : sans mesure, l'écart est invisible.

**3. Une brique porte ses mesures.** Marges, hauteurs, tailles d'icône appartiennent à la brique, pas à l'appelant. Un espacement laissé à sept appelants diverge mécaniquement.

**4. Une brique doit être extensible.** Elle accepte les props de l'élément qu'elle rend (`role`, `id`, `aria-*`) et couvre les cas voisins par des props explicites. Deux divergences de ce chantier venaient d'une brique qu'on ne pouvait pas étendre : `ScrollBody` sans `role="tabpanel"`, `CheckRow` sans état `indeterminate`.

**5. Quand deux familles font le même service, le nom énonce le critère de choix.** `common/fields/*` = react-hook-form ; `common/standalone-fields.tsx` = état local. Le critère est le porteur de l'état, jamais l'habitude — c'est ce qui empêche les deux générations de se reformer.

**6. Une factorisation qui coûte la sûreté de typage n'est pas faite.** Le plan prévoyait une brique au-dessus des quatre routes détail par slug ; leur `navigate({ to, params })` est typé nominalement par le routeur, et l'abstraire aurait demandé des génériques lourds ou un cast pour environ six lignes gagnées par route.

**7. Une brique restreinte se compose ; une brique englobante s'impose.** `ListPageBody` ne porte ni la coquille de page, ni l'en-tête, ni les états de données : ceux-ci restent visibles dans la page, où ils portent des variations légitimes (action conditionnée au rôle, état vide propre, squelette de la bonne densité). On peut toujours élargir une brique restreinte ; l'inverse coûte cher.

## Conséquences

- Le catalogue (`.claude/skills/nouvelle-page/references/catalogue-composants.md`) devient un document **vivant** : le mettre à jour fait partie du travail, au même titre que le code.
- Les chantiers de refonte commencent par un comptage, pas par une intuition.
- Une brique peut légitimement rester à deux consommateurs ; en dessous, elle doit être justifiée en une ligne dans le catalogue.
- Ce qu'on s'interdit : créer une brique « pour plus tard » (sans deux consommateurs prévus), et laisser survivre une couche remplacée — tant que ses fichiers existent, ils sont réimportés.
- Corollaire outillage : le hook d'édition formate désormais le fichier touché, et la gate du projet (`npm run verify`) inclut format et tests. L'ancienne s'arrêtait à `typecheck && lint && build`, ce qui a laissé 170 fichiers dériver hors format et 2 tests rouges rester invisibles.
