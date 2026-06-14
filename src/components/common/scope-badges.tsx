import { Badge } from '@/components/ui/badge'

interface ScopeBadgesProps {
  /** `site_id` de la ligne : `null` = Commun (entreprise), sinon un site. */
  siteId: string | null
  /**
   * Nom du site quand `siteId !== null`. Optionnel : à défaut, on affiche le mot
   * générique « Site » (les listes de catégories n'en résolvent pas le nom).
   */
  siteName?: string | null
  /** Élément masqué (`est_actif === false`) → badge « Masqué ». */
  masque?: boolean
}

/**
 * Badges de PORTÉE d'une ligne de catalogue : « Commun » (entreprise) ou le nom du
 * site, plus un éventuel « Masqué ». Source UNIQUE de cette présentation, partagée
 * par tous les panneaux de la Bibliothèque — affichée à la fois dans la colonne
 * `badges` de `ListRow` (desktop) et dans son repli `mobileMeta` (sous `sm`), pour
 * que l'information de portée — discriminante dans ce catalogue — ne disparaisse
 * jamais sur petit écran. Voir `ListRow` (prop `mobileMeta`).
 */
export function ScopeBadges({ siteId, siteName, masque }: ScopeBadgesProps) {
  return (
    <>
      {siteId === null ? (
        <Badge variant="secondary">Commun</Badge>
      ) : (
        <Badge variant="outline">{siteName ?? 'Site'}</Badge>
      )}
      {masque && <Badge variant="outline">Masqué</Badge>}
    </>
  )
}
