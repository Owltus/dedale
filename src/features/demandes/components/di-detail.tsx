import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  MessageSquareWarning,
  Pencil,
  RotateCcw,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { demandesQueries } from '../queries'
import {
  useReopenDemande,
  useDeleteDemande,
  usePrendreEnCharge,
  useCloturerDemande,
} from '../mutations'
import { DiEditDialog } from './di-edit-dialog'
import { statutLabel, statutTone } from '../etat'
import { diTitre } from '../schemas'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { formatDate, formatDateLong } from '@/lib/date'
import { writeErrorMessage, deleteErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { StatusBadge } from '@/components/common/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

interface DiDetailProps {
  demande: Demande
  /** Workflow (prendre en charge / clôturer / rouvrir) autorisé : rôle métier. */
  canResolve: boolean
}

/**
 * Fiche détail d'une demande d'intervention. Cycle de vie à 3 états (migration
 * 052) : Ouvert (1) → En cours (2) → Clôturé (3), transitions LIBRES côté métier
 * (Ouvert ↔ En cours ↔ Clôturé). Actions de la barre de titre selon le statut :
 * Modifier · Prendre en charge · Clôturer · Rouvrir · Supprimer, chacune gouvernée
 * par la RLS. La donnée vient de la liste (résolue par slug en amont).
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
  // Créateur de la DI : nom résolu via la RLS users (soit, ou pairs de site).
  const { data: users = [] } = useQuery(utilisateursQueries.list())
  const createur = useMemo(
    () => users.find((u) => u.id === demande.created_by)?.nom_complet ?? null,
    [users, demande.created_by],
  )
  const enCharge = usePrendreEnCharge()
  const reopen = useReopenDemande()
  const del = useDeleteDemande()
  const cloturer = useCloturerDemande()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const statut = demande.statut_di_id
  const isCloture = statut === 3
  const canEdit = perm.canEditDemande(role, demande, session?.user.id)
  const canDelete = perm.canDeleteDemande(role, demande, session?.user.id)
  const hasActions = canEdit || canResolve || canDelete

  function handlePrendreEnCharge() {
    enCharge.mutate(demande.id, {
      onSuccess: () => toast.success('Demande prise en charge'),
      onError: (e) => toast.error(writeErrorMessage(e)),
    })
  }

  function handleReopen() {
    reopen.mutate(demande.id, {
      onSuccess: () => toast.success('Demande rouverte'),
      onError: (e) => toast.error(writeErrorMessage(e)),
    })
  }

  function handleCloturer() {
    cloturer.mutate(demande.id, {
      onSuccess: () => toast.success('Demande clôturée'),
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
        breadcrumb={[
          {
            label: "Demandes d'intervention",
            onClick: () => void navigate({ to: '/demandes' }),
          },
        ]}
        titleBadges={
          <StatusBadge tone={statutTone(statut)}>
            {statutLabel(statut)}
          </StatusBadge>
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
              {/* Prendre en charge : Ouvert → En cours. */}
              {canResolve && statut === 1 && (
                <TooltipIconButton
                  icon={<Wrench />}
                  label="Prendre en charge"
                  variant="outline"
                  disabled={enCharge.isPending}
                  onClick={handlePrendreEnCharge}
                />
              )}
              {/* Clôturer : depuis Ouvert ou En cours → Clôturé (direct, sans note). */}
              {canResolve && !isCloture && (
                <TooltipIconButton
                  icon={<CheckCircle2 />}
                  label="Clôturer la demande"
                  variant="outline"
                  disabled={cloturer.isPending}
                  onClick={handleCloturer}
                />
              )}
              {/* Rouvrir : depuis En cours ou Clôturé → Ouvert. */}
              {canResolve && statut !== 1 && (
                <TooltipIconButton
                  icon={<RotateCcw />}
                  label="Rouvrir la demande"
                  variant="outline"
                  disabled={reopen.isPending}
                  onClick={handleReopen}
                />
              )}
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

      {/* En-tête : qui / quand / où (carte partagée) ; le texte du constat suit. */}
      <DetailHeaderCard
        className="mb-6"
        columns={2}
        fallbackIcon={MessageSquareWarning}
        fields={[
          { label: 'Signalé par', value: createur ?? null },
          {
            label: 'Date de constat',
            value: formatDateLong(demande.date_constat),
          },
          localisations.length > 0
            ? {
                label: 'Localisations',
                value: localisations.map((l) => l.locaux.nom).join(', '),
              }
            : null,
          equipements.length > 0
            ? {
                label: 'Équipements',
                value: equipements.map((e) => e.equipements.nom).join(', '),
              }
            : null,
        ]}
      />

      {/* Constat : le texte du signalement. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Constat</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="whitespace-pre-wrap">{demande.constat}</p>
        </CardContent>
      </Card>

      {/* Note de clôture (présente dès qu'une clôture a eu lieu ; conservée si rouverte). */}
      {demande.description_resolution && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Note de clôture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p className="whitespace-pre-wrap">
              {demande.description_resolution}
            </p>
            {demande.date_resolution && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Date de clôture</dt>
                <dd>{formatDateLong(demande.date_resolution)}</dd>
              </dl>
            )}
            {!isCloture && (
              <p className="text-muted-foreground italic">
                Demande rouverte : cette note de clôture est conservée à titre
                d'historique.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
