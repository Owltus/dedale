/**
 * Sens Dédale → Dmbook : vider la file `dmbook_file` (plan sync-dmbook, étape 6).
 *
 * Règles PO appliquées :
 *   D2 (révisé 22/11) Dmbook est la source de vérité : avant d'écrire, la fiche est
 *     relue ; si elle a bougé dans Dmbook depuis le dernier passage, on n'envoie
 *     RIEN (ligne « remplacée par Dmbook ») et le passage qui suit applique la
 *     version Dmbook à la DI ;
 *   on n'envoie que la demande concernée, jamais de recopie en masse ;
 *   D8 / D9 chambres en tête du texte (« #112 constat ») ;
 *   D11 Ouvert ↔ Ouvert, En cours ↔ En cours, Clôturé ↔ Fermé.
 *
 * Déverrouillage progressif (`niveau`, secret serveur DMBOOK_ECRITURE) :
 *   aucune — la file est lue, le rapport dit ce qui partirait, rien n'est écrit ;
 *   test   — seules les demandes « ZZ TEST » partent ;
 *   toutes — tout part.
 *
 * Échec : tentatives + 1 et erreur notée, la ligne est reprise au passage suivant ;
 * au 5e échec elle est mise de côté. Session expirée : on s'arrête, le reste attend.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Dmbook, SessionExpiree, type Statut } from '../_shared/dmbook/client.ts'
import { changerChambres, composer } from '../_shared/dmbook/composer.ts'
import { analyser, type Locaux } from '../_shared/dmbook/lieux.ts'
import { empreinteDedale, empreinteDmbook, normaliser } from '../_shared/dmbook/texte.ts'
import { raison } from '../_shared/dmbook/serveur.ts'

export type Niveau = 'aucune' | 'test' | 'toutes'
export const lireNiveau = (v: string | undefined): Niveau => (v === 'test' || v === 'toutes' ? v : 'aucune')

export const ECHECS_MAX = 5
export const ENVOIS_MAX = 10
export const LECTURES_MAX = 20
const MARQUE_TEST = /^\s*(?:#\d{3}\s+)*ZZ TEST/i

export const STATUT_DMBOOK: Record<number, Statut> = { 1: 'ouvert', 2: 'en_cours', 3: 'ferme' }

export type Ligne = { id: number; di_id: string | null; dmbook_id: string | null; action: string; tentatives: number; cree_le?: string }
export type Groupe = { di_id: string | null; dmbook_id: string | null; actions: Set<string>; lignes: Ligne[] }

/**
 * Regroupe les lignes en attente par demande, dans l'ordre de la file.
 * Une suppression l'emporte sur tout le reste ; une création porte l'état complet.
 */
export function regrouper(lignes: Ligne[]): Groupe[] {
  const groupes = new Map<string, Groupe>()
  for (const l of lignes) {
    const cle = l.di_id ?? `ticket:${l.dmbook_id}`
    const g = groupes.get(cle) ?? { di_id: l.di_id, dmbook_id: l.dmbook_id, actions: new Set<string>(), lignes: [] }
    g.actions.add(l.action)
    g.lignes.push(l)
    g.dmbook_id ??= l.dmbook_id
    groupes.set(cle, g)
  }
  for (const g of groupes.values()) {
    if (g.actions.has('supprimer')) g.actions = new Set(['supprimer'])
    else if (g.actions.has('creer')) g.actions = new Set(['creer'])
  }
  return [...groupes.values()]
}

/**
 * Texte Dmbook voulu après une modification Dédale. Si le constat n'a pas changé
 * (seule la chambre a bougé), on garde le texte Dmbook tel quel et on ne corrige
 * que sa tête (D9) : la signature et les retours à la ligne restent intacts.
 */
export function texteVoulu(texteActuel: string, constat: string, chambres: string[], locaux: Locaux): string {
  const lu = analyser(texteActuel, locaux)
  if (normaliser(lu.constat) === normaliser(constat)) return changerChambres(texteActuel, chambres)
  return composer(constat, chambres)
}

/** Après un échec : nouvelle tentative au prochain passage, ou mise de côté. */
export const apresEchec = (tentatives: number) =>
  tentatives + 1 >= ECHECS_MAX ? { tentatives: tentatives + 1, issue: 'mis_de_cote' as const } : { tentatives: tentatives + 1, issue: null }

export type RapportEnvoi = {
  niveau: Niveau
  en_attente: number
  envoyes: number
  remplaces_par_dmbook: number
  echecs: number
  ignores_hors_test: number
  details: string[]
}

type Di = { id: string; constat: string; statut: number; chambres: string[] }

async function chargerDi(sb: SupabaseClient, id: string): Promise<Di | null> {
  const { data, error } = await sb.from('demandes_intervention')
    .select('id, constat, statut_di_id, di_localisations(locaux(nom))').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const d = data as any
  const chambres = (d.di_localisations ?? [])
    .map((x: { locaux: { nom: string } | null }) => x.locaux?.nom.match(/^Chambre (\d{3})$/)?.[1])
    .filter((c: string | undefined): c is string => !!c)
    .sort()
  return { id: d.id, constat: d.constat, statut: d.statut_di_id, chambres }
}

type LienEnvoi = { dmbook_id: string; numero: number | null; dmbook_empreinte: string | null }

export async function envoyer(sb: SupabaseClient, dm: Dmbook, site: string, locaux: Locaux, niveau: Niveau): Promise<RapportEnvoi> {
  const r: RapportEnvoi = { niveau, en_attente: 0, envoyes: 0, remplaces_par_dmbook: 0, echecs: 0, ignores_hors_test: 0, details: [] }
  const { data, error } = await sb.from('dmbook_file').select('id, di_id, dmbook_id, action, tentatives, cree_le')
    .eq('site_id', site).is('fait_le', null).order('id')
  if (error) throw new Error(error.message)
  const groupes = regrouper((data ?? []) as Ligne[])
  r.en_attente = groupes.length
  if (!groupes.length) return r

  const maintenant = () => new Date().toISOString()
  const clore = (g: Groupe, issue: 'envoye' | 'remplace_par_dmbook' | 'annule', erreur: string | null = null) =>
    sb.from('dmbook_file').update({ fait_le: maintenant(), issue, erreur }).in('id', g.lignes.map((l) => l.id))
  // Envoyé : on ne clôt que les lignes qui n'ont pas bougé pendant l'écriture (166). Une
  // modification faite entre-temps garde sa ligne en attente et repart au tour suivant.
  const cloreEnvoye = (g: Groupe, debut: string) =>
    sb.from('dmbook_file').update({ fait_le: maintenant(), issue: 'envoye', erreur: null }).in('id', g.lignes.map((l) => l.id)).lte('cree_le', debut)

  let envois = 0
  let lus = 0
  for (const g of groupes) {
    // Au plus LECTURES_MAX demandes relues par passage : le reste attend, rien n'est perdu.
    if (++lus > LECTURES_MAX) { r.details.push(`${groupes.length - LECTURES_MAX} demande(s) attendent le passage suivant.`); break }
    const debut = maintenant()
    const lien: LienEnvoi | null = g.dmbook_id
      ? ((await sb.from('dmbook_liens').select('dmbook_id, numero, dmbook_empreinte').eq('dmbook_id', g.dmbook_id).maybeSingle()).data as LienEnvoi | null)
      : g.di_id
        ? ((await sb.from('dmbook_liens').select('dmbook_id, numero, dmbook_empreinte').eq('di_id', g.di_id).maybeSingle()).data as LienEnvoi | null)
        : null
    const di = g.di_id ? await chargerDi(sb, g.di_id) : null
    const nom = lien?.numero ? `#${lien.numero}` : di ? `« ${di.constat.slice(0, 50)} »` : 'ticket'
    const quoi = [...g.actions].join(' + ')

    // DI disparue entre-temps (sauf suppression) : plus rien à envoyer.
    if (!g.actions.has('supprimer') && !di) {
      if (niveau !== 'aucune') await clore(g, 'annule', 'Demande supprimée dans Dédale avant l\'envoi.')
      r.details.push(`${nom} : ${quoi} annulé, la demande n'existe plus.`)
      continue
    }

    try {
      // ── Contrôle « ZZ TEST » et état actuel côté Dmbook ──
      // Mode test : une demande connue qui n'est pas « ZZ TEST » est écartée sans contacter Dmbook.
      if (niveau === 'test' && di && !MARQUE_TEST.test(di.constat)) { r.ignores_hors_test++; continue }
      const fiche = lien ? await dm.detail(lien.dmbook_id) : null
      const estTest = MARQUE_TEST.test(di?.constat ?? '') || (!!fiche && /ZZ TEST/i.test(fiche.texte))
      if (niveau === 'test' && !estTest) { r.ignores_hors_test++; continue }

      // D2 : le ticket a bougé dans Dmbook depuis le dernier passage → Dmbook gagne.
      if (lien && fiche && fiche.statut) {
        const eDm = await empreinteDmbook(fiche.texte, fiche.statut)
        if (lien.dmbook_empreinte && eDm !== lien.dmbook_empreinte) {
          if (niveau !== 'aucune') {
            await clore(g, 'remplace_par_dmbook')
            if (g.actions.has('supprimer')) await sb.from('dmbook_liens').delete().eq('dmbook_id', lien.dmbook_id) // recréé par le passage
            else await sb.from('dmbook_liens').update({ dmbook_ts: 0 }).eq('dmbook_id', lien.dmbook_id) // relu par le passage
          }
          r.remplaces_par_dmbook++
          r.details.push(`${nom} : modifié dans Dmbook entre-temps, ${quoi} non envoyé, la version Dmbook est reprise.`)
          continue
        }
      }

      if (niveau === 'aucune') {
        r.details.push(`${nom} : ${quoi} partirait vers Dmbook.`)
        continue
      }
      if (envois >= ENVOIS_MAX) { r.details.push(`${nom} : attend le passage suivant (${ENVOIS_MAX} envois au plus).`); continue }
      envois++

      if (g.actions.has('supprimer')) {
        if (!lien) { await clore(g, 'annule', 'Aucun ticket Dmbook lié.'); continue }
        const e = await dm.existe(lien.dmbook_id)
        if (e === 'inconnu') throw new Error('Réponse incertaine de Dmbook')
        if (e === 'present') await dm.supprimer(lien.dmbook_id)
        await sb.from('dmbook_liens').delete().eq('dmbook_id', lien.dmbook_id)
        await clore(g, 'envoye')
        r.envoyes++
        r.details.push(`${nom} : supprimé dans Dmbook.`)
        continue
      }

      const d = di!
      if (g.actions.has('creer')) {
        if (lien) { await clore(g, 'annule', 'Déjà lié à un ticket Dmbook.'); continue }
        const texte = composer(d.constat, d.chambres)
        const avant = new Set((await dm.listerLeger(1)).tickets.map((t) => t.id))
        await dm.creer(texte)
        // Le nouveau ticket : en tête de liste, inconnu juste avant, même texte.
        const apres = (await dm.listerLeger(1)).tickets.filter((t) => !avant.has(t.id)).slice(0, 3)
        let trouve: { id: string; numero: number | null } | null = null
        for (const t of apres) {
          const f = await dm.detail(t.id)
          if (normaliser(f.texte).includes(normaliser(texte))) { trouve = { id: t.id, numero: f.numero ?? t.numero }; break }
        }
        if (!trouve) {
          // Créé mais non retrouvé : JAMAIS de nouvel essai (il y aurait un doublon dans Dmbook).
          await sb.from('dmbook_file').update({ fait_le: maintenant(), issue: 'mis_de_cote', erreur: 'Créé dans Dmbook mais non retrouvé : à vérifier à la main.' })
            .in('id', g.lignes.map((l) => l.id))
          r.echecs++
          r.details.push(`${nom} : créé dans Dmbook mais non retrouvé, à vérifier à la main.`)
          continue
        }
        if (d.statut !== 1) await dm.changerStatut(trouve.id, STATUT_DMBOOK[d.statut])
        const f = await dm.detail(trouve.id)
        // auteur '' = demande née dans Dédale : pas de « Signalé dans Dmbook par » (D21).
        const { error: e } = await sb.from('dmbook_liens').insert({
          dmbook_id: trouve.id, numero: trouve.numero, di_id: d.id, auteur: '', dmbook_ts: 0, lieu_manuel: false,
          dmbook_empreinte: await empreinteDmbook(f.texte, f.statut ?? STATUT_DMBOOK[d.statut]),
          dedale_empreinte: await empreinteDedale(d.constat, d.chambres, d.statut), synchro_le: maintenant(),
        })
        if (e) throw new Error(`Lien non enregistré : ${e.message}`)
        await clore(g, 'envoye') // toujours : le ticket existe, il ne faut jamais le recréer
        // Modifiée pendant la création ? La suite part comme une modification ordinaire.
        const apresCreation = await chargerDi(sb, d.id)
        if (apresCreation && (await empreinteDedale(apresCreation.constat, apresCreation.chambres, apresCreation.statut)) !== (await empreinteDedale(d.constat, d.chambres, d.statut)))
          await sb.from('dmbook_file').insert(['texte', 'statut'].map((action) => ({ di_id: d.id, dmbook_id: trouve.id, action, site_id: site })))
        r.envoyes++
        r.details.push(`#${trouve.numero ?? '?'} : créé dans Dmbook.`)
        continue
      }

      // texte et / ou statut sur un ticket existant.
      if (!lien || !fiche) { await clore(g, 'annule', 'Aucun ticket Dmbook lié.'); continue }
      if (g.actions.has('texte')) {
        const actuel = (await dm.formulaireEdition(lien.dmbook_id)).texte
        const voulu = texteVoulu(actuel, d.constat, d.chambres, locaux)
        if (normaliser(voulu) !== normaliser(actuel)) await dm.modifierTexte(lien.dmbook_id, voulu)
      }
      if (g.actions.has('statut') && fiche.statut !== STATUT_DMBOOK[d.statut]) await dm.changerStatut(lien.dmbook_id, STATUT_DMBOOK[d.statut])
      // Anti-écho : nouvelle empreinte Dmbook ; data-ts à 0 → le passage suivant ne fait que noter la date.
      const f = await dm.detail(lien.dmbook_id)
      await sb.from('dmbook_liens').update({
        dmbook_ts: 0, synchro_le: maintenant(),
        dmbook_empreinte: await empreinteDmbook(f.texte, f.statut ?? STATUT_DMBOOK[d.statut]),
        dedale_empreinte: await empreinteDedale(d.constat, d.chambres, d.statut),
      }).eq('dmbook_id', lien.dmbook_id)
      await cloreEnvoye(g, debut)
      r.envoyes++
      r.details.push(`${nom} : ${quoi} envoyé dans Dmbook.`)
    } catch (e) {
      if (e instanceof SessionExpiree) {
        r.details.push('Session Dmbook expirée : le reste de la file attend.')
        throw e
      }
      r.echecs++
      const msg = raison(e).slice(0, 300)
      for (const l of g.lignes) {
        const s = apresEchec(l.tentatives)
        await sb.from('dmbook_file').update({ tentatives: s.tentatives, erreur: msg, ...(s.issue ? { issue: s.issue, fait_le: maintenant() } : {}) }).eq('id', l.id)
      }
      r.details.push(`${nom} : échec (${msg}), nouvel essai au prochain passage.`)
    }
  }
  return r
}
