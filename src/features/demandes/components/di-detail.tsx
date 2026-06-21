import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { demandesQueries } from '../queries'
import { useReopenDemande, useDeleteDemande } from '../mutations'
import { DiResolveDialog } from './di-resolve-dialog'
import { DiEditDialog } from './di-edit-dialog'
import { statutBadgeVariant, statutLabel } from '../etat'
import { diTitre } from '../schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { formatDate, formatDateLong } from '@/lib/date'
import { writeErrorMessage, deleteErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

interface DiDetailProps {
  demande: Demande
  /** Résolution / réouverture autorisée (rôle opérationnel). */
  canResolve: boolean
}

/**
 * Fiche détail d'une demande d'intervention : constat + liaisons (locaux,
 * équipements) et, le cas échéant, sa résolution. Le statut (Ouverte / Résolue /
 * Réouverte) est affiché en badge près du titre. Actions de la barre de titre :
 * Modifier / Résoudre-Réouvrir / Supprimer, chacune gouvernée par la RLS (le
 * front reflète les droits). La donnée vient de la liste (résolue par slug en
 * amont) — pas de requête « getOne ».
 */
export function DiDetail({ demande, canResolve }: DiDetailProps) {
  const navigate = useNavigate()
  const { data: role } = useCurrentRole()
  const { session } = useAuth()
  const { data: localisations = [] } = useQuery(
    demandesQueries.localisations(demande.id),
  )
  const { data: equipements = [] } = useQuery(
    demandesQueries.equipements(demande.id),
  )
  const reopen = useReopenDemande()
  const del = useDeleteDemande()
  const [resolveOpen, setResolveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isResolved = demande.statut_di_id === 2
  const canEdit = perm.canEditDemande(role, demande, session?.user.id)
  const canDelete = perm.canDeleteDemande(role, demande, session?.user.id)
  const hasActions = canEdit || canResolve || canDelete

  function handleReopen() {
    reopen.mutate(demande.id, {
      onSuccess: () => toast.success('Demande réouverte'),
      onError: (e) => toast.error(writeErrorMessage(e)),
    })
  }

  function confirmDelete() {
    del.mutate(demande.id, {
      onSuccess: () => {
        toast.success('Demande supprimée')
        void navigate({ to: '/demandes' })
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={diTitre(demande.constat)}
        description={`Constaté le ${formatDate(demande.date_constat)}`}
        titleBadges={
          <Badge variant={statutBadgeVariant(demande.statut_di_id)}>
            {statutLabel(demande.statut_di_id)}
          </Badge>
        }
        action={
          hasActions ? (
            <div className="flex items-center gap-2">
              {canEdit && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier la demande"
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                />
              )}
              {canResolve &&
                (isResolved ? (
                  <TooltipIconButton
                    icon={<RotateCcw />}
                    label="Réouvrir la demande"
                    variant="outline"
                    disabled={reopen.isPending}
                    onClick={handleReopen}
                  />
                ) : (
                  <TooltipIconButton
                    icon={<CheckCircle2 />}
                    label="Résoudre la demande"
                    variant="outline"
                    onClick={() => setResolveOpen(true)}
                  />
                ))}
              {canDelete && (
                <TooltipIconButton
                  icon={<Trash2 />}
                  label="Supprimer la demande"
                  variant="outline"
                  onClick={() => setDeleteOpen(true)}
                />
              )}
            </div>
          ) : undefined
        }
      />

      {/* Constat : contenu du signalement + liaisons éventuelles. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Constat</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="whitespace-pre-wrap">{demande.constat}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Date de constat</dt>
            <dd>{formatDateLong(demande.date_constat)}</dd>
            {localisations.length > 0 && (
              <>
                <dt className="text-muted-foreground">Localisations</dt>
                <dd>{localisations.map((l) => l.locaux.nom).join(', ')}</dd>
              </>
            )}
            {equipements.length > 0 && (
              <>
                <dt className="text-muted-foreground">Équipements</dt>
                <dd>{equipements.map((e) => e.equipements.nom).join(', ')}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Résolution (présente une fois la demande résolue ; conservée si réouverte). */}
      {demande.description_resolution && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Résolution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p className="whitespace-pre-wrap">
              {demande.description_resolution}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Date de résolution</dt>
              <dd>{formatDateLong(demande.date_resolution)}</dd>
            </dl>
            {!isResolved && (
              <p className="text-muted-foreground italic">
                Demande réouverte : cette résolution est conservée à titre
                d'historique.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <DiResolveDialog
        key={resolveOpen ? 'open' : 'closed'}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        diId={demande.id}
      />

      <DiEditDialog
        key={editOpen ? 'open' : 'closed'}
        open={editOpen}
        onOpenChange={setEditOpen}
        demande={demande}
        siteId={demande.site_id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer la demande ?"
        description={`« ${diTitre(demande.constat)} » sera supprimée définitivement.`}
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
