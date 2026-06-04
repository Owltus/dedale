import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, ShieldOff, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import {
  useAnonymizeUser,
  useToggleActif,
} from '@/features/utilisateurs/mutations'
import { InviteUserDialog } from '@/features/utilisateurs/components/invite-user-dialog'
import { ROLE_LABELS } from '@/features/utilisateurs/schemas'
import type { RoleCode } from '@/features/utilisateurs/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { errorMessage } from '@/lib/form'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/utilisateurs')({
  component: UtilisateursPage,
})

interface UserRow {
  id: string
  nom_complet: string
  est_actif: boolean
  anonymized_at: string | null
  role_id: number
  roles: { code: string; description: string | null } | null
}

function roleLabel(code: string | undefined): string {
  if (code && code in ROLE_LABELS) return ROLE_LABELS[code as RoleCode]
  return code ?? '—'
}

function UtilisateursPage() {
  const { data: role, isPending: rolePending } = useCurrentRole()
  const { session } = useAuth()
  const myId = session?.user.id ?? null
  const canManage = role === 'admin' || role === 'manager'
  const isAdmin = role === 'admin'

  const {
    data: users = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ ...utilisateursQueries.list(), enabled: canManage })

  const toggle = useToggleActif()
  const anonymize = useAnonymizeUser()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [toToggle, setToToggle] = useState<UserRow | null>(null)
  const [toAnonymize, setToAnonymize] = useState<UserRow | null>(null)

  // Garde-fou d'accès : réservé admin/manager.
  if (rolePending) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }
  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Utilisateurs" />
        <EmptyState
          icon={ShieldOff}
          title="Accès réservé"
          description="Cette page est réservée aux administrateurs et managers."
        />
      </div>
    )
  }

  function confirmToggle() {
    if (!toToggle) return
    toggle.mutate(
      { id: toToggle.id, estActif: !toToggle.est_actif },
      {
        onSuccess: () => {
          toast.success(
            toToggle.est_actif ? 'Compte désactivé' : 'Compte réactivé',
          )
          setToToggle(null)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  function confirmAnonymize() {
    if (!toAnonymize) return
    anonymize.mutate(toAnonymize.id, {
      onSuccess: () => {
        toast.success('Utilisateur anonymisé')
        setToAnonymize(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const inviteButton = (
    <Button onClick={() => setInviteOpen(true)}>
      <UserPlus /> Inviter
    </Button>
  )

  return (
    <div className="p-6">
      <PageHeader
        title="Utilisateurs"
        description="Invitations, rôles et accès. Selon la cascade, vous ne pouvez créer que certains rôles."
        action={inviteButton}
      />

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Invitez un premier utilisateur pour commencer."
          action={inviteButton}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(users as UserRow[]).map((u) => {
            const isAnonymized = u.anonymized_at !== null
            const isSelf = u.id === myId
            return (
              <Card key={u.id} className="min-w-0">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">
                      {u.nom_complet}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {roleLabel(u.roles?.code)}
                      </Badge>
                      {u.est_actif ? (
                        <Badge variant="outline">Actif</Badge>
                      ) : (
                        <Badge variant="destructive">Inactif</Badge>
                      )}
                      {isAnonymized && (
                        <Badge variant="outline">Anonymisé</Badge>
                      )}
                    </div>
                  </div>

                  {/* Toggle est_actif et anonymisation : admin uniquement
                      (contraintes base : protect_users_sensitive_columns +
                      anonymize_user). On masque pour les non-admins et pour
                      soi-même (auto-désactivation/anonymisation interdites). */}
                  {isAdmin && !isSelf && !isAnonymized && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setToToggle(u)}
                      >
                        {u.est_actif ? (
                          <>
                            <Ban /> Désactiver
                          </>
                        ) : (
                          <>
                            <CheckCircle2 /> Réactiver
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToAnonymize(u)}
                      >
                        <ShieldOff /> Anonymiser
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <InviteUserDialog
        key={inviteOpen ? 'open' : 'closed'}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        callerRole={role}
      />

      <ConfirmDialog
        open={toToggle !== null}
        onOpenChange={(open) => {
          if (!open) setToToggle(null)
        }}
        title={
          toToggle?.est_actif
            ? 'Désactiver ce compte ?'
            : 'Réactiver ce compte ?'
        }
        description={
          toToggle
            ? toToggle.est_actif
              ? `« ${toToggle.nom_complet} » perdra immédiatement l’accès à l’application.`
              : `« ${toToggle.nom_complet} » pourra de nouveau se connecter.`
            : undefined
        }
        confirmLabel={toToggle?.est_actif ? 'Désactiver' : 'Réactiver'}
        destructive={toToggle?.est_actif}
        loading={toggle.isPending}
        onConfirm={confirmToggle}
      />

      <ConfirmDialog
        open={toAnonymize !== null}
        onOpenChange={(open) => {
          if (!open) setToAnonymize(null)
        }}
        title="Anonymiser cet utilisateur ?"
        description={
          toAnonymize
            ? `Les données personnelles de « ${toAnonymize.nom_complet} » seront effacées (RGPD) et le compte désactivé. L’historique métier est conservé. Action irréversible.`
            : undefined
        }
        confirmLabel="Anonymiser"
        destructive
        loading={anonymize.isPending}
        onConfirm={confirmAnonymize}
      />
    </div>
  )
}
