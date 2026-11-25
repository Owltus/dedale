---
name: deployer
description: Met Dédale en production — gate de vérification, migrations SQL à appliquer, régénération des types, déploiement Vercel et contrôle après mise en ligne. À utiliser avant toute mise en production, ou quand une migration attend d'être appliquée.
---

# Mettre Dédale en production

> **L'ordre compte.** Le front est déployé en continu par Vercel à chaque poussée ; la base, elle, ne se met à jour que si quelqu'un applique la migration. Déployer un front qui attend une colonne absente casse la production.

## Le paysage

| Élément   | Où                                      | Note                                                            |
| --------- | --------------------------------------- | --------------------------------------------------------------- |
| Front     | Vercel, projet `dedale`                 | build `tsc -b && vite build`                                    |
| Adresse   | `dedale.naostack.com`                   | CNAME Cloudflare **DNS only** ; `dedale.vercel.app` reste actif |
| Base      | Supabase, projet `ybxuojtyevldrbieaykh` | migrations appliquées **à la main**                             |
| Variables | Vercel → Environment Variables          | `VITE_*` **inlinées au build**                                  |

## Avant tout : l'ordre

1. **La base d'abord**, le front ensuite. Une migration qui ajoute une colonne doit être appliquée **avant** que le front ne la lise.
2. **Sauf** si la migration retire quelque chose : déployer d'abord le front qui cesse de l'utiliser, appliquer ensuite.

## Recette

### 1. Gate locale

```bash
npm run sante:complet   # verify (types, lint, format, Vitest, Deno) + build + clone propre
                        # + tests ×2 + couverture + code mort + audit + base locale
```

Tout doit être vert (aucun ÉCHEC ; un NON VÉRIFIÉ se justifie). À défaut de Docker, `npm run sante` couvre tout sauf la base locale. `verify` inclut format et tests — l'ancienne gate s'arrêtait à `typecheck && lint && build`, ce qui a laissé 170 fichiers dériver hors format et 2 tests rouges passer inaperçus.

### 2. Les migrations en attente

`migrations/` est **gitignoré** (dépôt public, données réelles) : rien ne signale une migration non appliquée. Le seul moyen fiable est de vérifier **en base** que son effet est là.

Pour chacune, dans l'ordre de numérotation : appliquer dans l'éditeur SQL, puis jouer la requête de vérification de son en-tête. Voir le skill `migration-sql` pour l'écriture et les pièges.

### 3. Régénérer les types

```bash
npx supabase login    # une fois
npm run gen:types
```

À faire **après** le déploiement de la migration. Tant qu'elle n'est pas déployée, `database.types.ts` est édité à la main en pont — et cette édition doit être remplacée par la génération, pas conservée.

Si les types changent : relancer `npm run verify`.

### 4. Déployer le front

La poussée sur `main` déclenche le déploiement. Vercel refuse de publier si `tsc -b` échoue — c'est le seul garde-fou distant : **ni lint, ni format, ni tests ne tournent côté Vercel**.

### 4 bis. Edge Functions (si `supabase/functions/` a changé)

```bash
npm run test:deno                                   # 63+ tests, déjà dans verify
npx supabase functions deploy <fonction> --project-ref ybxuojtyevldrbieaykh
npx supabase functions list --project-ref ybxuojtyevldrbieaykh -o json   # contrôle verify_jwt
```

- Le réglage `verify_jwt` de chaque fonction est versionné dans **`supabase/config.toml`** : `false` partout sauf `dmbook-connexion`. Déployer depuis la racine du dépôt pour qu'il soit lu ; vérifier ensuite avec `functions list`.
- Un `verify_jwt` repassé à `true` casse le connecteur Claude (`mcp`, qui doit renvoyer SON 401 OAuth) et la synchro Dmbook (`dmbook-sync`, appelée par pg_cron avec sa clé).

### 5. Contrôle après mise en ligne

```bash
curl -sS -o /dev/null -w "HTTP %{http_code} ssl=%{ssl_verify_result}\n" https://dedale.naostack.com
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://dedale.naostack.com/ordres-travail   # rewrite SPA
```

Puis, dans l'application : se connecter, ouvrir une page liste, ouvrir une fiche détail, vérifier que le site actif filtre bien.

### 5 bis. Après une RESTAURATION — le trigger que le dump ne transporte pas

Le contrôle ci-dessus vérifie que l'application répond. Il ne dit rien de la seule chose qui casse silencieusement après une restauration : **le trigger qui crée le profil applicatif vit dans le schéma `auth`, pas dans `public`.**

```sql
SELECT tgname, tgenabled, n.nspname AS schema_cible
FROM   pg_trigger t
JOIN   pg_class c ON c.oid = t.tgrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal;
-- attendu : 1 ligne, schema_cible = 'auth', tgenabled = 'O'.
```

Sans lui, les comptes se créent dans `auth.users` sans jamais avoir de miroir dans `public.users` : des utilisateurs qui se connectent et **ne sont rien**. Le symptôme n'apparaît qu'à la première invitation, potentiellement des jours après la restauration.

Le contrôle continu correspondant existe déjà : l'invariant `US03` de `tests/securite/coherence-donnees.sql` (« compte auth sans profil applicatif ») détecte exactement cet état. Il suffit de le jouer.

## Pièges vérifiés

- **Les variables `VITE_*` sont figées au build.** Les modifier dans Vercel ne change rien tant qu'on n'a pas **redéployé**. C'est l'erreur qui fait perdre une heure.
- **Ne jamais mettre de secret derrière `VITE_`** : tout ce préfixe finit en clair dans le bundle téléchargeable. La clé `service_role` de Supabase n'a rien à faire dans ce projet ; la clé publique, si — la sécurité repose sur la RLS.
- **Ne jamais réactiver le proxy Cloudflare** (nuage orange) sur l'enregistrement `dedale` : Vercel ne peut plus émettre son certificat, et un mode SSL « Flexible » provoque une boucle de redirection. Cloudflare affiche un bandeau qui incite à l'activer — l'ignorer.
- **Un `supabase db dump` ne suffit pas à reconstruire Dédale.** Par défaut il ne dumpe que le schéma `public` : le trigger `on_auth_user_created` (schéma `auth`) et les policies du bucket Storage (schéma `storage`) sont laissés derrière. La source de reprise est `schema_complete.sql`, seule à porter ces objets — encore faut-il qu'elle soit à jour, d'où l'étape 5 du skill `migration-sql`. Vérifié le 16/09/2026 en reconstruisant une base locale : le schéma s'applique, et aucun compte ne se crée.
- **Supabase met un projet gratuit en pause** après une longue inactivité. Une application qui renvoie des erreurs réseau après plusieurs jours sans usage, c'est souvent ça.
- **Les URL de redirection Auth** doivent contenir le domaine de production, sinon les liens de réinitialisation de mot de passe renvoient vers l'URL par défaut.

## Intégration continue et garde-fous — ADR 0017

**Le 25/11/2026, le PO a remplacé la décision « pas de CI » du 16/08** : le bilan de santé avait montré ce que la discipline manuelle laissait passer (Edge Functions jamais lintées, `schema_complete.sql` non rejouable, droits jamais sondés). Détail : `docs/decisions/0017-garde-fous-permanents.md`.

Ce qui protège désormais le dépôt :

- le hook `.claude/hooks/check.mjs` (format + types à chaque édition via l'outil) ;
- `.githooks/pre-commit` → `npm run sante:rapide`, et `.githooks/pre-push` → `npm run sante`, branchés par `npm install` — ils couvrent aussi les éditions **hors de Claude Code** ;
- la CI `.github/workflows/sante.yml` : bilan strict, cliquet de couverture, gitleaks, base locale + sondes RLS ;
- le build Vercel (`tsc -b`).

**Avant une mise en production : `npm run sante:complet`.** Reste ouvert : Vercel déploie même si la CI est rouge (réglage à décider par le PO).
