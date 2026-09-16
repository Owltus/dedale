# Sondes de sécurité — rejouables à volonté

Ces scripts vérifient **en conditions réelles** ce que la RLS, les Edge Functions et le
bucket Storage autorisent vraiment. Ils ne remplacent pas la lecture des policies : ils
la contredisent ou la confirment, ce qui est l'inverse d'une relecture de code.

> **Ils ne tournent JAMAIS contre la production.** Ils écrivent, créent des comptes et
> tentent des élévations de privilèges. Leur seule cible est une pile Supabase **locale
> et jetable**. Un garde-fou dans `cible.mjs` refuse de démarrer si l'adresse obtenue
> n'est pas `127.0.0.1` ou `localhost`.

## Monter la cible locale

La pile locale doit porter **le schéma de production sans ses données**. On la fabrique
en trois temps, dans un dossier hors du dépôt (les migrations ne sont pas publiées) :

```bash
mkdir -p /tmp/dedale-local && cd /tmp/dedale-local
npx supabase init

# 1. Le schéma, tiré de la prod en LECTURE SEULE (aucune donnée : --data-only absent)
npx supabase db dump --linked --project-ref ybxuojtyevldrbieaykh \
  -f supabase/migrations/00000000000000_schema.sql
npx supabase db dump --linked --project-ref ybxuojtyevldrbieaykh --schema storage \
  -f /tmp/storage.sql
# Recopier les CREATE POLICY de /tmp/storage.sql à la fin de la migration.

# 2. Le trigger que le dump du schéma `public` NE transporte PAS
cat >> supabase/migrations/00000000000000_schema.sql <<'SQL'
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
SQL

# 3. Les ports : 54321-54327 sont souvent déjà pris par une autre pile.
#    Décaler tous les `port =` de supabase/config.toml vers 545xx.
npx supabase start
```

Il reste à charger les référentiels (statuts, types, unités, périodicités) — libellés
seuls, aucune donnée métier — puis le bucket `documents` :

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents','documents',false,20971520,array['application/pdf','image/webp'])
on conflict (id) do nothing;
```

## Dérouler les sondes

Les sondes ne portent **aucune clé** : elles interrogent `supabase status` pour
obtenir l'adresse et les clés de la pile qui tourne sur cette machine. Le dépôt
étant public, même les clés de démonstration — identiques sur toutes les
installations et sans pouvoir hors de `127.0.0.1` — n'y ont pas leur place : un
JWT `service_role` en clair déclenche tous les scanners de secrets.

Il faut donc leur dire où vit le projet local monté plus haut :

```bash
export MARTIN_LOCAL_DIR=/tmp/dedale-local
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

`semis.mjs` est à rejouer après chaque `supabase db reset`.

Pour les Edge Functions, servez-les d'abord avec la vérification de jeton **désactivée** —
c'est volontaire : on veut tester ce que le code contrôle lui-même, pas ce que la
plateforme filtre en amont.

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
