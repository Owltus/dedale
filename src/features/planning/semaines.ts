/**
 * Utilitaires de semaines ISO 8601 (lundi → dimanche) pour la grille du planning.
 * Tout en heure locale : `date_prevue` est une date nue (`YYYY-MM-DD`), on
 * raisonne en jours, sans fuseau.
 */

export interface SemaineIso {
  /** Numéro de semaine ISO (1–53). */
  numero: number
  /** Année ISO (peut différer de l'année calendaire en bord d'année). */
  annee: number
  /** Lundi de la semaine (00:00 local). */
  debut: Date
  /** `YYYY-MM-DD` du lundi (borne basse de la fenêtre). */
  debutIso: string
  /** Clé stable « annee-numero » pour les colonnes. */
  cle: string
}

/** Clé « annee-numero » à partir des deux nombres ISO. */
function formatCle(annee: number, numero: number): string {
  return `${String(annee)}-${String(numero)}`
}

const JOUR_MS = 24 * 60 * 60 * 1000

/** Minuit local d'une date donnée (copie sans muter l'entrée). */
function minuit(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Lundi (00:00 local) de la semaine ISO contenant `date`. */
export function lundiDeLaSemaine(date: Date): Date {
  const d = minuit(date)
  // getDay() : 0 = dimanche … 6 = samedi → décalage vers lundi.
  const jour = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - jour)
  return d
}

/** Numéro + année ISO 8601 d'une date. */
export function numeroSemaineIso(date: Date): {
  numero: number
  annee: number
} {
  // Algorithme ISO : jeudi de la semaine courante détermine l'année.
  const jeudi = lundiDeLaSemaine(date)
  jeudi.setDate(jeudi.getDate() + 3)
  const annee = jeudi.getFullYear()
  const premierJanvier = new Date(annee, 0, 1)
  const numero =
    Math.round((jeudi.getTime() - premierJanvier.getTime()) / JOUR_MS / 7) + 1
  return { numero, annee }
}

/** `YYYY-MM-DD` en heure locale (sans décalage de fuseau). */
export function isoLocale(date: Date): string {
  const a = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const j = String(date.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/** Clé « annee-numero » d'une date prévue, pour ranger l'OT dans sa colonne. */
export function cleSemaine(date: Date): string {
  const { numero, annee } = numeroSemaineIso(date)
  return formatCle(annee, numero)
}

/**
 * Fenêtre de `nbSemaines` semaines ISO consécutives à partir de la semaine
 * contenant `depart` (incluse).
 */
export function fenetreSemaines(
  depart: Date,
  nbSemaines: number,
): SemaineIso[] {
  const lundi = lundiDeLaSemaine(depart)
  const semaines: SemaineIso[] = []
  for (let i = 0; i < nbSemaines; i++) {
    const debut = new Date(lundi.getTime() + i * 7 * JOUR_MS)
    const { numero, annee } = numeroSemaineIso(debut)
    semaines.push({
      numero,
      annee,
      debut,
      debutIso: isoLocale(debut),
      cle: formatCle(annee, numero),
    })
  }
  return semaines
}

/** Décale une date de `n` semaines (n peut être négatif). Ne mute pas l'entrée. */
export function ajouterSemaines(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 7 * JOUR_MS)
}

/**
 * Libellé compact de la période visible : « 2025 · S10–S22 » (ou
 * « 2025 · S50 → 2026 · S03 » à cheval sur deux années ISO).
 */
export function formatPeriode(semaines: SemaineIso[]): string {
  const premiere = semaines[0]
  const derniere = semaines[semaines.length - 1]
  if (!premiere || !derniere) return ''
  if (premiere.annee === derniere.annee) {
    return `${String(premiere.annee)} · S${String(premiere.numero)}–S${String(derniere.numero)}`
  }
  return `${String(premiere.annee)} · S${String(premiere.numero)} → ${String(derniere.annee)} · S${String(derniere.numero)}`
}

/**
 * Clés de semaine (« annee-numero ») des `nbSemaines` semaines à partir de
 * `depart` — pour tester l'appartenance d'un OT à une plage (ex. « Focus 12
 * semaines » : familles ayant au moins un OT dans les 12 prochaines semaines).
 */
export function clesProchaines(depart: Date, nbSemaines: number): Set<string> {
  return new Set(fenetreSemaines(depart, nbSemaines).map((s) => s.cle))
}
