import { Ban, CheckCircle2, ShieldOff } from 'lucide-react'
import { useAnonymizeUser, useToggleActif } from '../mutations'
import type { UserRow } from './utilisateur-types'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// --- Administration du compte (admin, hors soi-même) ---

export function AccountCard({ user }: { user: UserRow }) {
  const toggle = useToggleActif()
  const anonymize = useAnonymizeUser()
  const confirmAction = useConfirmAction()
  const isAnonymized = user.anonymized_at !== null

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <ShieldOff className="size-4" /> Administration du compte
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Actions sensibles. La désactivation coupe l’accès immédiatement ;
          l’anonymisation est irréversible.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              confirmAction.demander({
                title: user.est_actif
                  ? 'Désactiver ce compte ?'
                  : 'Réactiver ce compte ?',
                description: user.est_actif
                  ? `« ${user.nom_complet} » perdra immédiatement l’accès.`
                  : `« ${user.nom_complet} » pourra de nouveau se connecter.`,
                confirmLabel: user.est_actif ? 'Désactiver' : 'Réactiver',
                destructive: user.est_actif,
                run: () =>
                  toggle.mutateAsync({
                    id: user.id,
                    estActif: !user.est_actif,
                  }),
                successMessage: user.est_actif
                  ? 'Compte désactivé'
                  : 'Compte réactivé',
              })
            }
          >
            {user.est_actif ? (
              <>
                <Ban /> Désactiver
              </>
            ) : (
              <>
                <CheckCircle2 /> Réactiver
              </>
            )}
          </Button>
          {!isAnonymized && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                confirmAction.demander({
                  title: 'Anonymiser cet utilisateur ?',
                  description: `Les données personnelles de « ${user.nom_complet} » seront effacées (RGPD) et le compte désactivé. Irréversible.`,
                  confirmLabel: 'Anonymiser',
                  destructive: true,
                  run: () => anonymize.mutateAsync(user.id),
                  successMessage: 'Utilisateur anonymisé',
                })
              }
            >
              <ShieldOff /> Anonymiser
            </Button>
          )}
        </div>

        <ConfirmDialog {...confirmAction.dialogProps} />
      </CardContent>
    </Card>
  )
}
