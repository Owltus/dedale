// Règles de mot de passe des Edge Functions `invite_user` et `set_user_password`.
//
// MIROIR EXACT de PASSWORD_REGLES (src/features/utilisateurs/schemas.ts). Les
// deux listes doivent rester alignées : le front guide la saisie, celle-ci
// décide. Voir le piège 3 en tête de `invite_user/index.ts`.

const PASSWORD_REGLES: ReadonlyArray<{ libelle: string; test: RegExp }> = [
  { libelle: 'une majuscule', test: /[A-ZÀ-Ý]/ },
  { libelle: 'une minuscule', test: /[a-zà-ÿ]/ },
  { libelle: 'un chiffre', test: /[0-9]/ },
  { libelle: 'un caractère spécial', test: /[^A-Za-zÀ-ÿ0-9]/ },
]

const PASSWORD_MIN = 12
// En OCTETS et non en caractères : bcrypt tronque au-delà de 72 octets, et un
// mot de passe d'emoji atteint la limite dès 18 caractères.
const PASSWORD_OCTETS_MAX = 72

/** Message d'erreur si le mot de passe est refusé, `null` s'il est accepté. */
export function erreurMotDePasse(v: string): string | null {
  if (v.length < PASSWORD_MIN) {
    return `Le mot de passe doit faire au moins ${String(PASSWORD_MIN)} caractères.`
  }
  if (new TextEncoder().encode(v).length > PASSWORD_OCTETS_MAX) {
    return `Mot de passe trop long (${String(PASSWORD_OCTETS_MAX)} octets au maximum).`
  }
  const manquantes = PASSWORD_REGLES.filter((r) => !r.test.test(v)).map(
    (r) => r.libelle,
  )
  if (manquantes.length > 0) {
    return `Le mot de passe doit contenir ${manquantes.join(', ')}.`
  }
  return null
}
