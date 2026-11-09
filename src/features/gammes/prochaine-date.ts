import { ajouterJours, lundiDeLaSemaine, semaineIso } from '@/lib/date'

/** Lundi (minuit local) de la semaine ISO `semaine` de l'année ISO `annee`. */
function lundiSemaineIso(annee: number, semaine: number): Date {
  // La semaine 1 contient toujours le 4 janvier.
  return ajouterJours(
    lundiDeLaSemaine(new Date(annee, 0, 4)),
    (semaine - 1) * 7,
  )
}

/**
 * Miroir front de `public.prochaine_date_ot` (migration 123) : lundi de la
 * prochaine intervention à partir d'une date de base et d'une périodicité en
 * jours, SANS dérive d'un cycle à l'autre :
 *   - N ans (multiple de 365 j) → même semaine ISO, N ans plus tard ;
 *   - N mois (multiple de 30 j) → même rang de semaine dans le mois ;
 *   - sinon → lundi de la semaine de `base + N jours`.
 * `null` pour une périodicité nulle (gamme ponctuelle).
 *
 * Sert UNIQUEMENT à l'affichage des passages ESTIMÉS (frise des obligations) :
 * la base reste seule à créer les OT. Toute divergence est un bug de ce miroir
 * — cf. le test qui le confronte à des résultats relevés en production.
 */
export function prochaineDateOt(base: Date, jours: number): Date | null {
  if (!Number.isFinite(jours) || jours <= 0) return null
  const lundi = lundiDeLaSemaine(base)
  const jeudi = ajouterJours(lundi, 3)

  if (jours % 365 === 0) {
    const n = jours / 365
    const { numero, annee } = semaineIso(jeudi)
    const anneeCible = annee + n
    // Le 28 décembre est toujours dans la dernière semaine ISO de son année.
    const derniere = semaineIso(new Date(anneeCible, 11, 28)).numero
    return lundiSemaineIso(anneeCible, Math.min(numero, derniere))
  }

  if (jours % 30 === 0) {
    const n = jours / 30
    const rang = Math.floor((jeudi.getDate() - 1) / 7) + 1
    const mois = new Date(jeudi.getFullYear(), jeudi.getMonth() + n, 1)
    // isodow : lundi = 1 … dimanche = 7.
    const isodow = ((mois.getDay() + 6) % 7) + 1
    let jeudiCible = ajouterJours(mois, ((4 - isodow + 7) % 7) + (rang - 1) * 7)
    if (jeudiCible.getMonth() !== mois.getMonth())
      jeudiCible = ajouterJours(jeudiCible, -7)
    return ajouterJours(jeudiCible, -3)
  }

  return lundiDeLaSemaine(ajouterJours(lundi, jours))
}
