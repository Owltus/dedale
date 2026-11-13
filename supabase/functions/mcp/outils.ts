// Outils du connecteur Claude — LECTURE SEULE (étape 3 du plan connecteur).
//
// Règles :
//   - chaque outil lit avec le client de la personne (RLS) ; jamais de clé maître ;
//   - paramètres validés par Zod, champ inconnu = refus ;
//   - jamais de chemin de stockage ni de contenu de fichier : au plus le nom ;
//   - textes de recherche nettoyés avant d'entrer dans un filtre PostgREST.

import { z } from 'npm:zod@3.23.8'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type Contexte = { supabase: SupabaseClient; userId: string }
type Resultat = { content: { type: 'text'; text: string }[]; isError?: boolean }
type Outil = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Record<string, unknown>
  schema: z.ZodTypeAny
  run: (args: never, ctx: Contexte) => Promise<unknown>
}

class ErreurOutil extends Error {}

// ─── Aides ──────────────────────────────────────────────────────────────────

const LECTURE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const OT_OUVERTS = ['planifie', 'en_cours', 'reouvert']
const STATUT_OT: Record<string, string> = {
  planifie: 'À faire', en_cours: 'En cours', cloture: 'Clôturé', annule: 'Annulé', reouvert: 'Rouvert',
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
const site = z.string().min(1).max(120).optional()
const limite = (max: number, defaut: number) => z.number().int().min(1).max(max).default(defaut)
const page = z.number().int().min(1).max(1000).default(1)

/** Garde lettres, chiffres, espaces, tirets et apostrophes : rien qui puisse
 *  détourner un filtre PostgREST (virgules, parenthèses, points, étoiles…). */
function nettoyer(texte: string | undefined): string | undefined {
  const t = (texte ?? '').replace(/[^\p{L}\p{N} '\-]/gu, ' ').replace(/\s+/g, ' ').trim()
  return t.length ? t.slice(0, 80) : undefined
}

function jourIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** « 18/11/2026 (S47) » — semaine ISO 8601, comme partout dans Dédale. */
function dateFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  const jour = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - jour + 3)
  const premierJeudi = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const semaine = 1 + Math.round(((d.getTime() - premierJeudi.getTime()) / 86400000 - 3 + ((premierJeudi.getUTCDay() + 6) % 7)) / 7)
  return `${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} (S${semaine})`
}

function ajouterJours(iso: string, jours: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + jours)
  return jourIso(d)
}

function enRetard(ot: { statut: string; date_prevue: string; tolerance_jours: number | null }) {
  return OT_OUVERTS.includes(ot.statut) && ajouterJours(ot.date_prevue, ot.tolerance_jours ?? 0) < jourIso(new Date())
}

async function mesSites(ctx: Contexte) {
  const { data, error } = await ctx.supabase.rpc('get_my_sites').select('id, nom')
  if (error) throw error
  return (data ?? []) as { id: string; nom: string }[]
}

/** Résout le paramètre `site` (nom ou identifiant) parmi les sites de la
 *  personne ; sans paramètre : tous ses sites. */
async function sitesCibles(ctx: Contexte, demande: string | undefined) {
  const sites = await mesSites(ctx)
  if (!demande) return sites
  const d = demande.toLowerCase()
  const trouves = sites.filter((s) => s.id === demande || s.nom.toLowerCase().includes(d))
  if (!trouves.length)
    throw new ErreurOutil(`Aucun de tes sites ne correspond à « ${demande} ». Tes sites : ${sites.map((s) => s.nom).join(', ') || 'aucun'}.`)
  return trouves
}

function nomSite(sites: { id: string; nom: string }[], id: string | null) {
  return sites.find((s) => s.id === id)?.nom ?? null
}

// ─── Les outils ─────────────────────────────────────────────────────────────

const OT_COLONNES =
  'id, nom_gamme, nature_gamme, nom_equipement, nom_localisation, nom_prestataire, nom_categorie, libelle_periodicite, date_prevue, date_debut, date_cloture, statut, origine, tolerance_jours, site_id'

type OtLigne = {
  id: string; nom_gamme: string; nature_gamme: string; nom_equipement: string | null; nom_localisation: string | null
  nom_prestataire: string; nom_categorie: string | null; libelle_periodicite: string; date_prevue: string
  date_debut: string | null; date_cloture: string | null; statut: string; origine: string; tolerance_jours: number; site_id: string
}

function presenterOt(ot: OtLigne, sites: { id: string; nom: string }[]) {
  return {
    id: ot.id,
    gamme: ot.nom_gamme,
    nature: ot.nature_gamme,
    equipement: ot.nom_equipement,
    localisation: ot.nom_localisation,
    famille: ot.nom_categorie,
    prestataire: ot.nom_prestataire,
    periodicite: ot.libelle_periodicite,
    date_prevue: dateFr(ot.date_prevue),
    tolerance_jours: ot.tolerance_jours,
    debut: dateFr(ot.date_debut),
    cloture: dateFr(ot.date_cloture),
    statut: STATUT_OT[ot.statut] ?? ot.statut,
    origine: ot.origine === 'programme' ? 'Programmé (généré automatiquement)' : 'Planifié (placé par une personne)',
    en_retard: enRetard(ot),
    site: nomSite(sites, ot.site_id),
  }
}

const OUTILS_INTERNES: Outil[] = [
  {
    name: 'mes_sites',
    title: 'Mes sites et mon rôle',
    description: 'Rôle de la personne connectée et sites auxquels elle a accès. À appeler en premier pour savoir sur quel périmètre on travaille.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: LECTURE,
    schema: z.object({}).strict(),
    run: async (_a: Record<string, never>, ctx) => {
      const [{ data: role }, sites] = await Promise.all([ctx.supabase.rpc('current_role'), mesSites(ctx)])
      return { role, sites: sites.map((s) => s.nom) }
    },
  },
  {
    name: 'ordres_travail',
    title: 'Chercher des ordres de travail',
    description: 'Liste des ordres de travail (OT), filtrables par site, statut, retard, période de date prévue et texte (gamme, équipement, localisation). Par défaut : les OT non terminés.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        site: { type: 'string', description: 'Nom (ou partie du nom) du site ; par défaut tous mes sites' },
        statut: { type: 'string', enum: ['ouverts', 'planifie', 'en_cours', 'reouvert', 'cloture', 'annule', 'tous'], default: 'ouverts', description: 'ouverts = à faire, en cours ou rouverts' },
        en_retard: { type: 'boolean', description: 'Seulement les OT en retard' },
        du: { type: 'string', description: 'Date prévue à partir de (AAAA-MM-JJ)' },
        au: { type: 'string', description: 'Date prévue jusqu’au (AAAA-MM-JJ)' },
        recherche: { type: 'string', description: 'Texte cherché dans la gamme, l’équipement ou la localisation' },
        limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
        page: { type: 'integer', minimum: 1, default: 1 },
      },
    },
    annotations: LECTURE,
    schema: z.object({
      site, statut: z.enum(['ouverts', 'planifie', 'en_cours', 'reouvert', 'cloture', 'annule', 'tous']).default('ouverts'),
      en_retard: z.boolean().optional(), du: date.optional(), au: date.optional(), recherche: z.string().max(120).optional(),
      limite: limite(100, 30), page,
    }).strict(),
    run: async (a: { site?: string; statut: string; en_retard?: boolean; du?: string; au?: string; recherche?: string; limite: number; page: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      let q = ctx.supabase.from('ordres_travail').select(OT_COLONNES, { count: 'exact' }).in('site_id', sites.map((s) => s.id))
      if (a.en_retard || a.statut === 'ouverts') q = q.in('statut', OT_OUVERTS)
      else if (a.statut !== 'tous') q = q.eq('statut', a.statut)
      if (a.en_retard) q = q.lt('date_prevue', jourIso(new Date()))
      if (a.du) q = q.gte('date_prevue', a.du)
      if (a.au) q = q.lte('date_prevue', a.au)
      const texte = nettoyer(a.recherche)
      if (texte) q = q.or(`nom_gamme.ilike.*${texte}*,nom_equipement.ilike.*${texte}*,nom_localisation.ilike.*${texte}*`)
      q = q.order('date_prevue', { ascending: true })
      if (a.en_retard) {
        // Le retard dépend de la tolérance de chaque OT : filtré ici.
        const { data, error } = await q.limit(2000)
        if (error) throw error
        const tous = (data as OtLigne[]).filter(enRetard)
        const debut = (a.page - 1) * a.limite
        return { total: tous.length, page: a.page, ordres_travail: tous.slice(debut, debut + a.limite).map((o) => presenterOt(o, sites)) }
      }
      const debut = (a.page - 1) * a.limite
      const { data, error, count } = await q.range(debut, debut + a.limite - 1)
      if (error) throw error
      return { total: count, page: a.page, ordres_travail: (data as OtLigne[]).map((o) => presenterOt(o, sites)) }
    },
  },
  {
    name: 'ordre_travail',
    title: 'Détail d’un ordre de travail',
    description: 'Tout un OT : ses opérations (avec mesures, seuils, conformité), les noms de ses documents, ses observations. L’identifiant vient de l’outil ordres_travail.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', description: 'Identifiant de l’OT' } } },
    annotations: LECTURE,
    schema: z.object({ id: z.string().uuid('Identifiant d’OT invalide') }).strict(),
    run: async (a: { id: string }, ctx) => {
      const sites = await mesSites(ctx)
      const { data: ot, error } = await ctx.supabase
        .from('ordres_travail')
        .select(`${OT_COLONNES}, description_gamme, commentaires, motif_annulation, motif_reouverture`)
        .eq('id', a.id)
        .maybeSingle()
      if (error) throw error
      if (!ot) throw new ErreurOutil('OT introuvable (ou hors de tes sites).')
      const [ops, docs, obs] = await Promise.all([
        ctx.supabase.from('operations_execution')
          .select('nom, description, type_operation, nom_equipement, nom_localisation, statut, date_execution, valeur_mesuree, unite_symbole, seuil_minimum, seuil_maximum, est_conforme, index_pose, index_depose, commentaires, ordre')
          .eq('ordre_travail_id', a.id).order('ordre'),
        ctx.supabase.from('documents_ordres_travail').select('commentaire, documents(nom_original, mime_type, uploaded_at)').eq('ordre_travail_id', a.id),
        ctx.supabase.from('observations').select('description, gravite, statut, echeance, date_levee').eq('ot_id', a.id),
      ])
      for (const r of [ops, docs, obs]) if (r.error) throw r.error
      const o = ot as OtLigne & { description_gamme: string | null; commentaires: string | null; motif_annulation: string | null; motif_reouverture: string | null }
      return {
        ...presenterOt(o, sites),
        description: o.description_gamme,
        commentaires: o.commentaires,
        motif_annulation: o.motif_annulation,
        motif_reouverture: o.motif_reouverture,
        operations: (ops.data ?? []).map((p) => ({ ...p, date_execution: dateFr(p.date_execution as string | null) })),
        documents: (docs.data ?? []).map((d) => {
          const doc = d.documents as unknown as { nom_original: string; mime_type: string; uploaded_at: string } | null
          return { nom: doc?.nom_original, type: doc?.mime_type, ajoute_le: dateFr(doc?.uploaded_at), commentaire: d.commentaire }
        }),
        observations: (obs.data ?? []).map((b) => ({ ...b, echeance: dateFr(b.echeance as string | null), levee_le: dateFr(b.date_levee as string | null) })),
      }
    },
  },
  {
    name: 'planning',
    title: 'Planning',
    description: 'Les OT dont la date prévue tombe dans une période (93 jours au plus), triés par date, avec leur semaine. Montre ce qui est programmé (automatique) et planifié (placé à la main).',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['du', 'au'],
      properties: { du: { type: 'string', description: 'AAAA-MM-JJ' }, au: { type: 'string', description: 'AAAA-MM-JJ' }, site: { type: 'string' } },
    },
    annotations: LECTURE,
    schema: z.object({ du: date, au: date, site }).strict().refine((a) => a.du <= a.au && ajouterJours(a.du, 93) >= a.au, 'Période invalide : « du » avant « au », 93 jours au plus.'),
    run: async (a: { du: string; au: string; site?: string }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const { data, error } = await ctx.supabase.from('ordres_travail').select(OT_COLONNES)
        .in('site_id', sites.map((s) => s.id)).gte('date_prevue', a.du).lte('date_prevue', a.au)
        .order('date_prevue').limit(500)
      if (error) throw error
      return { nombre: data.length, ordres_travail: (data as OtLigne[]).map((o) => presenterOt(o, sites)) }
    },
  },
  {
    name: 'plan_maintenance',
    title: 'Plan de maintenance',
    description: 'Les gammes du plan de maintenance (périodicité, nature, prestataire) avec leur prochain OT et s’il est en retard. Filtre par site, texte ou nature.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        site: { type: 'string' },
        recherche: { type: 'string', description: 'Texte cherché dans le nom de la gamme' },
        inclure_inactives: { type: 'boolean', default: false },
      },
    },
    annotations: LECTURE,
    schema: z.object({ site, recherche: z.string().max(120).optional(), inclure_inactives: z.boolean().default(false) }).strict(),
    run: async (a: { site?: string; recherche?: string; inclure_inactives: boolean }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      let q = ctx.supabase.from('gammes')
        .select('id, nom, nature, est_active, document_requis, site_id, periodicites(libelle), categories(nom), prestataires(libelle)')
        .in('site_id', sites.map((s) => s.id)).order('nom').limit(300)
      if (!a.inclure_inactives) q = q.eq('est_active', true)
      const texte = nettoyer(a.recherche)
      if (texte) q = q.ilike('nom', `%${texte}%`)
      const { data: gammes, error } = await q
      if (error) throw error
      const ids = gammes.map((g) => g.id)
      const { data: ots, error: e2 } = ids.length
        ? await ctx.supabase.from('ordres_travail').select('gamme_id, date_prevue, tolerance_jours, statut').in('gamme_id', ids).in('statut', OT_OUVERTS).order('date_prevue')
        : { data: [], error: null }
      if (e2) throw e2
      const prochain = new Map<string, { date_prevue: string; tolerance_jours: number; statut: string }>()
      for (const o of ots ?? []) if (o.gamme_id && !prochain.has(o.gamme_id)) prochain.set(o.gamme_id, o)
      return {
        nombre: gammes.length,
        gammes: gammes.map((g) => {
          const p = prochain.get(g.id)
          return {
            gamme: g.nom,
            nature: g.nature,
            active: g.est_active,
            document_requis: g.document_requis,
            periodicite: (g.periodicites as unknown as { libelle: string } | null)?.libelle,
            famille: (g.categories as unknown as { nom: string } | null)?.nom,
            prestataire: (g.prestataires as unknown as { libelle: string } | null)?.libelle ?? null,
            site: nomSite(sites, g.site_id),
            prochain_ot: p ? dateFr(p.date_prevue) : null,
            en_retard: p ? enRetard(p) : false,
          }
        }),
      }
    },
  },
  {
    name: 'releves',
    title: 'Relevés et mesures',
    description: 'Historique des mesures saisies dans les OT (compteurs, températures…), du plus récent au plus ancien, avec seuils et conformité. Chercher par nom d’opération, d’équipement ou de localisation.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['recherche'],
      properties: {
        recherche: { type: 'string', description: 'Ex. « compteur eau », « chambre froide »' },
        site: { type: 'string' }, du: { type: 'string', description: 'AAAA-MM-JJ' }, au: { type: 'string', description: 'AAAA-MM-JJ' },
        limite: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    },
    annotations: LECTURE,
    schema: z.object({ recherche: z.string().min(2).max(120), site, du: date.optional(), au: date.optional(), limite: limite(200, 50) }).strict(),
    run: async (a: { recherche: string; site?: string; du?: string; au?: string; limite: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const texte = nettoyer(a.recherche)
      if (!texte) throw new ErreurOutil('Recherche vide.')
      let q = ctx.supabase.from('operations_execution')
        .select('nom, nom_equipement, nom_localisation, valeur_mesuree, unite_symbole, unite_nom, seuil_minimum, seuil_maximum, est_conforme, date_execution, index_pose, index_depose, ordres_travail!inner(nom_gamme, site_id)')
        .not('valeur_mesuree', 'is', null)
        .in('ordres_travail.site_id', sites.map((s) => s.id))
        .or(`nom.ilike.*${texte}*,nom_equipement.ilike.*${texte}*,nom_localisation.ilike.*${texte}*`)
        .order('date_execution', { ascending: false, nullsFirst: false })
        .limit(a.limite)
      if (a.du) q = q.gte('date_execution', a.du)
      if (a.au) q = q.lte('date_execution', `${a.au}T23:59:59`)
      const { data, error } = await q
      if (error) throw error
      return {
        nombre: data.length,
        releves: data.map(({ ordres_travail: ot, date_execution, ...r }) => ({
          ...r, date: dateFr(date_execution as string | null), gamme: (ot as unknown as { nom_gamme: string }).nom_gamme,
        })),
      }
    },
  },
  {
    name: 'demandes',
    title: 'Demandes d’intervention',
    description: 'Demandes d’intervention (DI) avec leurs lieux et équipements. Par défaut : celles qui ne sont pas clôturées.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        site: { type: 'string' },
        statut: { type: 'string', enum: ['ouvertes', 'ouvert', 'en_cours', 'cloture', 'toutes'], default: 'ouvertes' },
        recherche: { type: 'string', description: 'Texte cherché dans le constat' },
        limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      },
    },
    annotations: LECTURE,
    schema: z.object({ site, statut: z.enum(['ouvertes', 'ouvert', 'en_cours', 'cloture', 'toutes']).default('ouvertes'), recherche: z.string().max(120).optional(), limite: limite(100, 30) }).strict(),
    run: async (a: { site?: string; statut: string; recherche?: string; limite: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const ids: Record<string, number[]> = { ouvertes: [1, 2], ouvert: [1], en_cours: [2], cloture: [3] }
      let q = ctx.supabase.from('demandes_intervention')
        .select('id, constat, date_constat, date_resolution, description_resolution, site_id, statuts_di(nom), di_localisations(locaux(nom)), di_equipements(equipements(code_inventaire, categories(nom)))')
        .in('site_id', sites.map((s) => s.id)).order('date_constat', { ascending: false }).limit(a.limite)
      if (a.statut !== 'toutes') q = q.in('statut_di_id', ids[a.statut])
      const texte = nettoyer(a.recherche)
      if (texte) q = q.ilike('constat', `%${texte}%`)
      const { data, error } = await q
      if (error) throw error
      return {
        nombre: data.length,
        demandes: data.map((d) => ({
          id: d.id,
          constat: d.constat,
          statut: (d.statuts_di as unknown as { nom: string } | null)?.nom,
          date_constat: dateFr(d.date_constat),
          resolution: d.description_resolution,
          date_resolution: dateFr(d.date_resolution),
          lieux: (d.di_localisations as unknown as { locaux: { nom: string } | null }[]).map((l) => l.locaux?.nom).filter(Boolean),
          equipements: (d.di_equipements as unknown as { equipements: { code_inventaire: string | null; categories: { nom: string } | null } | null }[])
            .map((e) => [e.equipements?.categories?.nom, e.equipements?.code_inventaire].filter(Boolean).join(' ')),
          site: nomSite(sites, d.site_id),
        })),
      }
    },
  },
  {
    name: 'travaux',
    title: 'Travaux',
    description: 'Travaux avec leurs tâches. Par défaut : ceux qui ne sont pas terminés.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        site: { type: 'string' },
        statut: { type: 'string', enum: ['ouverts', 'ouvert', 'en_cours', 'termine', 'tous'], default: 'ouverts' },
        recherche: { type: 'string', description: 'Texte cherché dans le titre' },
        limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      },
    },
    annotations: LECTURE,
    schema: z.object({ site, statut: z.enum(['ouverts', 'ouvert', 'en_cours', 'termine', 'tous']).default('ouverts'), recherche: z.string().max(120).optional(), limite: limite(100, 30) }).strict(),
    run: async (a: { site?: string; statut: string; recherche?: string; limite: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const ids: Record<string, number[]> = { ouverts: [1, 2], ouvert: [1], en_cours: [2], termine: [4] }
      let q = ctx.supabase.from('interventions_travaux')
        .select('id, titre, description, date_demande, date_fin, compte_rendu, site_id, statuts_travaux(nom), travaux_taches(libelle, statut, date_tache, ordre, commentaire)')
        .in('site_id', sites.map((s) => s.id)).order('date_demande', { ascending: false }).limit(a.limite)
      if (a.statut !== 'tous') q = q.in('statut_travaux_id', ids[a.statut])
      const texte = nettoyer(a.recherche)
      if (texte) q = q.ilike('titre', `%${texte}%`)
      const { data, error } = await q
      if (error) throw error
      return {
        nombre: data.length,
        travaux: data.map((t) => ({
          id: t.id, titre: t.titre, description: t.description,
          statut: (t.statuts_travaux as unknown as { nom: string } | null)?.nom,
          date_demande: dateFr(t.date_demande), date_fin: dateFr(t.date_fin), compte_rendu: t.compte_rendu,
          taches: (t.travaux_taches as unknown as { libelle: string; statut: string; date_tache: string | null; ordre: number; commentaire: string | null }[])
            .sort((x, y) => x.ordre - y.ordre).map((k) => ({ libelle: k.libelle, statut: k.statut, date: dateFr(k.date_tache), commentaire: k.commentaire })),
          site: nomSite(sites, t.site_id),
        })),
      }
    },
  },
  {
    name: 'evenements',
    title: 'Événements',
    description: 'Événements avec leurs tâches et lieux. Par défaut : ceux qui ne sont pas clôturés.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        site: { type: 'string' },
        statut: { type: 'string', enum: ['ouverts', 'ouvert', 'en_cours', 'cloture', 'tous'], default: 'ouverts' },
        recherche: { type: 'string', description: 'Texte cherché dans le titre' },
        limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      },
    },
    annotations: LECTURE,
    schema: z.object({ site, statut: z.enum(['ouverts', 'ouvert', 'en_cours', 'cloture', 'tous']).default('ouverts'), recherche: z.string().max(120).optional(), limite: limite(100, 30) }).strict(),
    run: async (a: { site?: string; statut: string; recherche?: string; limite: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const ids: Record<string, number[]> = { ouverts: [1, 2], ouvert: [1], en_cours: [2], cloture: [4] }
      let q = ctx.supabase.from('evenements')
        .select('id, titre, description, date_evenement, date_cloture, compte_rendu, site_id, statuts_evenements(nom), evenements_lieux(libelle, statut, date_tache, ordre, commentaire)')
        .in('site_id', sites.map((s) => s.id)).order('date_evenement', { ascending: false }).limit(a.limite)
      if (a.statut !== 'tous') q = q.in('statut_evenement_id', ids[a.statut])
      const texte = nettoyer(a.recherche)
      if (texte) q = q.ilike('titre', `%${texte}%`)
      const { data, error } = await q
      if (error) throw error
      return {
        nombre: data.length,
        evenements: data.map((e) => ({
          id: e.id, titre: e.titre, description: e.description,
          statut: (e.statuts_evenements as unknown as { nom: string } | null)?.nom,
          date: dateFr(e.date_evenement), cloture: dateFr(e.date_cloture), compte_rendu: e.compte_rendu,
          taches: (e.evenements_lieux as unknown as { libelle: string; statut: string; date_tache: string | null; ordre: number; commentaire: string | null }[])
            .sort((x, y) => x.ordre - y.ordre).map((k) => ({ libelle: k.libelle, statut: k.statut, date: dateFr(k.date_tache), commentaire: k.commentaire })),
          site: nomSite(sites, e.site_id),
        })),
      }
    },
  },
  {
    name: 'equipements',
    title: 'Équipements',
    description: 'Recherche d’équipements par famille, code d’inventaire ou localisation, avec leurs caractéristiques.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['recherche'],
      properties: { recherche: { type: 'string' }, site: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
    },
    annotations: LECTURE,
    schema: z.object({ recherche: z.string().min(1).max(120), site, limite: limite(100, 30) }).strict(),
    run: async (a: { recherche: string; site?: string; limite: number }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const texte = nettoyer(a.recherche)
      if (!texte) throw new ErreurOutil('Recherche vide.')
      const { data, error } = await ctx.supabase.from('v_equipements_complet')
        .select('categorie_nom, code_inventaire, localisation_complete, site_id, date_mise_en_service, date_fin_garantie, specifications')
        .in('site_id', sites.map((s) => s.id))
        .or(`categorie_nom.ilike.*${texte}*,code_inventaire.ilike.*${texte}*,localisation_complete.ilike.*${texte}*`)
        .order('localisation_complete').limit(a.limite)
      if (error) throw error
      return {
        nombre: data.length,
        equipements: data.map((e) => ({
          famille: e.categorie_nom, code: e.code_inventaire, localisation: e.localisation_complete,
          mise_en_service: dateFr(e.date_mise_en_service), fin_garantie: dateFr(e.date_fin_garantie),
          caracteristiques: e.specifications, site: nomSite(sites, e.site_id),
        })),
      }
    },
  },
  {
    name: 'contrats',
    title: 'Contrats',
    description: 'Contrats des prestataires : type, dates, préavis, résiliation. Par défaut sans les contrats archivés.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { site: { type: 'string' }, inclure_archives: { type: 'boolean', default: false } } },
    annotations: LECTURE,
    schema: z.object({ site, inclure_archives: z.boolean().default(false) }).strict(),
    run: async (a: { site?: string; inclure_archives: boolean }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      let q = ctx.supabase.from('contrats')
        .select('reference, date_signature, date_debut, date_fin, date_resiliation, delai_preavis_jours, est_archive, contrat_parent_id, objet_avenant, commentaires, site_id, prestataires(libelle), types_contrats(libelle)')
        .in('site_id', sites.map((s) => s.id)).order('date_fin', { ascending: true, nullsFirst: false }).limit(200)
      if (!a.inclure_archives) q = q.eq('est_archive', false)
      const { data, error } = await q
      if (error) throw error
      return {
        nombre: data.length,
        contrats: data.map((c) => ({
          reference: c.reference,
          prestataire: (c.prestataires as unknown as { libelle: string } | null)?.libelle,
          type: (c.types_contrats as unknown as { libelle: string } | null)?.libelle,
          avenant: c.contrat_parent_id !== null, objet_avenant: c.objet_avenant,
          signature: dateFr(c.date_signature), debut: dateFr(c.date_debut), fin: dateFr(c.date_fin),
          resiliation: dateFr(c.date_resiliation), preavis_jours: c.delai_preavis_jours, archive: c.est_archive,
          commentaires: c.commentaires, site: nomSite(sites, c.site_id),
        })),
      }
    },
  },
  {
    name: 'investissements',
    title: 'Investissements (budget)',
    description: 'Projets d’investissement d’une année de budget : étape du parcours, devis (fournisseur, montant HT, retenu ou non) et montant retenu.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { annee: { type: 'integer', minimum: 2000, maximum: 2100, description: 'Année de budget ; par défaut l’an prochain' }, site: { type: 'string' } } },
    annotations: LECTURE,
    schema: z.object({ annee: z.number().int().min(2000).max(2100).optional(), site }).strict(),
    run: async (a: { annee?: number; site?: string }, ctx) => {
      const sites = await sitesCibles(ctx, a.site)
      const annee = a.annee ?? new Date().getFullYear() + 1
      const { data, error } = await ctx.supabase.from('investissements')
        .select('libelle, description, statut_capex_id, refus_niveau, date_demande, date_prevalidation, date_validation, date_cloture, date_arret, motif_arret, bilan, site_id, statuts_capex(nom), investissements_devis(fournisseur, objet, montant_ht, retenu)')
        .in('site_id', sites.map((s) => s.id)).eq('annee_budget', annee).order('libelle')
      if (error) throw error
      // Mémoire du parcours (152) : des dates restent gardées hors de leur étape ;
      // on n'affiche que celles que l'étape actuelle justifie, comme la fiche.
      return {
        annee,
        projets: data.map((p) => {
          const s = p.statut_capex_id
          const devis = (p.investissements_devis as unknown as { fournisseur: string; objet: string | null; montant_ht: number; retenu: boolean }[])
          const retenus = devis.filter((d) => d.retenu)
          const refusN2 = s === 4 && (p.refus_niveau !== null ? p.refus_niveau === 2 : p.date_prevalidation !== null)
          return {
            projet: p.libelle,
            description: p.description,
            etape: (p.statuts_capex as unknown as { nom: string } | null)?.nom,
            proposition: dateFr(p.date_demande),
            prevalidation: [5, 2, 3].includes(s) || refusN2 ? dateFr(p.date_prevalidation) : null,
            confirmation: [2, 3].includes(s) ? dateFr(p.date_validation) : null,
            realisation: s === 3 ? dateFr(p.date_cloture) : null,
            bilan: s === 3 ? p.bilan : null,
            refus: s === 4 ? { date: dateFr(p.date_arret), motif: p.motif_arret, niveau: refusN2 ? 'à la confirmation' : 'à la prévalidation' } : null,
            devis,
            montant_retenu_ht: retenus.length ? retenus.reduce((t, d) => t + Number(d.montant_ht), 0) : null,
            site: nomSite(sites, p.site_id),
          }
        }),
      }
    },
  },
]

export const OUTILS = OUTILS_INTERNES

function texte(t: string, isError = false): Resultat {
  return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) }
}

/** Exécute un outil : contrôle d'accès, validation, traduction des erreurs. */
export async function executerOutil(nom: string, args: Record<string, unknown>, ctx: Contexte): Promise<Resultat> {
  const outil = OUTILS_INTERNES.find((o) => o.name === nom)
  if (!outil) return texte(`Outil inconnu : ${nom}`, true)

  // Le verrou est en base (153) ; on le lit seulement pour un message clair.
  const { data: role } = await ctx.supabase.rpc('current_role')
  if (!role)
    return texte('Ton accès Claude n’est pas ouvert (ou ton compte est désactivé). Demande à un administrateur de l’activer sur ta fiche utilisateur dans Dédale.', true)

  const parse = outil.schema.safeParse(args)
  if (!parse.success)
    return texte(`Paramètres refusés : ${parse.error.issues.map((i) => `${i.path.join('.') || 'paramètres'} — ${i.message}`).join(' ; ')}`, true)

  try {
    const resultat = await outil.run(parse.data as never, ctx)
    return texte(JSON.stringify(resultat))
  } catch (e) {
    if (e instanceof ErreurOutil) return texte(e.message, true)
    console.error(`[mcp] ${nom}`, e)
    return texte('Dédale n’a pas pu répondre à cette demande. Réessaie, ou précise-la.', true)
  }
}
