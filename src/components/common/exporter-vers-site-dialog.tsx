import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { useSiteContext } from '@/lib/site-context'
import { exportErrorMessage } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/common/select-field'

/**
 * Bilan d'un export commun → site, renvoyé par `onConfirm` pour piloter le toast
 * de retour. La copie peut être totale (`succes`), partielle (`partiel` : boucle
 * d'une sous-catégorie où certaines gammes échouent) ou en échec (`echec`). Seul
 * `succes` ferme le dialog : `partiel` et `echec` le laissent OUVERT (la RPC de
 * copie n'est pas idempotente — fermer puis relancer recopierait toute la source).
 * Le dialog ne connaît pas la NATURE de ce qui est copié : il n'arbitre que le
 * choix du site et le retour utilisateur, l'action étant déléguée à l'appelant.
 */
export interface ExportOutcome {
  ton: 'succes' | 'partiel' | 'echec'
  message: string
}

interface ExporterVersSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre du dialog (ex. « Copier la gamme vers un site »). */
  titre: string
  /** Résumé INLINE de ce qui sera copié (rendu dans la description du dialog). */
  resume: ReactNode
  confirmLabel?: string
  /**
   * Réalise la copie vers le site choisi et renvoie le bilan. Peut lever : une
   * erreur (RLS 42501 sur un site hors périmètre…) est catchée → toast d'erreur,
   * le dialog reste ouvert pour réessayer ou changer de cible.
   */
  onConfirm: (siteCible: string) => Promise<ExportOutcome>
}

/**
 * Dialog réutilisable « bibliothèque commune → mon site » : choisit un site
 * cible parmi les sites ACCESSIBLES de l'utilisateur (`get_my_sites` via
 * `useSiteContext` — déjà sans le commun) puis délègue la copie à `onConfirm`.
 * Rappelle que la copie est indépendante (modifiable sans toucher l'original).
 */
export function ExporterVersSiteDialog({
  open,
  onOpenChange,
  titre,
  resume,
  confirmLabel = 'Copier',
  onConfirm,
}: ExporterVersSiteDialogProps) {
  const { sites, activeSiteId } = useSiteContext()
  // Cible par défaut : le site actif s'il est accessible, sinon le premier. Le
  // composant est monté avec une `key` discriminante par source → cet état se
  // réinitialise à chaque nouvelle source ouverte.
  const [siteCible, setSiteCible] = useState<string>(
    () => activeSiteId ?? sites[0]?.id ?? '',
  )
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    if (!siteCible || pending) return
    setPending(true)
    try {
      const outcome = await onConfirm(siteCible)
      if (outcome.ton === 'succes') {
        toast.success(outcome.message)
        onOpenChange(false)
      } else if (outcome.ton === 'partiel') {
        // Bilan partiel : on garde le dialog OUVERT. La RPC de copie n'est pas
        // idempotente → fermer puis relancer recopierait TOUTE la source (doublons
        // silencieux). On laisse l'utilisateur décider en connaissance de cause.
        toast.warning(outcome.message)
      } else {
        // Échec total : on garde le dialog ouvert (réessai / autre cible).
        toast.error(outcome.message)
      }
    } catch (e) {
      toast.error(exportErrorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const siteName = sites.find((s) => s.id === siteCible)?.nom ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{resume}</DialogDescription>
        </DialogHeader>

        {sites.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun site accessible : la copie n’est pas possible.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <SelectField
              label="Site de destination"
              required
              value={siteCible}
              onChange={setSiteCible}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </SelectField>
            <p className="text-muted-foreground text-sm">
              La copie est <strong>indépendante</strong> : tu pourras la modifier
              {siteName ? ` sur « ${siteName} »` : ' sur le site'} sans toucher à
              l’original commun.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={pending || sites.length === 0 || !siteCible}
          >
            {pending ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
