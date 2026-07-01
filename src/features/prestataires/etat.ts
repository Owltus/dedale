import { todayLocal } from '@/lib/date'

export type EtatContrat = 'a_venir' | 'actif' | 'termine'

interface EtatContratInfo {
  etat: EtatContrat
  label: string
  variant: 'default' | 'secondary' | 'outline'
}

const LABELS: Record<EtatContrat, EtatContratInfo> = {
  a_venir: { etat: 'a_venir', label: 'À venir', variant: 'outline' },
  actif: { etat: 'actif', label: 'Actif', variant: 'default' },
  termine: { etat: 'termine', label: 'Terminé', variant: 'secondary' },
}

/**
 * État d'un contrat dérivé de ses dates, calculé côté front à la date du jour.
 * - à venir : la date de début est dans le futur
 * - terminé : la date de fin est passée
 * - actif : sinon (en cours, ou sans date de fin)
 */
export function etatContrat(
  dateDebut: string,
  dateFin: string | null,
  aujourdhui = new Date(),
): EtatContratInfo {
  // Comparaison sur le jour (les dates Postgres sont au format YYYY-MM-DD).
  const today = aujourdhui.toISOString().slice(0, 10)

  if (dateDebut > today) return LABELS.a_venir
  if (dateFin && dateFin < today) return LABELS.termine
  return LABELS.actif
}

// ── Reconduction / préavis / résiliation ──────────────────────────────────────
// API dérivée des colonnes de `contrats`, calculée côté front pour alimenter la
// frise (étape 7). TOUT EN HEURE LOCALE : les dates sont des dates nues
// `YYYY-MM-DD` comparées en string ; l'arithmétique passe par le constructeur
// `Date(y, m, d)` (heure locale), jamais `new Date(iso)` qui décalerait au fuseau.

/** Identifiants de `types_contrats` (source : base). */
export const TYPE_CONTRAT = {
  determine: 1,
  tacite: 2,
  indetermine: 3,
} as const

/**
 * Sous-ensemble de `contrats` nécessaire aux calculs. Une ligne `contrats` (Row)
 * est structurellement compatible ; on reste découplé du type Supabase complet.
 */
export interface DonneesContrat {
  type_contrat_id: number
  date_debut: string
  date_fin: string | null
  date_signature: string | null
  date_resiliation: string | null
  date_notification: string | null
  delai_preavis_jours: number
  duree_cycle_mois: number | null
  fenetre_resiliation_jours: number | null
}

/** `YYYY-MM-DD` d'une date locale (sans décalage de fuseau). */
function isoLocale(d: Date): string {
  const a = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/** Composantes [année, mois (1-12), jour] d'une date nue, ou null si invalide. */
function composantes(iso: string | null): [number, number, number] | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Ajoute `mois` mois à une date nue (heure locale). Null si l'entrée est invalide. */
export function ajouterMoisIso(iso: string, mois: number): string | null {
  const c = composantes(iso)
  if (!c) return null
  return isoLocale(new Date(c[0], c[1] - 1 + mois, c[2]))
}

/** Ajoute `jours` jours à une date nue (heure locale). Null si l'entrée est invalide. */
export function ajouterJoursIso(iso: string, jours: number): string | null {
  const c = composantes(iso)
  if (!c) return null
  return isoLocale(new Date(c[0], c[1] - 1, c[2] + jours))
}

export type TypeEcheance = 'fin' | 'reconduction' | 'aucune'

export interface EcheanceContrat {
  /** `fin` (déterminé), `reconduction` (tacite), `aucune` (indéterminé). */
  type: TypeEcheance
  /** Date d'échéance `YYYY-MM-DD`, ou null (aucune, ou données insuffisantes). */
  date: string | null
}

/**
 * Prochaine échéance du contrat, à la date `aujourdhui` (défaut : aujourd'hui).
 * - Déterminé (1) : `date_fin`.
 * - Tacite (2) : `date_debut` + k×`duree_cycle_mois`, plus petite occurrence
 *   STRICTEMENT postérieure à aujourd'hui (k ≥ 1).
 * - Indéterminé (3) : aucune échéance.
 */
export function prochaineEcheanceContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): EcheanceContrat {
  if (c.type_contrat_id === TYPE_CONTRAT.determine) {
    return { type: 'fin', date: c.date_fin }
  }
  if (c.type_contrat_id === TYPE_CONTRAT.tacite) {
    const cycle = c.duree_cycle_mois
    if (!cycle || cycle <= 0 || !composantes(c.date_debut)) {
      return { type: 'reconduction', date: null }
    }
    // Plus petite reconduction k ≥ 1 telle que debut + k×cycle > aujourd'hui.
    let k = 1
    let date = ajouterMoisIso(c.date_debut, cycle * k)
    // Garde-fou : borne les itérations pour un contrat très ancien.
    while (date && date <= aujourdhui && k < 10_000) {
      k += 1
      date = ajouterMoisIso(c.date_debut, cycle * k)
    }
    return { type: 'reconduction', date }
  }
  return { type: 'aucune', date: null }
}

export interface FenetrePreavis {
  /** La fenêtre de préavis est-elle ouverte aujourd'hui ? */
  ouverte: boolean
  /** Ouverture `YYYY-MM-DD` : échéance − préavis − fenêtre. Null si indéterminable. */
  debut: string | null
  /** Dernier jour pour résilier `YYYY-MM-DD` : échéance − préavis. Null si aucune échéance. */
  fin: string | null
}

/**
 * Fenêtre de préavis : intervalle [échéance − préavis − `fenetre_resiliation_jours` ;
 * échéance − préavis] pendant lequel la résiliation peut être notifiée.
 * `ouverte` est vrai si aujourd'hui ∈ [debut ; fin].
 * Sans échéance (type indéterminé, ou données insuffisantes) → fermée.
 * Sans `fenetre_resiliation_jours` la borne d'ouverture est inconnue → `debut`
 * null et fenêtre considérée FERMÉE (choix conservateur).
 */
export function fenetrePreavisContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): FenetrePreavis {
  const echeance = prochaineEcheanceContrat(c, aujourdhui).date
  if (!echeance) return { ouverte: false, debut: null, fin: null }
  const fin = ajouterJoursIso(echeance, -c.delai_preavis_jours)
  const debut =
    !fin || c.fenetre_resiliation_jours == null
      ? null
      : ajouterJoursIso(fin, -c.fenetre_resiliation_jours)
  const ouverte =
    debut != null && fin != null && aujourdhui >= debut && aujourdhui <= fin
  return { ouverte, debut, fin }
}

/** La résiliation est-elle déclarée (`date_resiliation` renseignée) ? */
export function resiliationDeclaree(c: DonneesContrat): boolean {
  return Boolean(c.date_resiliation)
}

export type TypeEvenementContrat =
  | 'signature'
  | 'debut'
  | 'preavis_debut'
  | 'preavis_fin'
  | 'notification'
  | 'echeance'
  | 'resiliation'

export interface EvenementContrat {
  type: TypeEvenementContrat
  /** Date de l'événement `YYYY-MM-DD`. */
  date: string
  /** Libellé prêt à afficher (français). */
  label: string
}

/**
 * Événements datés d'un contrat, triés chronologiquement — à consommer par la
 * frise (étape 7). N'inclut que les événements dont la date est connue.
 */
export function evenementsContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): EvenementContrat[] {
  const evts: EvenementContrat[] = []
  const push = (
    type: TypeEvenementContrat,
    date: string | null,
    label: string,
  ) => {
    if (date) evts.push({ type, date, label })
  }
  const echeance = prochaineEcheanceContrat(c, aujourdhui)
  const preavis = fenetrePreavisContrat(c, aujourdhui)
  push('signature', c.date_signature, 'Signature')
  push('debut', c.date_debut, 'Début du contrat')
  push('preavis_debut', preavis.debut, 'Ouverture du préavis')
  push('preavis_fin', preavis.fin, 'Dernier jour pour résilier')
  push('notification', c.date_notification, 'Notification de résiliation')
  push(
    'echeance',
    echeance.date,
    echeance.type === 'reconduction' ? 'Reconduction' : 'Fin du contrat',
  )
  push('resiliation', c.date_resiliation, 'Résiliation')
  return evts.sort((a, b) => a.date.localeCompare(b.date))
}
