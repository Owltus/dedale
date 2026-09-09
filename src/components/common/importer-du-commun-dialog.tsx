import { useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ChecklistDialog } from '@/components/common/checklist-dialog'
import { writeErrorMessage } from '@/lib/form'

/** Un élément du catalogue commun, candidat à l'installation sur un site. */
export interface ElementCommun {
  id: string
  nom: string
  description?: string | null
  /** Détail discret affiché à droite (ex. « 4 caractéristiques »). */
  badge?: ReactNode
}

interface ImporterDuCommunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre de la modale (ex. « Importer des modèles d'équipements »). */
  titre: string
  /** Nom du site d'accueil, affiché pour lever toute ambiguïté. */
  siteNom: string | null
  /** Éléments COMMUNS proposés (l'appelant a déjà retiré ceux déjà installés). */
  elements: ElementCommun[]
  /** Nombre d'éléments écartés parce que déjà installés sur le site. */
  nbDejaInstalles?: number
  /** Installe UN élément sur le site (RPC de copie, ou insert d'une copie). */
  importer: (id: string) => Promise<unknown>
  /** Mot désignant un élément, au singulier (« modèle », « gamme »). */
  motSingulier: string
  /** Le même au pluriel (« modèles », « gammes »). */
  motPluriel: string
  loading?: boolean
  error?: ReactNode
}

/**
 * « Importer depuis le commun » : le geste par lequel un SITE se sert dans le
 * catalogue de l'entreprise. On coche un ou plusieurs éléments communs, chacun
 * est COPIÉ sur le site — la copie est indépendante, le site en fait ensuite ce
 * qu'il veut sans que le siège s'en mêle, et le commun n'est jamais modifié.
 *
 * C'est le pendant assumé de la cloison appliquée partout ailleurs : hors de la
 * Bibliothèque, un écran de site ne propose QUE ce qui est déjà chez lui (cf.
 * les modèles de DI d'une demande, les gabarits d'une sous-catégorie d'équipements).
 * Sans ce geste, la cloison serait un mur ; avec lui, le catalogue du siège
 * reste une réserve où l'on pioche.
 *
 * Ne fait QUE l'orchestration (sélection, appels, comptes-rendus) : la copie
 * elle-même appartient à la feature (RPC dédiée le plus souvent).
 */
export function ImporterDuCommunDialog({
  open,
  onOpenChange,
  titre,
  siteNom,
  elements,
  nbDejaInstalles = 0,
  importer,
  motSingulier,
  motPluriel,
  loading,
  error,
}: ImporterDuCommunDialogProps) {
  const items = useMemo(
    () =>
      elements.map((e) => ({
        id: e.id,
        titre: e.nom,
        sousTitre: e.description ?? undefined,
        badge: e.badge,
      })),
    [elements],
  )

  const description = (
    <>
      Coche ce que tu veux installer{siteNom ? ` sur « ${siteNom} »` : ''}. Une
      copie indépendante est déposée sur le site : tu peux la modifier ensuite
      sans toucher au catalogue commun.
      {nbDejaInstalles > 0 &&
        ` ${String(nbDejaInstalles)} ${nbDejaInstalles > 1 ? `${motPluriel} déjà installés` : `${motSingulier} déjà installé`} ne ${nbDejaInstalles > 1 ? 'sont' : 'est'} pas listé${nbDejaInstalles > 1 ? 's' : ''}.`}
    </>
  )

  async function handleSubmit(ids: string[]) {
    // Un échec isolé (RLS, doublon de nom…) ne doit pas annuler les autres :
    // on installe tout ce qui peut l'être et on rend compte précisément.
    const resultats = await Promise.allSettled(ids.map((id) => importer(id)))
    const echecs = resultats.filter((r) => r.status === 'rejected')
    const reussis = ids.length - echecs.length
    if (echecs.length === 0) {
      toast.success(
        `${String(reussis)} ${reussis > 1 ? motPluriel : motSingulier} installé${reussis > 1 ? 's' : ''} sur le site`,
      )
      onOpenChange(false)
      return
    }
    const premiere = echecs[0]
    const detail =
      premiere?.status === 'rejected' ? writeErrorMessage(premiere.reason) : ''
    toast.error(
      `${String(reussis)} installé(s), ${String(echecs.length)} échec(s) — ${detail}`,
    )
  }

  return (
    <ChecklistDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titre}
      description={description}
      searchPlaceholder={`Rechercher un ${motSingulier}…`}
      items={items}
      submitLabel={(count) =>
        `Installer${count > 0 ? ` (${String(count)})` : ''}`
      }
      pendingLabel="Installation…"
      requireSelection
      loading={loading}
      error={error}
      empty={
        nbDejaInstalles > 0
          ? `Tout le catalogue commun est déjà installé sur ce site.`
          : `Aucun ${motSingulier} dans le catalogue commun pour le moment.`
      }
      noResults={`Aucun ${motSingulier} ne correspond à ta recherche.`}
      onSubmit={handleSubmit}
    />
  )
}
