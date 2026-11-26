import { z } from 'zod'
import { champSchema } from '@/lib/champs'
import { texteObligatoire } from '@/lib/texte-zod'

export const modeleEquipementSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  /** Catégorie de rattachement, OBLIGATOIRE : tout modèle est rangé sous une catégorie. */
  categorie_id: z.string().min(1, 'La catégorie est obligatoire'),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.string().nullable(),
  /** Champs typés (définitions) ; nettoyés/validés finement à la soumission. */
  specifications: z.array(champSchema),
})

export type ModeleEquipementFormValues = z.infer<typeof modeleEquipementSchema>

export const emptyModeleEquipement: ModeleEquipementFormValues = {
  nom: '',
  description: '',
  categorie_id: '',
  portee: 'entreprise',
  etat: 'actif',
  miniature_id: null,
  specifications: [],
}

/** Nom d'une flotte : obligatoire, lisible, 120 caractères au plus (RPC 188). */
const nomFlotteSchema = texteObligatoire(
  'Le nom de la flotte est obligatoire',
).max(120, 'Nom de la flotte : 120 caractères au plus.')

/**
 * « Installer et déployer » depuis la Bibliothèque : soit on CRÉE une flotte
 * (sous-catégorie de parc) rangée sous une catégorie de parc racine du site,
 * soit on reprend une flotte EXISTANTE du site. Les champs inutiles au mode
 * choisi restent ignorés ; `''` = absence (convention des selects).
 */
export const installerDeployerSchema = z
  .object({
    mode: z.enum(['creer', 'existante']),
    /** Catégorie de parc racine du site (mode « creer »). */
    parentId: z.string(),
    nomFlotte: z.string(),
    /** Clé (Champ.cle) collée au nom dans les listes ; '' = aucune. */
    valeurPrincipale: z.string(),
    /** Flotte reprise (mode « existante »). */
    flotteId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'existante') {
      if (!v.flotteId)
        ctx.addIssue({
          code: 'custom',
          path: ['flotteId'],
          message: 'Choisis la flotte à déployer.',
        })
      return
    }
    if (!v.parentId)
      ctx.addIssue({
        code: 'custom',
        path: ['parentId'],
        message: 'Choisis la catégorie de parc où ranger la flotte.',
      })
    const nom = nomFlotteSchema.safeParse(v.nomFlotte)
    if (!nom.success)
      ctx.addIssue({
        code: 'custom',
        path: ['nomFlotte'],
        message: nom.error.issues[0]?.message ?? 'Nom de la flotte invalide.',
      })
  })

export type InstallerDeployerValues = z.infer<typeof installerDeployerSchema>
