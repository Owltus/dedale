import { formatChampValeur, parseChamps } from '@/lib/champs'

/**
 * Libellé de TYPE d'un équipement : plus de nom individuel (105) — son
 * identité de base EST sa sous-catégorie (ex. « Extincteur »), partagée par
 * tous les équipements du même type.
 */
export function typeAffiche(e: { categorie_nom?: string | null }): string {
  return e.categorie_nom?.trim() ?? 'Équipement'
}

/** Valeur d'une caractéristique désignée par sa clé (Champ.cle), ou `null`
 * si aucune clé n'est désignée ou que le champ n'est pas renseigné. */
function champValeur(
  e: { specifications?: unknown },
  cle: string | null | undefined,
): string | null {
  if (!cle) return null
  const champ = parseChamps(e.specifications).find((c) => c.cle === cle)
  if (!champ) return null
  const texte = formatChampValeur(champ, champ.valeur ?? null)
  return texte !== '—' ? texte : null
}

/**
 * Valeur PRINCIPALE désignée par la sous-catégorie (109,
 * `categorie_valeur_principale`) : à COLLER après `typeAffiche` (ex.
 * « Extincteur N°1 », via `titreAffiche`) — jamais utilisée seule.
 */
export function principalAffiche(e: {
  categorie_valeur_principale?: string | null
  specifications?: unknown
}): string | null {
  return champValeur(e, e.categorie_valeur_principale)
}

/**
 * Valeur SECONDAIRE désignée par la sous-catégorie (109,
 * `categorie_valeur_secondaire`) : caractéristique complémentaire affichée
 * en badge à côté du nom (ex. « CO2 »). `null` = pas de badge.
 */
export function secondaireAffiche(e: {
  categorie_valeur_secondaire?: string | null
  specifications?: unknown
}): string | null {
  return champValeur(e, e.categorie_valeur_secondaire)
}

/**
 * Valeur TERTIAIRE désignée par la sous-catégorie (109,
 * `categorie_valeur_tertiaire`) : troisième caractéristique, affichée en
 * second badge sous celui de `secondaireAffiche`. `null` = pas de badge.
 */
export function tertiaireAffiche(e: {
  categorie_valeur_tertiaire?: string | null
  specifications?: unknown
}): string | null {
  return champValeur(e, e.categorie_valeur_tertiaire)
}

/**
 * Titre affiché d'un équipement : type + valeur principale collés (ex.
 * « Extincteur N°1 »). Repli sur le type seul si aucune valeur principale
 * n'est désignée ou renseignée.
 */
export function titreAffiche(
  e: Parameters<typeof typeAffiche>[0] & Parameters<typeof principalAffiche>[0],
): string {
  const principal = principalAffiche(e)
  return principal ? `${typeAffiche(e)} ${principal}` : typeAffiche(e)
}

/**
 * Combinaison `titreAffiche` + valeurs secondaire/tertiaire en UN texte,
 * pour les surfaces sans emplacement pour des badges visuels séparés (menu
 * déroulant, liste jointe par virgules, libellé de confirmation de
 * suppression…).
 */
export function nomAfficheTexte(
  e: Parameters<typeof titreAffiche>[0] &
    Parameters<typeof secondaireAffiche>[0] &
    Parameters<typeof tertiaireAffiche>[0],
): string {
  return [titreAffiche(e), secondaireAffiche(e), tertiaireAffiche(e)]
    .filter(Boolean)
    .join(' · ')
}
