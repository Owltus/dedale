import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { NoSiteSelected } from '@/components/common/no-site-selected'

/**
 * Identité d'une page, déclarée UNE FOIS dans `features/<x>/page-meta.ts` et
 * consommée par la route liste, la route détail et la garde de site.
 *
 * Sans cette source unique, chaque page saisissait sa description deux fois
 * (garde + en-tête) : 5 pages sur 6 avaient laissé les deux textes diverger, si
 * bien que le sous-titre changeait selon qu'un site était sélectionné ou non.
 */
export interface PageMeta {
  /** Titre affiché en en-tête ET dans la garde de site. */
  titre: string
  /** Tagline sous le titre. La MÊME des deux côtés — c'est tout l'intérêt. */
  description: string
  /** Phrase de l'écran « Sélectionne un site » (« Choisis un site pour … »). */
  hint: string
  /** Icône de la page (composant lucide, pas un élément). */
  icone: LucideIcon
}

/** Contexte garanti aux enfants : le site est résolu, le rôle est chargé. */
export interface SiteScopedContext {
  /** Jamais null : la garde a déjà filtré (donc pas de hook conditionnel). */
  siteId: string
  /** Rôle brut, pour affiner une permission par écran (ex. DELETE admin seul). */
  role: Role
  /** Raccourci du cas courant : rôle métier (admin/manager/technicien). */
  canManage: boolean
}

/**
 * Garde de site d'une page métier : tant qu'aucun site n'est actif, l'écran
 * « Sélectionne un site » remplace la page.
 *
 * La garde s'exécute AVANT toute query — c'est la règle : une page qui
 * interrogerait la base sans site actif ferait un aller-retour inutile, et
 * masquerait le cloisonnement redondant `.eq('site_id', siteId)`.
 *
 * Le render-prop garantit `siteId` non-null aux enfants : c'est ce qui permet
 * de ne pas monter de hook conditionnellement, sans avoir à séparer à la main
 * un composant `Content` dans chaque route.
 *
 * N'impose PAS de `PageContainer` : les explorateurs à paliers ont besoin du
 * mode `fill`, les pages liste non. C'est l'enfant qui pose sa coquille.
 */
export function SiteScopedRoute({
  meta,
  children,
}: {
  meta: PageMeta
  children: (ctx: SiteScopedContext) => ReactNode
}) {
  const { data: role } = useCurrentRole()
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title={meta.titre}
        description={meta.description}
        hint={meta.hint}
        icon={meta.icone}
      />
    )
  }

  return (
    <>
      {children({
        siteId: activeSiteId,
        role,
        canManage: perm.canManageMetier(role),
      })}
    </>
  )
}
