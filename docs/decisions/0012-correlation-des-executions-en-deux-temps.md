# 0012 — Corréler les exécutions en deux temps : `source_id`, puis le nom

- **Date** : 2026-09-17
- **Statut** : accepté (2026-09-17, arbitrage du PO). Tranche l'option laissée ouverte
  par [0010](0010-source-id-cle-de-correlation.md). Mise en œuvre : `src/features/ordres-travail/correlation.ts`.

## Contexte

L'[ADR 0010](0010-source-id-cle-de-correlation.md) a acté un constat : `source_id`
désigne une **provenance**, pas une clé de corrélation. La base autorise
explicitement la suppression d'une opération de gamme même si des exécutions la
référencent — « on autorise DELETE même si des ops_exec existent (snapshot
indépendant) » — et il n'y a aucune clé étrangère sur la colonne. Le front, lui,
s'en sert pour chaîner « la même opération récurrente » d'un OT à l'autre :
`previousReadings` et la clé de série de `releves.ts` reposent dessus.

0010 posait trois options et n'en retenait aucune, faute de mesure. Elles ont été
mesurées. **Production, 17/09/2026, en lecture seule :**

| Mesure                                            | Valeur             |
| ------------------------------------------------- | ------------------ |
| Exécutions au total                               | 2 452              |
| dont `source_id` pointant dans le vide            | **57**, dans 31 OT |
| Opérations supprimées derrière ces 57             | **3**              |
| Orphelines portant une valeur mesurée ou un index | **0**              |

Les trois opérations en cause sont « Vérification du fonctionnement et de
l'accessibilité des portes de sortie de secours » (27 OT), « Contrôle de la
montre PTI » (26) et « Piège à insectes » (4). Aucune n'est une mesure : la perte
est aujourd'hui une perte de **chaînage**, pas de relevé. Elle est réelle
malgré tout — l'écran affiche un historique vide, indiscernable d'une première
mesure — et rien n'empêche la prochaine suppression de couper une série de
compteur en deux.

**Un `source_id` qui pointe dans le vide ne casse pas forcément le chaînage.**
Deux exécutions qui partagent le même identifiant mort se recollent quand même
l'une à l'autre : la corrélation n'a jamais eu besoin que la cible existe. C'est
la mesure qui départage, et elle est tranchée :

| Opération supprimée                | Exécutions | `source_id` distincts |
| ---------------------------------- | ---------- | --------------------- |
| Vérification des portes de secours | 27         | **27**                |
| Contrôle de la montre PTI          | 26         | **26**                |
| Piège à insectes                   | 4          | 1                     |

Les quatre « Piège à insectes » partagent un identifiant : elles se chaînent
déjà, et rien ne les concerne ici. Les **53 autres portent chacune un
identifiant qui n'appartient qu'à elle** — séquelle de l'import 061, qui posait
des `source_id` aléatoires, et que la migration 063 n'a pas pu repointer pour
ces deux opérations puisqu'elles étaient déjà supprimées. Chacune de ces 53
lignes est donc une série d'un seul élément, alors qu'il s'agit de deux
opérations récurrentes relevées 27 et 26 fois.

C'est **53 chaînages** qu'il s'agit de récupérer, pas 57.

La question qui restait ouverte était : **une clé de remplacement existe-t-elle
réellement ?** La réponse est mesurée, et elle est plus nette que prévu.

La clé candidate est `(gamme de l'OT, nom de l'opération normalisé)` — normalisé
au sens : minuscules, espaces de bord retirés, espaces internes réduits à un.
Elle ne demande **aucune colonne nouvelle** : `operations_execution.nom` est déjà
un snapshot figé à la génération, et la gamme se lit sur l'OT porteur.

| Mesure                                                        | Valeur        |
| ------------------------------------------------------------- | ------------- |
| Orphelines qui retrouvent au moins une sœur par cette clé     | **57 sur 57** |
| Orphelines qui resteraient seules                             | **0**         |
| Séries distinctes selon `source_id` (population saine)        | 343           |
| Séries distinctes selon la clé de nom (mêmes exécutions)      | **351**       |
| Opérations renommées en cours de route                        | **8**         |
| Noms partagés par deux opérations distinctes d'une même gamme | **0**         |

Ces deux dernières lignes sont le cœur de la décision.

L'écart de 8 séries est **exactement** le nombre d'opérations renommées entre
deux OT : « Essai de manœuvre manuelle » devenue « Essai manœuvre CCF » sur sept
gammes, et « Contrôle des postes d'appâtage » devenue « Poste d'appât rongeurs ».
Ce sont de vrais renommages métier, pas des coquilles. La clé de nom **couperait
ces huit séries en deux**.

Et le zéro de la dernière ligne dit l'essentiel : la clé de nom ne **confond**
jamais deux séries. Elle ne sait que **scinder**, jamais fusionner à tort.

Les deux clés échouent donc sur des événements **disjoints** : `source_id` casse
à la suppression, le nom casse au renommage. Aucune des deux ne se trompe de
série. C'est ce qui rend leur union sûre.

## Décision

**La corrélation se fait en deux temps, dans cet ordre, jamais dans l'autre.**

1. **`(source_type, source_id)` reste la clé de référence.** Tant qu'il résout,
   il fait foi. Il survit au renommage, qui est le geste courant.
2. **Repli sur `(gamme_id, nom normalisé)` uniquement quand `source_id` ne
   rattache rien.** Ce repli récupère les 53 chaînages isolés et tous ceux que
   la prochaine suppression produira. Noter la formulation : « ne rattache
   rien », et non « ne résout pas ». Le front ne lit pas `operations` et ne sait
   donc pas si la source existe encore — mais il n'en a pas besoin. Ce qu'il
   observe, c'est qu'aucune sœur n'a été trouvée, et c'est le bon déclencheur :
   les quatre « Piège à insectes », qui se chaînent par un identifiant mort,
   n'atteignent jamais le repli.
3. **Quand ni l'un ni l'autre ne rattache, l'écran le dit.** « Historique rompu —
   l'opération d'origine a été supprimée », jamais un blanc indifférencié
   confondu avec une première mesure. C'est l'exigence minimale posée par 0010,
   et elle reste due.

Le repli ne devient **jamais** la clé principale. L'inverser coûterait les huit
séries renommées, de façon permanente, pour gagner ce que le repli donne déjà.

### Les deux autres options de 0010, et pourquoi elles sont écartées

**Bloquer la suppression d'une opération référencée** revient sur une décision
explicite du modèle : l'instantané avait justement été conçu pour que la gamme
reste modifiable sans figer l'historique. Une gamme vivante deviendrait de moins
en moins éditable avec le temps. Et cela ne répare **aucune** des 57 lignes
existantes : les opérations sont déjà supprimées, et leurs 53 identifiants
uniques le resteraient.

**Remplacer `source_id` par la clé de nom** échange 53 ruptures contre 8, de
façon permanente, alors que l'union n'en laisse aucune. C'est le mauvais côté du
marché.

## Conséquences

- **Aucune migration, aucune colonne.** Les trois valeurs nécessaires
  (`source_id`, `nom`, `gamme_id` via l'OT porteur) sont déjà sur la ligne. La
  faisabilité n'est pas une hypothèse : la requête de mesure ci-dessus a fait le
  rapprochement sur les données réelles.
- **Deux endroits à reprendre** : `ordresTravailQueries.previousReadings`
  (`src/features/ordres-travail/queries.ts`), qui filtre aujourd'hui par
  `.in('source_id', …)` seul, et la clé de série de `src/features/releves/`.
- **La normalisation devient un contrat.** Minuscules, `trim`, espaces internes
  réduits — et rien de plus. Pas de repli d'accents : il n'apporte rien ici
  (0 collision sans lui) et augmenterait le risque de fusionner deux séries
  distinctes. Une fois posée, elle ne doit plus changer : la modifier
  redécouperait silencieusement des séries existantes. À épingler par un test.
- **L'invariant `OP08` reste dans l'audit et garde son sens** — mais il change de
  nature. Il ne compte plus un défaut : il mesure une **exposition**, le nombre
  d'exécutions dont la provenance a disparu. Il doit être suivi, pas remis à zéro.
- **Ce qui casserait quand même** : une opération à la fois **renommée puis
  supprimée**. Aucun cas en production aujourd'hui, mais c'est précisément le cas
  que le point 3 doit savoir afficher plutôt que de le taire.
- **Hors périmètre** : les exécutions de `source_type = 2` (issues d'un modèle).
  Le raisonnement s'y applique à l'identique, aucun cas observé à ce jour.
- **Ce qu'on s'interdit** : supprimer, renuméroter ou « nettoyer » les 57 lignes.
  Ce sont des exécutions réelles, rattachées à des OT réels. Le défaut est dans
  le chaînage, pas dans la donnée.
