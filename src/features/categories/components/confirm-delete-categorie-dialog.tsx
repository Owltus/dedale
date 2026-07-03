import { toast } from 'sonner'
import { useDeleteCategorie } from '../mutations'
import { deleteErrorMessage } from '@/lib/form'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

interface ConfirmDeleteCategorieDialogProps {
  /**
   * Catégorie à supprimer (un simple `{ id, nom }` suffit — la projection de
   * drill comme la ligne complète conviennent). `null` → modale fermée.
   */
  categorie: { id: string; nom: string } | null
  /**
   * Fermeture par TOUTE voie (annulation, clic hors, succès de suppression) :
   * l'hôte y remet son état de sélection à `null`.
   */
  onClose: () => void
  /**
   * Contenu de la catégorie, PRÉ-CALCULÉ par l'hôte depuis son cache (la base
   * reste l'arbitre réel via FK `RESTRICT`) :
   * - `sousCategories` : présence d'au moins une sous-catégorie ;
   * - `contenus` : présence d'au moins un élément feuille (gamme, modèle…) ;
   * - `labelContenu` : nom pluriel de ces feuilles pour le message de blocage
   *   (ex. « gammes », « modèles »).
   * Non vide (`sousCategories || contenus`) → suppression bloquée + message dédié.
   */
  enfants: {
    sousCategories: boolean
    contenus: boolean
    labelContenu: string
  }
}

/**
 * Confirmation de suppression d'une CATÉGORIE, factorisant le cluster dupliqué
 * dans les explorateurs (Plan de maintenance, Modèles d'équipements…) : porte la
 * mutation `useDeleteCategorie`, le toast de succès/erreur et le message de
 * blocage quand la catégorie n'est pas vide. La base bloque toujours la
 * suppression d'une catégorie non vide (sous-catégorie ou élément rattaché) ; on
 * l'anticipe ici pour désactiver le bouton et l'expliquer.
 */
export function ConfirmDeleteCategorieDialog({
  categorie,
  onClose,
  enfants,
}: ConfirmDeleteCategorieDialogProps) {
  const del = useDeleteCategorie()

  const bloque = enfants.sousCategories || enfants.contenus

  function confirmer() {
    if (!categorie) return
    del.mutate(categorie.id, {
      onSuccess: () => {
        toast.success('Catégorie supprimée')
        onClose()
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  return (
    <ConfirmDeleteDialog
      open={categorie !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      entityLabel={
        categorie ? `la catégorie « ${categorie.nom} »` : 'la catégorie'
      }
      blocked={bloque}
      blockedReason={`Cette catégorie contient des sous-catégories ou des ${enfants.labelContenu}. Vide-la d’abord pour pouvoir la supprimer.`}
      warning="Cette suppression est définitive."
      loading={del.isPending}
      onConfirm={confirmer}
    />
  )
}
