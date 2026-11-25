# Sondes de sécurité — rejouables à volonté

Ces scripts vérifient **en conditions réelles** ce que la RLS, les Edge Functions et le
bucket Storage autorisent vraiment. Ils ne remplacent pas la lecture des policies : ils
la contredisent ou la confirment, ce qui est l'inverse d'une relecture de code.

> **Ils ne tournent JAMAIS contre la production.** Ils écrivent, créent des comptes et
> tentent des élévations de privilèges. Leur seule cible est une pile Supabase **locale
> et jetable**. Un garde-fou dans `cible.mjs` refuse de démarrer si l'adresse obtenue
> n'est pas `127.0.0.1` ou `localhost`.

## Monter, tester, jeter — trois commandes

Prérequis : Docker Desktop lancé, `psql` dans le PATH. **Aucun accès à la prod**
(ni `supabase login`, ni dump) : la base est fabriquée depuis `schema_complete.sql`.

```bash
npm run base:monter    # pile locale (supabase-local/, ports 445xx) + schéma + vérifs + semis
npm run base:tester    # escalade.mjs, sonde-rls.mjs, stockage.mjs, puis un bilan
npm run base:demonter  # supabase stop --no-backup : la pile et ses données sont jetées
```

(Équivalents sans npm : `node scripts/base-locale.mjs monter|tester|demonter`.)

`monter` enchaîne, et **échoue** au premier écart :

1. jette la pile précédente, démarre `supabase-local/` (config versionnée, `project_id`
   fictif, inscription fermée comme en prod) ;
2. applique `schema_complete.sql` **en un seul passage** (`psql -v ON_ERROR_STOP=1`) ;
   un échec avalé par un bloc `DO … EXCEPTION … NOTICE` (policies Storage) est rattrapé ;
3. désarme toutes les tâches pg_cron (`cron.unschedule`, base locale seulement) ;
4. vérifie le trigger `on_auth_user_created` sur `auth.users`, le bucket `documents`,
   les 5 policies de `storage.objects`, les lignes de `statuts_di`, et l'absence de
   secret Dmbook dans le coffre (sans lui, `dmbook_appeler()` n'appelle jamais la prod) ;
5. lance `semis.mjs` (2 sites, 7 comptes couvrant les 5 rôles, données en miroir).

Le script refuse tout argument CLI qui viserait la prod (`--linked`, `--project-ref`,
`login`, `link`, `dump`) et toute adresse autre que `127.0.0.1`/`localhost`.

Ports : 445xx et non 543xx/545xx, car Windows (Hyper-V/WSL) réserve des plages
mouvantes au-dessus de 49152 — `netsh interface ipv4 show excludedportrange
protocol=tcp` les liste.

> **Repli** — si `schema_complete.sql` cesse de s'appliquer d'une traite (objet utilisé
> avant d'être déclaré), la correction attendue est un **déplacement** dans le fichier,
> pas une deuxième passe. En dernier recours seulement, l'ancienne procédure reste
> possible : schéma tiré de la prod en lecture seule (`supabase db dump --linked`),
> trigger `on_auth_user_created` et policies Storage ajoutés à la main.

## Dérouler les sondes une à une

Les sondes ne portent **aucune clé** : elles interrogent `supabase status` pour
obtenir l'adresse et les clés de la pile qui tourne sur cette machine. Le dépôt
étant public, même les clés de démonstration — identiques sur toutes les
installations et sans pouvoir hors de `127.0.0.1` — n'y ont pas leur place : un
JWT `service_role` en clair déclenche tous les scanners de secrets.

Il faut donc leur dire où vit la pile (`npm run base:*` le fait tout seul) :

```bash
export MARTIN_LOCAL_DIR="$PWD/supabase-local"   # depuis la racine du dépôt
cd tests/securite
```

Un garde-fou refuse de démarrer si l'adresse obtenue n'est pas locale.

```bash
node semis.mjs             # 2 sites, 7 comptes (les 5 rôles), données en miroir
node sonde-rls.mjs         # qui voit quoi : 22 tables x 7 identités
node escalade.mjs          # 25 tentatives d'élévation de privilèges
node escalade-ciblee.mjs   # vérification adverse des écarts, 3 rejeux chacun
node edge-functions.mjs    # les 3 fonctions à clé service_role, JWT faibles/forgés/absents
node stockage.mjs          # un site peut-il télécharger le document d'un autre ?
```

`semis.mjs` est à rejouer après chaque remontage ; il réécrit `seed-data.json`.

`edge-functions.mjs` n'est **pas** lancée par `base:tester` : elle exige que les
fonctions soient servies, avec la vérification de jeton **désactivée** — c'est
volontaire : on veut tester ce que le code contrôle lui-même, pas ce que la
plateforme filtre en amont. Les fonctions vivent dans `supabase/functions/` (hors de
la pile locale) ; leur service local reste à outiller.

```bash
npx supabase functions serve --no-verify-jwt
```

## Lire les résultats

Chaque sonde annonce l'attendu **avant** d'observer, et ne conclut à une faille que sur un
oracle explicite :

- **Lecture** : une fuite n'est déclarée que si la réponse est un 200, que le corps est un
  tableau d'objets, **et** qu'un identifiant renvoyé appartient à une ligne connue du site
  adverse. Un 200 vide n'est pas une fuite.
- **Écriture** : on relit la ligne avec `service_role` après coup. Un 200 sur zéro ligne
  touchée n'est pas une réussite.
- **Rejeu** : tout écart est rejoué trois fois. Un résultat instable est un test instable,
  pas un bug.

La clé `service_role` ne sert **jamais** à jouer l'attaquant — sinon toute la RLS serait
contournée et chaque test passerait faussement. Elle ne sert qu'à préparer le terrain et à
établir la vérité terrain après coup.

## Les deux fichiers SQL

`coherence-donnees.sql` et `inventaire-securite.sql` sont, eux, en **lecture seule** et
peuvent donc tourner contre la production :

```bash
npx supabase db query --linked --project-ref ybxuojtyevldrbieaykh -f coherence-donnees.sql
```

Le premier confronte ~150 invariants métier aux données réelles (une ligne par invariant
violé, avec son compte). Le second inventorie l'état de sécurité réel : tables sans RLS,
fonctions `SECURITY DEFINER` sans `search_path` figé, vues sans `security_invoker`,
policies `INSERT` sans `WITH CHECK`, configuration des buckets, droits du rôle `anon`.
