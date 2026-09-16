-- =============================================================================
-- Martin / Verification securite — LECTURE SEULE sur pg_catalog
-- =============================================================================
-- Aucune ecriture. Confronte l etat REEL de la base aux constats faits sur
-- schema_complete.sql (que le projet documente lui-meme comme pouvant etre en
-- retard). C est l oracle deterministe : c est la base qui fait foi.
-- =============================================================================
with

-- 1. Policies du bucket Storage : une policy SELECT sans controle de site
--    rendrait TOUT document lisible par tout utilisateur authentifie.
storage_pol as (
  select 'STORAGE '||policyname||' ['||cmd||']' as constat,
         case when qual is null then '(pas de USING)'
              when qual ilike '%has_site_access%' or qual ilike '%storage_path%' or qual ilike '%image_path%' or qual ilike '%photo_path%'
                then 'OK cloisonne'
              else 'SUSPECT: '||left(replace(qual, chr(10), ' '), 240) end as detail
  from pg_policies where schemaname='storage'
),

-- 2. Tables publiques sans RLS activee.
sans_rls as (
  select 'TABLE SANS RLS '||c.relname, 'FAILLE' from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
),

-- 3. Tables publiques avec RLS mais AUCUNE policy : lecture impossible pour
--    tous sauf le proprietaire — silencieusement inaccessible.
rls_sans_policy as (
  select 'RLS SANS POLICY '||c.relname, 'A VERIFIER' from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
),

-- 4. Fonctions SECURITY DEFINER sans search_path fige : vecteur classique
--    d escalade (un schema attaquant en tete de search_path).
secdef as (
  select 'SECDEF SANS search_path '||p.proname, 'FAILLE' from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
),

-- 5. Vues sans security_invoker : elles s executent avec les droits du
--    proprietaire et CONTOURNENT donc la RLS de leurs tables sources.
vues as (
  select 'VUE SANS security_invoker '||c.relname, 'FAILLE' from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false') <> 'true'
),

-- 6. Policies INSERT dont la condition est dans USING au lieu de WITH CHECK :
--    la condition n est alors PAS appliquee a l ecriture.
insert_using as (
  select 'INSERT SANS with_check '||tablename||'.'||policyname, 'FAILLE' from pg_policies
  where schemaname='public' and cmd='INSERT' and with_check is null
),

-- 7. Policies permissives totales (USING true) sur des tables metier.
using_true as (
  select 'POLICY USING(true) '||tablename||'.'||policyname||' ['||cmd||']', 'A JUSTIFIER' from pg_policies
  where schemaname='public' and (qual = 'true' or with_check = 'true')
),

-- 8. Policies SELECT de tables metier scopees site qui ne mentionnent ni
--    has_site_access ni site_id : candidat fuite inter-site.
select_sans_site as (
  select 'SELECT SANS CONTROLE SITE '||p.tablename||'.'||p.policyname,
         left(replace(coalesce(p.qual,''), chr(10), ' '), 200)
  from pg_policies p
  join pg_attribute a on a.attrelid = ('public.'||quote_ident(p.tablename))::regclass
   and a.attname='site_id' and a.attnum>0
  where p.schemaname='public' and p.cmd in ('SELECT','ALL')
    and coalesce(p.qual,'') not ilike '%site%'
    and p.policyname not ilike '%admin%'
),

-- 9. Configuration reelle des buckets Storage.
buckets as (
  select 'BUCKET '||id, 'public='||public::text||' taille_max='||coalesce(file_size_limit::text,'illimitee')||' mimes='||coalesce(array_to_string(allowed_mime_types,'|'),'TOUS')
  from storage.buckets
),

-- 10. Extensions installees dans le schema public (mauvaise pratique connue).
ext as (
  select 'EXTENSION DANS public '||e.extname, 'A DEPLACER' from pg_extension e
  join pg_namespace n on n.oid=e.extnamespace where n.nspname='public'
),

-- 11. Tables exposees a anon : le role anonyme ne devrait rien pouvoir lire.
grants_anon as (
  select 'GRANT A anon '||table_name||' '||privilege_type, 'A JUSTIFIER'
  from information_schema.role_table_grants
  where grantee='anon' and table_schema='public' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
),

tout as (
  select * from storage_pol
  union all select * from sans_rls
  union all select * from rls_sans_policy
  union all select * from secdef
  union all select * from vues
  union all select * from insert_using
  union all select * from using_true
  union all select * from select_sans_site
  union all select * from buckets
  union all select * from ext
  union all select * from grants_anon
)
select constat, detail from tout order by 1;
