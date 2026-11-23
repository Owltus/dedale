/**
 * Un passage Dmbook → Dédale (plan sync-dmbook, étape 5 ; décisions PO du 22/11).
 *
 * Lecture ciblée (toutes les 5 min) :
 *   A. la liste « Ouvert + En cours », lue en entier quel que soit l'âge des tickets ;
 *   B. la page 1 des plus récents, et la suivante tant qu'on n'y croise que des inconnus.
 * Tour complet (une fois par heure) : toute la liste, en lecture légère.
 * On compare le data-ts avant d'ouvrir une fiche ; au plus FICHES_MAX fiches par passage
 * (le reste attend le passage suivant, rien n'est perdu).
 *
 * Disparitions (D3, D5) : un ticket n'est supprimé que si la liste qui devait le
 * contenir a été lue EN ENTIER et que sa fiche répond « Page introuvable ». Plus de
 * 10 suppressions d'un coup → pause, rien n'est supprimé.
 *
 * À blanc (par défaut) : tout est calculé, rien n'est écrit dans les DI. Le rapport
 * dit ce qui aurait été fait.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Dmbook, SessionExpiree, type TicketLeger } from '../_shared/dmbook/client.ts'
import { type Local, Locaux } from '../_shared/dmbook/lieux.ts'
import { decider, type Decision, type DiActuelle, type Lien, STATUT_DEDALE } from './rapprocher.ts'

const FICHES_MAX = 40
const SUPPRESSIONS_MAX = 10

export type Rapport = {
  mode: 'a_blanc' | 'reel'
  tour_complet: boolean
  lus: number
  fiches: number
  reportees: number
  decisions: { creer: number; maj: number; ts: number; supprimer: number; ignorer: number; conflits: number; auteurs: number }
  details: string[]
  pause?: string
  requetes: number
}

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>
/** Lecture par tranches : l'API renvoie au plus 1 000 lignes par requête. */
async function toutLire<T>(q: () => { range: (de: number, a: number) => Page }, taille = 1000): Promise<T[]> {
  const tout: T[] = []
  for (let de = 0; ; de += taille) {
    const { data, error } = await q().range(de, de + taille - 1)
    if (error) throw new Error(error.message)
    tout.push(...(data as T[]))
    if ((data as T[]).length < taille) return tout
  }
}

export async function chargerLocaux(sb: SupabaseClient, site: string): Promise<Locaux> {
  type L = { id: string; nom: string; niveaux: { nom: string } }
  const l = await toutLire<L>(() =>
    sb.from('locaux').select('id, nom, niveaux!inner(nom, batiments!inner(site_id))').eq('niveaux.batiments.site_id', site).order('id'))
  return new Locaux(l.map((x): Local => ({ id: x.id, nom: x.nom, niveau: x.niveaux.nom })))
}

async function chargerDi(sb: SupabaseClient, ids: string[], attente: Map<string, string[]>): Promise<Map<string, DiActuelle>> {
  const res = new Map<string, DiActuelle>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('demandes_intervention')
      .select('id, statut_di_id, constat, di_localisations(local_id, locaux(nom))').in('id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    // deno-lint-ignore no-explicit-any
    for (const d of data as any[])
      res.set(d.id, {
        id: d.id, statut: d.statut_di_id, constat: d.constat,
        lieux: (d.di_localisations ?? []).map((x: { local_id: string; locaux: { nom: string } }) => ({ id: x.local_id, nom: x.locaux.nom })),
        enAttente: attente.get(d.id) ?? [],
      })
  }
  return res
}

export async function passage(sb: SupabaseClient, dm: Dmbook, site: string, opts: { reel: boolean; complet: boolean }): Promise<Rapport> {
  const r: Rapport = {
    mode: opts.reel ? 'reel' : 'a_blanc', tour_complet: opts.complet, lus: 0, fiches: 0, reportees: 0,
    decisions: { creer: 0, maj: 0, ts: 0, supprimer: 0, ignorer: 0, conflits: 0, auteurs: 0 }, details: [], requetes: 0,
  }

  // ── Ce que Dédale sait déjà ──
  const liens = new Map((await toutLire<Lien>(() =>
    sb.from('dmbook_liens').select('dmbook_id, numero, di_id, dmbook_ts, dmbook_empreinte, lieu_manuel, auteur').order('dmbook_id'))).map((l) => [l.dmbook_id, l]))
  const attente = new Map<string, string[]>()
  for (const f of await toutLire<{ di_id: string; action: string }>(() =>
    sb.from('dmbook_file').select('di_id, action').is('fait_le', null).order('id')))
    attente.set(f.di_id, [...(attente.get(f.di_id) ?? []), f.action])

  // ── Lectures Dmbook (légères) ──
  const vus = new Map<string, TicketLeger>()
  let attendus: string[] = [] // liens qui DEVAIENT apparaître dans une liste lue en entier
  if (opts.complet) {
    const t = await dm.listerTout(150)
    for (const x of t.tickets) vus.set(x.id, x)
    if (t.complet) attendus = [...liens.keys()]
    else r.details.push(`Tour complet incomplet (${t.tickets.length}/${t.total}) : aucune disparition décidée.`)
  } else {
    // A. Ouverts + en cours, en entier.
    const a = await dm.listerTout(150, 1, 10, ['ouvert', 'en_cours'])
    for (const x of a.tickets) vus.set(x.id, x)
    // B. Nouveaux : page 1, puis suivantes tant qu'elles ne contiennent que des inconnus.
    for (let p = 1; p <= 3; p++) {
      const b = await dm.listerLeger(p)
      for (const x of b.tickets) vus.set(x.id, x)
      if (b.tickets.some((x) => liens.has(x.id)) || b.tickets.length < 50) break
    }
    if (a.complet) {
      // Les DI ouvertes / en cours côté Dédale doivent figurer dans la liste A.
      const { data, error } = await sb.from('demandes_intervention').select('id').eq('site_id', site).in('statut_di_id', [1, 2])
      if (error) throw new Error(error.message)
      const ouvertes = new Set((data ?? []).map((d: { id: string }) => d.id))
      attendus = [...liens.values()].filter((l) => l.di_id && ouvertes.has(l.di_id) && !a.tickets.some((x) => x.id === l.dmbook_id)).map((l) => l.dmbook_id)
    } else r.details.push(`Liste « Ouvert + En cours » incomplète (${a.tickets.length}/${a.total}) : aucune disparition décidée.`)
  }
  r.lus = vus.size

  // ── Qui a bougé ? ──
  const aOuvrir = [...vus.values()].filter((x) => liens.get(x.id)?.dmbook_ts !== x.modifieLe)
  // Sortis de la liste attendue : fiche à vérifier (fermé ? supprimé ?).
  const sortis = attendus.filter((id) => !vus.has(id))
  const locaux = await chargerLocaux(sb, site)
  const diIds = [...aOuvrir, ...sortis.map((id) => ({ id }))].map((x) => liens.get(x.id)?.di_id).filter((x): x is string => !!x)
  const dis = await chargerDi(sb, [...new Set(diIds)], attente)

  const decisions: Decision[] = []
  const suppressions: { dmbook_id: string; di_id: string | null }[] = []
  for (const x of aOuvrir) {
    if (r.fiches >= FICHES_MAX) { r.reportees++; continue }
    r.fiches++
    const t = await dm.detail(x.id)
    const l = liens.get(x.id)
    decisions.push(await decider(t, x.modifieLe, l, l?.di_id ? dis.get(l.di_id) : undefined, locaux))
  }
  for (const id of sortis) {
    if (r.fiches >= FICHES_MAX) { r.reportees++; continue }
    r.fiches++
    const e = await dm.existe(id)
    const l = liens.get(id)!
    if (e === 'supprime') suppressions.push({ dmbook_id: id, di_id: l.di_id })
    else if (e === 'present') {
      const t = await dm.detail(id)
      decisions.push(await decider(t, l.dmbook_ts, l, l.di_id ? dis.get(l.di_id) : undefined, locaux))
    } else r.details.push(`#${l.numero ?? id} : réponse incertaine de Dmbook, on réessaiera.`)
  }

  for (const d of decisions) {
    r.decisions[d.type]++
    if (d.type === 'maj' && d.conflit) r.decisions.conflits++
    const n = d.type === 'ignorer' ? d.dmbook_id : `#${liens.get(d.dmbook_id)?.numero ?? (d.type === 'creer' ? d.numero : '?')}`
    if (d.type === 'creer') {
      const noms = d.lieux.map((id) => locaux.liste.find((l) => l.id === id)?.nom ?? '?').join(', ') || 'aucun (à choisir dans Dédale)'
      r.details.push(`${n} : nouveau → DI ${d.statut === 3 ? 'clôturée' : d.statut === 2 ? 'en cours' : 'ouverte'} « ${d.constat.slice(0, 80)} », lieu : ${noms}`)
    }
    if (d.type === 'maj') r.details.push(`${n} : ${d.quoi.join(' + ') || 'empreinte seule'}${d.conflit ? ' (conflit : Dmbook gagne)' : ''}`)
    if (d.type === 'ignorer') r.details.push(`${n} : ignoré, ${d.raison}`)
  }
  r.decisions.supprimer = suppressions.length
  for (const s of suppressions) r.details.push(`#${liens.get(s.dmbook_id)?.numero ?? s.dmbook_id} : supprimé dans Dmbook (page introuvable) → DI à supprimer`)
  if (suppressions.length > SUPPRESSIONS_MAX) r.pause = `${suppressions.length} tickets disparus d'un coup : synchro mise en pause, rien n'est supprimé.`
  r.requetes = dm.requetes
  // Auteur Dmbook encore inconnu sur un lien (D21) : lu dans la liste, sans ouvrir de fiche.
  // '' = demande née dans Dédale (envoyer.ts) : on n'y met jamais d'auteur Dmbook.
  const auteurs = [...vus.values()].filter((x) => x.auteur && liens.has(x.id) && liens.get(x.id)!.auteur == null).slice(0, 50)
  r.decisions.auteurs = auteurs.length

  if (!opts.reel || r.pause) return r

  for (const x of auteurs) await sb.from('dmbook_liens').update({ auteur: x.auteur }).eq('dmbook_id', x.id)

  // ── Écriture réelle (anti-écho posé par les fonctions SQL) ──
  for (const d of decisions) {
    if (d.type === 'creer') {
      const { error } = await sb.rpc('dmbook_creer_di', {
        p_site_id: site, p_auteur: d.auteur,
        p_dmbook_id: d.dmbook_id, p_numero: d.numero, p_constat: d.constat, p_statut: d.statut, p_locaux: d.lieux,
        p_cree_le: d.cree_le, p_ts: d.ts, p_empreinte_dmbook: d.eDm, p_empreinte_dedale: d.eDe,
      })
      if (error) r.details.push(`Création ${d.dmbook_id} refusée : ${error.message}`)
    } else if (d.type === 'ts') {
      await sb.from('dmbook_liens').update({ dmbook_ts: d.ts, synchro_le: new Date().toISOString() }).eq('dmbook_id', d.dmbook_id)
    } else if (d.type === 'maj') {
      if (d.conflit)
        await sb.from('dmbook_file').update({ fait_le: new Date().toISOString(), issue: 'remplace_par_dmbook' }).eq('di_id', d.di_id).is('fait_le', null)
      const { error } = await sb.rpc('dmbook_maj_di', {
        p_di_id: d.di_id, p_constat: d.constat, p_statut: d.statut, p_locaux: d.lieux,
        p_ts: d.ts, p_empreinte_dmbook: d.eDm, p_empreinte_dedale: d.eDe,
      })
      if (error) r.details.push(`Mise à jour ${d.dmbook_id} refusée : ${error.message}`)
    }
  }
  for (const s of suppressions) {
    const { error } = await sb.rpc('dmbook_supprimer_di', { p_dmbook_id: s.dmbook_id })
    if (error) r.details.push(`Suppression ${s.dmbook_id} refusée : ${error.message}`)
  }
  return r
}

export { SessionExpiree, STATUT_DEDALE }
