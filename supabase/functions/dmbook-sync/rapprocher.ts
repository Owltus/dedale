/**
 * Décision par ticket, sens Dmbook → Dédale (plan sync-dmbook, étape 5).
 * Fonction PURE (aucun appel réseau ni base) : testée dans rapprocher.test.ts.
 *
 * Règles PO appliquées :
 *   D2 (révisé 22/11) Dmbook est la source de vérité : en cas de conflit, sa version gagne ;
 *   D10 lieux lus dans le texte (chambres), sinon choix manuel ; ambigu → on ne touche pas ;
 *   D11 Ouvert ↔ Ouvert, En cours ↔ En cours, Fermé ↔ Clôturé ;
 *   D12 commentaires ignorés : une activité sans changement ne fait que noter la date ;
 *   D17 un lieu choisi à la main est gardé, sauf si le nouveau texte cite une chambre.
 * On ne retire JAMAIS un lieu sur un doute.
 */
import { analyser, chambreDuNom, type Locaux } from '../_shared/dmbook/lieux.ts'
import { empreinteDedale, empreinteDmbook } from '../_shared/dmbook/texte.ts'
import type { Statut, TicketDetail } from '../_shared/dmbook/client.ts'

export const STATUT_DEDALE: Record<Statut, number> = { ouvert: 1, en_cours: 2, ferme: 3 }

export type Lien = {
  dmbook_id: string
  numero: number | null
  di_id: string | null
  dmbook_ts: number
  dmbook_empreinte: string | null
  lieu_manuel: boolean
  auteur?: string | null
}

export type DiActuelle = {
  id: string
  statut: number
  constat: string
  lieux: { id: string; nom: string }[]
  /** Actions Dédale encore en file pour cette DI (texte, statut…). */
  enAttente: string[]
}

export type Decision =
  | { type: 'creer'; dmbook_id: string; numero: number | null; auteur: string | null; constat: string; statut: number; lieux: string[]; source: string; cree_le: string | null; ts: number; eDm: string; eDe: string }
  | { type: 'ts'; dmbook_id: string; di_id: string; ts: number }
  | {
      type: 'maj'; dmbook_id: string; di_id: string; ts: number; eDm: string; eDe: string
      constat: string | null; statut: number | null; lieux: string[] | null
      /** Des actions Dédale attendaient : elles sont abandonnées, Dmbook gagne. */
      conflit: boolean
      quoi: string[]
    }
  | { type: 'ignorer'; dmbook_id: string; raison: string }

const MOIS: Record<string, string> = {
  janv: '01', févr: '02', mars: '03', avr: '04', mai: '05', juin: '06',
  juil: '07', août: '08', sept: '09', oct: '10', nov: '11', déc: '12',
}
/** « 30 nov. 2021 à 17:17 » (heure de Paris) → « 2021-11-30 17:17:00 Europe/Paris », lu tel quel par PostgreSQL. */
export function dateDmbook(s: string | null): string | null {
  const m = s?.match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})\s+à\s+(\d{2}):(\d{2})/i)
  const mois = m && MOIS[m[2].toLowerCase()]
  if (!m || !mois) return null
  return `${m[3]}-${mois}-${m[1].padStart(2, '0')} ${m[4]}:${m[5]}:00 Europe/Paris`
}

const memes = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

export async function decider(
  t: TicketDetail,
  ts: number,
  lien: Lien | undefined,
  di: DiActuelle | undefined,
  locaux: Locaux,
): Promise<Decision> {
  if (!t.statut) return { type: 'ignorer', dmbook_id: t.id, raison: 'statut Dmbook illisible' }
  const statut = STATUT_DEDALE[t.statut]
  const eDm = await empreinteDmbook(t.texte, t.statut)

  if (!lien) {
    const a = analyser(t.texte, locaux)
    return {
      type: 'creer', dmbook_id: t.id, numero: t.numero, auteur: t.auteur, constat: a.constat, statut, lieux: a.lieux, source: a.source,
      cree_le: dateDmbook(t.creeLe), ts, eDm, eDe: await empreinteDedale(a.constat, a.chambres, statut),
    }
  }
  if (!lien.di_id) return { type: 'ignorer', dmbook_id: t.id, raison: 'DI supprimée dans Dédale, suppression du ticket en attente' }
  if (!di) return { type: 'ignorer', dmbook_id: t.id, raison: 'DI liée introuvable' }
  if (eDm === lien.dmbook_empreinte) return { type: 'ts', dmbook_id: t.id, di_id: di.id, ts }

  // Le texte a-t-il changé, ou seulement le statut ? L'empreinte enregistrée mêle les deux.
  let texteInchange = false
  for (const s of ['ouvert', 'en_cours', 'ferme'] as const)
    if ((await empreinteDmbook(t.texte, s)) === lien.dmbook_empreinte) texteInchange = true

  const quoi: string[] = []
  let constat: string | null = null
  let lieux: string[] | null = null
  const chambresActuelles = di.lieux.map((l) => chambreDuNom(l.nom)).filter((c): c is string => !!c)
  let chambres = chambresActuelles

  if (!texteInchange) {
    const a = analyser(t.texte, locaux)
    if (a.constat !== di.constat) { constat = a.constat; quoi.push('constat') }
    const actuels = di.lieux.map((l) => l.id)
    let voulus: string[] | null = null
    if (a.source === 'tete' || a.source === 'citee') voulus = a.lieux // une chambre citée l'emporte toujours (D17)
    else if (a.source === 'commun' && !lien.lieu_manuel) voulus = a.lieux
    // 'aucun' ou 'ambigu' : on garde les lieux actuels (jamais retirer sur un doute).
    if (voulus && !memes(voulus, actuels)) {
      lieux = voulus
      chambres = a.chambres
      quoi.push('lieux')
    }
  }
  const statutFinal = statut
  const changeStatut = statut !== di.statut
  if (changeStatut) quoi.push('statut')

  return {
    type: 'maj', dmbook_id: t.id, di_id: di.id, ts, eDm,
    eDe: await empreinteDedale(constat ?? di.constat, chambres, statutFinal),
    constat, statut: changeStatut ? statut : null, lieux,
    conflit: di.enAttente.length > 0,
    quoi,
  }
}
