import { z } from 'zod'
import {
  ROLE_CODES,
  ROLE_LABELS,
  roleLabel,
  type RoleCode,
} from '@/lib/permissions'

// Codes et libellés de rôle : source unique dans lib/permissions (sens de
// dépendance correct, features → lib). Réexportés ici par commodité pour les
// consommateurs du domaine utilisateurs.
export { ROLE_CODES, ROLE_LABELS, roleLabel }
export type { RoleCode }

/**
 * Cascade de création (alignée avec le trigger handle_new_auth_user) :
 * qui peut créer quels rôles. La source de vérité reste la base ; cette table
 * sert à filtrer le dropdown côté UI.
 * NB : `manager` coïncide avec `SUBORDINATE_ROLES` de lib/permissions (édition) —
 * règles backend distinctes, à garder cohérentes si l'une évolue.
 */
export const CASCADE: Record<RoleCode, readonly RoleCode[]> = {
  admin: ['admin', 'manager', 'technicien', 'lecteur', 'demandeur'],
  manager: ['technicien', 'lecteur', 'demandeur'],
  technicien: ['lecteur', 'demandeur'],
  lecteur: [],
  demandeur: [],
}

// ─── Mots de passe ───────────────────────────────────────────────────────────

/** Une règle de mot de passe : son libellé affiché et son test. */
export interface RegleMotDePasse {
  libelle: string
  test: (v: string) => boolean
}

/**
 * Règles de mot de passe — SOURCE UNIQUE, affichée ET appliquée.
 *
 * La consigne montrée à l'écran et la validation sortent de cette même liste :
 * une consigne qui promet autre chose que ce que le formulaire accepte est pire
 * que pas de consigne du tout.
 *
 * Douze caractères et quatre classes, là où le projet n'avait jusqu'ici qu'un
 * `length < 8` impératif dans l'écran d'activation de compte.
 *
 * **Ces règles font autorité côté serveur, pas seulement ici** : l'API
 * d'administration Supabase n'applique PAS la politique de mot de passe du
 * projet à la création d'un compte (son contrôle de robustesse n'est appelé qu'à
 * la modification). Sans validation de notre côté, un compte au mot de passe
 * « a » serait accepté. L'Edge Function rejoue donc la même liste.
 */
export const PASSWORD_REGLES: readonly RegleMotDePasse[] = [
  { libelle: '12 caractères au minimum', test: (v) => v.length >= 12 },
  { libelle: 'une majuscule', test: (v) => /[A-ZÀ-Ý]/.test(v) },
  { libelle: 'une minuscule', test: (v) => /[a-zà-ÿ]/.test(v) },
  { libelle: 'un chiffre', test: (v) => /[0-9]/.test(v) },
  { libelle: 'un caractère spécial', test: (v) => /[^A-Za-zÀ-ÿ0-9]/.test(v) },
]

/**
 * Longueur maximale, en OCTETS et non en caractères : bcrypt (que GoTrue utilise
 * pour hacher) tronque au-delà de 72 octets. Un mot de passe d'accents ou
 * d'emoji atteint donc la limite bien avant 72 caractères — d'où la mesure sur
 * l'encodage UTF-8 plutôt que sur `.length`.
 */
const PASSWORD_OCTETS_MAX = 72

/** Longueur du mot de passe en octets UTF-8 (et non en points de code). */
export function octetsDe(v: string): number {
  return new TextEncoder().encode(v).length
}

export const passwordSchema = z
  .string()
  .refine(
    (v) => octetsDe(v) <= PASSWORD_OCTETS_MAX,
    `Mot de passe trop long (${String(PASSWORD_OCTETS_MAX)} octets au maximum).`,
  )
  .refine(
    (v) => PASSWORD_REGLES.every((r) => r.test(v)),
    'Le mot de passe ne respecte pas toutes les règles.',
  )

/**
 * Couple saisie + confirmation, à composer dans les formulaires qui posent un
 * mot de passe. Le `path` est INDISPENSABLE : sans lui, l'erreur se pose à la
 * racine de l'objet et aucun `FormMessage` ne l'affiche — le formulaire refuse
 * alors de se soumettre sans rien dire.
 */
export const passwordAvecConfirmation = z
  .object({
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .check((ctx) => {
    if (ctx.value.password !== ctx.value.password_confirm) {
      ctx.issues.push({
        code: 'custom',
        message: 'Les deux mots de passe ne correspondent pas.',
        path: ['password_confirm'],
        input: ctx.value.password_confirm,
      })
    }
  })

export type PasswordAvecConfirmationValues = z.infer<
  typeof passwordAvecConfirmation
>

/**
 * Création d'un compte : identité, accès, et mot de passe posé par la personne
 * qui crée. Il n'y a plus d'invitation par e-mail — cf. ADR 0007.
 *
 * `.check()` plutôt que `.refine()` : le schéma reste un `ZodObject`, donc
 * `zodResolver` continue de savoir à quel champ rattacher chaque erreur, et le
 * formulaire garde ses valeurs par défaut typées.
 */
export const creerCompteSchema = z
  .object({
    // `.trim()` AVANT `.email()` : Zod 4 exécute les contrôles dans l'ordre de
    // déclaration. Placé après, le détourage n'agissait jamais — une adresse
    // collée depuis un tableur, avec son espace de fin, était rejetée comme
    // « invalide », ce qui accusait l'adresse au lieu de la nettoyer.
    email: z
      .string()
      .trim()
      .min(1, 'L’adresse e-mail est obligatoire')
      .max(255)
      .pipe(z.email('Adresse e-mail invalide')),
    nom_complet: z
      .string()
      .trim()
      .min(1, 'Le nom complet est obligatoire')
      .max(200),
    role: z.enum(ROLE_CODES, { message: 'Choisis un rôle' }),
    site_ids: z.array(z.uuid()),
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .check((ctx) => {
    if (ctx.value.password !== ctx.value.password_confirm) {
      ctx.issues.push({
        code: 'custom',
        message: 'Les deux mots de passe ne correspondent pas.',
        // Sans ce chemin, l'erreur se pose à la racine : le formulaire refuse de
        // se soumettre sans qu'aucun message n'apparaisse à l'écran.
        path: ['password_confirm'],
        input: ctx.value.password_confirm,
      })
    }
  })

export type CreerCompteFormValues = z.infer<typeof creerCompteSchema>

export const emptyCreerCompte: CreerCompteFormValues = {
  email: '',
  nom_complet: '',
  role: 'technicien',
  site_ids: [],
  password: '',
  password_confirm: '',
}

// Format téléphone aligné sur la contrainte CHECK de public.users
// (E.164 international + formats nationaux avec espaces/tirets/points).
const TELEPHONE_RE = /^\+?[0-9][0-9 .-]{4,19}$/

export const profileSchema = z.object({
  nom_complet: z
    .string()
    .trim()
    .min(1, 'Le nom complet est obligatoire')
    .max(200),
  telephone: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(TELEPHONE_RE, 'Téléphone invalide (ex. +33 6 12 34 56 78)'),
  ]),
})

export type ProfileFormValues = z.infer<typeof profileSchema>
