import {
  formatDateLong,
  isoLocale,
  JOUR_MS,
  parseDateLocale,
  todayLocal,
} from '@/lib/date'
import type { StatusTone } from '@/components/common/status-badge'

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
  // Comparaison sur le jour (les dates Postgres sont au format YYYY-MM-DD),
  // en heure LOCALE — jamais `toISOString()` qui renvoie l'UTC et décalerait la
  // date à la veille en France (UTC+1/+2) près de minuit.
  const today = isoLocale(aujourdhui)

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
  /** Version courante (false) ou avenant archivé (true). Optionnel : les
   * consommateurs historiques (frise dashboard) ne le fournissent pas → traité
   * comme `false`. */
  est_archive?: boolean
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

// ── Statut détaillé / progression / alerte (carte riche) ──────────────────────
// Dérivés visuels de la carte contrat. TOUT calculé ici (le composant ne fait
// qu'afficher). Dates nues comparées en string ; écarts en jours via `joursEntre`.

/** Nombre de jours entiers de `depuis` vers `jusqu` (négatif si `jusqu` < `depuis`). */
function joursEntre(jusqu: string, depuis: string): number {
  return Math.round(
    (parseDateLocale(jusqu).getTime() - parseDateLocale(depuis).getTime()) /
      JOUR_MS,
  )
}

/** Seuils d'alerte d'imminence d'échéance (en jours) — cf. D2 du plan. */
export const SEUIL_ALERTE_DANGER_JOURS = 15
export const SEUIL_ALERTE_WARNING_JOURS = 45

export type StatutContrat =
  | 'archive'
  | 'resilie'
  | 'a_venir'
  | 'expire'
  | 'actif'

export interface StatutContratInfo {
  statut: StatutContrat
  /** Libellé principal (français). */
  label: string
  /** Précision affichée sous le statut (ex. « préavis ouvert »). */
  sousStatut?: string
  /** Tonalité sémantique du badge (jamais de couleur en dur). */
  tone: StatusTone
}

/** Sous-statut d'un contrat ACTIF : résiliation notifiée, préavis, imminence. */
function sousStatutActif(
  c: DonneesContrat,
  aujourdhui: string,
): string | undefined {
  // Résiliation annoncée mais pas encore effective.
  if (
    c.date_notification ||
    (c.date_resiliation && c.date_resiliation > aujourdhui)
  ) {
    return 'Résiliation notifiée'
  }
  if (fenetrePreavisContrat(c, aujourdhui).ouverte) return 'Préavis ouvert'
  const echeance = prochaineEcheanceContrat(c, aujourdhui)
  if (echeance.date) {
    const jours = joursEntre(echeance.date, aujourdhui)
    if (jours >= 0 && jours <= SEUIL_ALERTE_WARNING_JOURS) {
      return echeance.type === 'reconduction'
        ? 'Reconduction imminente'
        : 'Échéance proche'
    }
  }
  return undefined
}

/**
 * Statut détaillé d'un contrat, en cascade (cf. D2 du plan) :
 * Archivé → Résilié → À venir → Expiré → Actif (+ sous-statut).
 * `destructive` est réservé aux ACTIONS : un état défavorable prend `warning`.
 */
export function statutContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): StatutContratInfo {
  if (c.est_archive)
    return { statut: 'archive', label: 'Archivé', tone: 'neutral' }
  if (c.date_resiliation && c.date_resiliation <= aujourdhui) {
    return { statut: 'resilie', label: 'Résilié', tone: 'neutral' }
  }
  if (c.date_debut > aujourdhui) {
    return { statut: 'a_venir', label: 'À venir', tone: 'info' }
  }
  if (
    c.type_contrat_id === TYPE_CONTRAT.determine &&
    c.date_fin &&
    c.date_fin < aujourdhui
  ) {
    return { statut: 'expire', label: 'Expiré', tone: 'warning' }
  }
  return {
    statut: 'actif',
    label: 'Actif',
    tone: 'success',
    sousStatut: sousStatutActif(c, aujourdhui),
  }
}

/**
 * Progression 0..1 du contrat dans sa période courante (début → prochaine
 * échéance). `null` si indéterminé (aucune échéance) ou archivé.
 * Tacite : la période courante démarre à la reconduction précédente.
 */
export function progressionContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): number | null {
  if (c.est_archive) return null
  const echeance = prochaineEcheanceContrat(c, aujourdhui)
  if (!echeance.date) return null
  let debut = c.date_debut
  if (echeance.type === 'reconduction' && c.duree_cycle_mois) {
    debut = ajouterMoisIso(echeance.date, -c.duree_cycle_mois) ?? c.date_debut
  }
  const total = joursEntre(echeance.date, debut)
  if (total <= 0) return 1
  const ecoule = joursEntre(aujourdhui, debut)
  return Math.min(1, Math.max(0, ecoule / total))
}

export interface AlerteContrat {
  tone: StatusTone
  message: string
}

/**
 * Alerte d'imminence d'échéance : `warning` sous 45 j, `destructive` sous 15 j
 * (seul cas d'attention urgente sur la carte). `null` si rien à signaler,
 * contrat archivé ou déjà résilié.
 */
export function alerteContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): AlerteContrat | null {
  if (c.est_archive) return null
  if (c.date_resiliation && c.date_resiliation <= aujourdhui) return null
  const echeance = prochaineEcheanceContrat(c, aujourdhui)
  if (!echeance.date) return null
  const jours = joursEntre(echeance.date, aujourdhui)
  if (jours < 0) return null
  const quoi = echeance.type === 'reconduction' ? 'Reconduction' : 'Échéance'
  const message =
    jours === 0 ? `${quoi} aujourd'hui` : `${quoi} dans ${String(jours)} j`
  if (jours <= SEUIL_ALERTE_DANGER_JOURS)
    return { tone: 'destructive', message }
  if (jours <= SEUIL_ALERTE_WARNING_JOURS) return { tone: 'warning', message }
  return null
}

// ── Chaîne de versions (avenants) ─────────────────────────────────────────────
// Reconstruction CÔTÉ FRONT (D5 : pas de RPC récursive). Chaque contrat n'a au
// plus qu'un avenant (le trigger interdit d'avenanter un parent déjà archivé) →
// la chaîne est LINÉAIRE : racine → … → version courante.

export interface NoeudVersion {
  id: string
  contrat_parent_id: string | null
  date_debut: string
}

/** Nombre d'avenants directs (enfants) d'un contrat. */
export function nbAvenantsDirects(
  tous: { contrat_parent_id: string | null }[],
  contratId: string,
): number {
  return tous.filter((c) => c.contrat_parent_id === contratId).length
}

/**
 * Chaîne linéaire des versions à laquelle appartient `cibleId`, de la racine à la
 * feuille (ordre chronologique). `tous` = tous les contrats du prestataire/site
 * (archivés inclus). Renvoie `[]` si la cible est absente.
 */
export function chaineDeVersions<T extends NoeudVersion>(
  tous: T[],
  cibleId: string,
): T[] {
  const parId = new Map(tous.map((c) => [c.id, c]))
  let racine = parId.get(cibleId)
  if (!racine) return []
  // Remonter à la racine (garde-fou anti-cycle).
  const remonte = new Set<string>()
  while (
    racine.contrat_parent_id &&
    parId.has(racine.contrat_parent_id) &&
    !remonte.has(racine.id)
  ) {
    remonte.add(racine.id)
    racine = parId.get(racine.contrat_parent_id)!
  }
  // Descendre par enfants (le plus ancien d'abord — chaîne linéaire).
  const enfantsDe = new Map<string, T[]>()
  for (const c of tous) {
    if (!c.contrat_parent_id) continue
    const l = enfantsDe.get(c.contrat_parent_id) ?? []
    l.push(c)
    enfantsDe.set(c.contrat_parent_id, l)
  }
  const chaine: T[] = []
  const vus = new Set<string>()
  let courant: T | undefined = racine
  while (courant && !vus.has(courant.id)) {
    vus.add(courant.id)
    chaine.push(courant)
    const enfants = (enfantsDe.get(courant.id) ?? [])
      .slice()
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut))
    courant = enfants[0]
  }
  return chaine
}

// ── Texte explicatif du statut (phrase en langage naturel — doc #16) ──────────
// Décrit EN TOUTES LETTRES où en est le contrat, pour la carte. Cascade et
// gabarits repris mot pour mot du doc #16. Approximations de durée assumées
// (mois via /30,44, années via /365,25) ; bornes de cycle en mois calendaires.

/** Date en toutes lettres (« 15 juin 2026 »), ou « date non définie » si absente. */
function fmtLong(iso: string | null): string {
  return iso ? formatDateLong(parseDateLocale(iso)) : 'date non définie'
}

/** Durée lisible à partir d'un nombre de jours (approximations assumées). */
function formatDuree(jours: number): string {
  if (jours < 1) return "moins d'un jour"
  if (jours === 1) return '1 jour'
  if (jours < 30) return `${String(jours)} jours`
  const moisTotal = Math.round(jours / 30.44)
  if (moisTotal < 12) return `${String(moisTotal)} mois`
  const ans = Math.floor(jours / 365.25)
  const moisRestants = Math.round((jours - ans * 365.25) / 30.44)
  const anLabel = `${String(ans)} an${ans > 1 ? 's' : ''}`
  return moisRestants > 0
    ? `${anLabel} et ${String(moisRestants)} mois`
    : anLabel
}

/** Rang d'un cycle (« 1er », « 2e », « 5e »). */
function ordinal(n: number): string {
  return n === 1 ? '1er' : `${String(n)}e`
}

/**
 * Complément de phrase du cas tacite cyclique (fenêtre ouverte / à venir / préavis).
 * `delai_preavis_jours` est NOT NULL en base (défaut 30) → toujours renseigné, donc
 * le segment « préavis » est systématique (contrairement au doc #16, écrit pour un
 * modèle où il pouvait manquer).
 */
function complementTacite(
  c: DonneesContrat,
  aujourdhui: string,
  finCycle: string | null,
): string {
  const fenetre = c.fenetre_resiliation_jours
  if (fenetre != null && finCycle) {
    const debutFenetre = ajouterJoursIso(finCycle, -(fenetre - 1))
    if (debutFenetre) {
      // (1) Fenêtre actuellement ouverte.
      if (aujourdhui >= debutFenetre && aujourdhui <= finCycle) {
        return `La fenêtre de résiliation est actuellement ouverte, du ${fmtLong(debutFenetre)} au ${fmtLong(finCycle)}. C'est le moment de notifier si vous souhaitez résilier.`
      }
      // (2) Fenêtre à venir.
      if (aujourdhui < debutFenetre) {
        return `Pour résilier, il faudra attendre la fenêtre du ${fmtLong(debutFenetre)} au ${fmtLong(finCycle)}, avec un préavis de ${String(c.delai_preavis_jours)} jours.`
      }
    }
  }
  // (3) Pas de fenêtre (ou déjà passée pour ce cycle) : résiliation avec préavis.
  return `Vous pouvez le résilier à tout moment en respectant un préavis de ${String(c.delai_preavis_jours)} jours.`
}

/** Texte du cas actif « tacite reconduction » (souple ou cyclique). */
function texteTacite(
  c: DonneesContrat,
  aujourdhui: string,
  dureeEcoulee: string,
): string {
  const cycle = c.duree_cycle_mois
  // 8.A — tacite souple (pas de cycle défini).
  if (!cycle || cycle <= 0) {
    return `Ce contrat fonctionne par tacite reconduction et est actif depuis ${dureeEcoulee}. Pour résilier, un préavis de ${String(c.delai_preavis_jours)} jours est nécessaire.`
  }
  // 8.B — tacite par cycles.
  const joursEcoules = joursEntre(aujourdhui, c.date_debut)
  const cycleActuel = Math.floor(joursEcoules / (cycle * 30.44)) + 1
  const finCycleBrut = ajouterMoisIso(c.date_debut, cycleActuel * cycle)
  const finCycle = finCycleBrut ? ajouterJoursIso(finCycleBrut, -1) : null
  const debut = `Ce contrat se renouvelle automatiquement tous les ${String(cycle)} mois. Il est actif depuis ${dureeEcoulee} et entre dans son ${ordinal(cycleActuel)} cycle.`
  return `${debut} ${complementTacite(c, aujourdhui, finCycle)}`
}

/**
 * Phrase explicative complète du statut d'un contrat (doc #16). Cascade :
 * Archivé → Résilié → Signé (à venir) → Préavis → Terminé → Actif (déterminé /
 * indéterminé / tacite). Fonction pure ; la carte se contente de l'afficher.
 */
export function texteContrat(
  c: DonneesContrat,
  aujourdhui: string = todayLocal(),
): string {
  // 1 — Archivé.
  if (c.est_archive) return "Ce contrat est archivé et n'est plus actif."

  // 2 — Résilié (date de résiliation renseignée).
  if (c.date_resiliation) {
    const duree = formatDuree(joursEntre(c.date_resiliation, c.date_debut))
    return `Ce contrat a été résilié le ${fmtLong(c.date_resiliation)}, après ${duree} d'activité.`
  }

  // 3 — Signé / en attente (le début est dans le futur).
  if (c.date_debut > aujourdhui) {
    const phrase = c.date_signature
      ? `Ce contrat a été signé le ${fmtLong(c.date_signature)}.`
      : "Ce contrat est en attente d'activation."
    const duree = formatDuree(joursEntre(c.date_debut, aujourdhui))
    return `${phrase} Il entrera en vigueur le ${fmtLong(c.date_debut)}, soit dans ${duree}.`
  }

  // 4 — Préavis (notification envoyée, résiliation pas encore actée).
  if (c.date_notification) {
    const cessation = ajouterJoursIso(
      c.date_notification,
      c.delai_preavis_jours,
    )
    return `Une notification de résiliation a été envoyée le ${fmtLong(c.date_notification)}. La cessation est prévue le ${fmtLong(cessation)}, au terme du délai de préavis de ${String(c.delai_preavis_jours)} jours.`
  }

  // 5 — Terminé (échéance dépassée).
  if (c.date_fin && c.date_fin < aujourdhui) {
    const duree = formatDuree(joursEntre(c.date_fin, c.date_debut))
    return `Ce contrat est arrivé à échéance le ${fmtLong(c.date_fin)}, après ${duree} d'activité. Il peut être renouvelé ou archivé.`
  }

  // 6/7/8 — Actif.
  const dureeEcoulee = formatDuree(joursEntre(aujourdhui, c.date_debut))

  // 8 — Tacite reconduction.
  if (c.type_contrat_id === TYPE_CONTRAT.tacite) {
    return texteTacite(c, aujourdhui, dureeEcoulee)
  }

  // 6 — Durée déterminée (avec date de fin).
  if (c.type_contrat_id === TYPE_CONTRAT.determine && c.date_fin) {
    const joursRestants = joursEntre(c.date_fin, aujourdhui)
    const dureeRestante = formatDuree(joursRestants)
    let phraseFin: string
    if (joursRestants <= 30) {
      phraseFin =
        "L'échéance est imminente et il n'y a pas de reconduction automatique."
    } else if (joursRestants <= 90) {
      phraseFin =
        'Sans reconduction automatique, pensez à anticiper le renouvellement.'
    } else {
      phraseFin =
        "Aucune reconduction automatique n'est prévue, il faudra renouveler manuellement si nécessaire."
    }
    return `Ce contrat à durée déterminée est actif depuis ${dureeEcoulee}. L'échéance est fixée au ${fmtLong(c.date_fin)}, soit dans ${dureeRestante}. ${phraseFin}`
  }

  // 7 — Durée indéterminée (ou déterminé sans date de fin).
  return `Ce contrat à durée indéterminée est actif depuis ${dureeEcoulee}. Il peut être résilié à tout moment en respectant un préavis de ${String(c.delai_preavis_jours)} jours.`
}
