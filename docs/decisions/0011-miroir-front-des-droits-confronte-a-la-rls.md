# 0011 — Le miroir front des droits se confronte à la RLS, il ne la suppose pas

- **Date** : 2026-09-16
- **Statut** : accepté

## Contexte

La sécurité de Dédale vit **entièrement** en base : rôle + sites, portés par les
policies RLS. Le front n'en est qu'un **miroir de confort** — `src/lib/permissions.ts`
grise un bouton que la base refuserait de toute façon, pour éviter à
l'utilisateur d'aller chercher un `42501` au bout d'un formulaire rempli.

Un miroir n'a de valeur que s'il est fidèle, et rien ne vérifiait qu'il l'était.
Les deux faces vivent dans deux dépôts, s'écrivent à des moments différents, et
personne ne relit l'une en modifiant l'autre. La divergence est arrivée : le
front `canEditUser` autorise le manager à éditer un `technicien`, `lecteur` ou
`demandeur` (`SUBORDINATE_ROLES`), pendant que la policy
`users_technicien_provision`, déclarée `FOR ALL`, donnait au **technicien**
`INSERT + UPDATE + DELETE` sur les comptes lecteur et demandeur de ses sites —
une capacité que son commentaire d'intention ne décrivait pas (il ne parlait que
de **création**). Personne n'avait écrit cette asymétrie ; personne ne l'avait
non plus remarquée, parce qu'aucun contrôle ne confrontait les deux faces.

Le commentaire de `SUBORDINATE_ROLES` avertissait pourtant déjà : « les deux
reflètent des règles backend distinctes (policy UPDATE vs trigger de création) —
penser aux deux si l'une évolue. » Un avertissement en commentaire n'est pas un
garde-fou : il suppose qu'on lise le bon fichier au bon moment.

## Décision

**Le miroir front et la RLS se confrontent par une sonde exécutable, jamais par
relecture.**

1. `tests/securite/escalade.mjs` est cette sonde. Elle joue **25 scénarios**
   d'escalade avec la clé publique et un **vrai JWT de rôle faible** : chaque
   scénario énonce son oracle **avant** de tenter l'action (« ceci doit renvoyer
   `42501` »), et tout écart avec l'attendu est un _finding_. Un scénario qui
   « réussit » est une faille, pas un succès.
2. **Elle doit être rejouée après toute migration touchant une policy, un
   trigger de sécurité ou une fonction `SECURITY DEFINER`** — c'est-à-dire à
   chaque fois que l'une des deux faces bouge. Le skill `migration-sql` et le
   skill `deployer` en sont les points de passage naturels.
3. Elle se joue sur une **base locale jetable**, reconstruite et semée par
   `tests/securite/semis.mjs` : jamais sur la production. Ses compagnes
   (`sonde-rls.mjs`, `edge-functions.mjs`, `stockage.mjs`) suivent la même règle.
4. Quand une divergence apparaît, **c'est la base qui arbitre**. Le front
   s'aligne sur ce que la RLS autorise réellement ; élargir la RLS pour
   justifier un miroir trop généreux se décide explicitement, jamais par
   commodité.

## Conséquences

- La sonde ne fait pas partie de `npm run verify` : elle exige une base et des
  comptes de test, `verify` doit rester hors ligne et instantané. C'est un
  contrôle de **déploiement**, au même titre que `npm run contraintes:verifier`.
- Un helper de `lib/permissions.ts` sans scénario correspondant dans la sonde
  est un miroir non confronté. En ajouter un, c'est ajouter le scénario.
- Resserrer une policy et élargir un miroir ne sont pas symétriques : resserrer
  ne change rien de visible et se revient par une migration inverse ; élargir
  ouvre une capacité **socialement irréversible** une fois que les utilisateurs
  s'en servent. En cas de doute, resserrer.
- Ce que cette décision ne couvre pas : le cloisonnement par site lui-même,
  audité séparément par `sonde-rls.mjs` et par le skill `audit-rls` — la
  présente décision porte sur la **cohérence des deux faces**, pas sur
  l'exactitude de la RLS.
