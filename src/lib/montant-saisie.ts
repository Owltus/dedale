/**
 * Saisie d'un MONTANT (demande PO du 11/11/2026) : seuls les chiffres et UN
 * séparateur décimal (virgule ou point) passent, avec au plus deux décimales.
 * Tout le reste (lettres, symbole €, espaces d'un montant collé « 1 222,00 € »)
 * est retiré à la frappe — le champ ne peut contenir qu'une valeur monétaire.
 *
 * Le signe moins est refusé : aucun montant de l'application n'est négatif
 * (CHECK `>= 0` en base).
 */
export function nettoyerMontant(saisie: string): string {
  const brut = saisie.replace(/[^0-9.,]/g, '')
  const i = brut.search(/[.,]/)
  if (i < 0) return brut
  const entier = brut.slice(0, i)
  const decimales = brut
    .slice(i + 1)
    .replace(/[.,]/g, '')
    .slice(0, 2)
  return `${entier}${brut.charAt(i)}${decimales}`
}
