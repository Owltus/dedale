import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { travauxQueries, statutsTravauxQueries } from '../queries'
import { useChangeStatutTravaux } from '../mutations'
import {
  STATUT_EN_COURS,
  STATUT_TERMINE,
  TRANSITIONS,
  estVerrouille,
} from '../schemas'
import { etapesTravaux, variantStatutTravaux } from '../etat'
import { TravauxFormDialog } from './travaux-form-dialog'
import { ClotureDialog } from './cloture-dialog'
import { useFileDrop } from '@/hooks/use-file-drop'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type TravauxRow = Database['public']['Tables']['interventions_travaux']['Row']

interface TravauxDetailProps {
  travaux: TravauxRow & {
    prestataires: { id: string; libelle: string } | null
  }
  siteId: string
  canManage: boolean
}

export function TravauxDetail({
  travaux,
  siteId,
  canManage,
}: TravauxDetailProps) {
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const { data: locaux = [] } = useQuery(travauxQueries.locaux(travaux.id))
  const { data: equipements = [] } = useQuery(
    travauxQueries.equipements(travaux.id),
  )
  const change = useChangeStatutTravaux()
  const [edit, setEdit] = useState(false)
  const [clotureOpen, setClotureOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer sur la page → pré-remplis dans le dialogue.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutLabel = noms.get(travaux.statut_travaux_id) ?? 'Statut'
  const etapes = etapesTravaux(travaux.statut_travaux_id, noms)
  const verrouille = estVerrouille(travaux.statut_travaux_id)
  const transitions = TRANSITIONS[travaux.statut_travaux_id] ?? []
  const editable = canManage && !verrouille

  // Ouverture manuelle (bouton top bar) : aucun fichier pré-rempli.
  const openUploadEmpty = () => {
    setDroppedFiles([])
    setUploadOpen(true)
  }
  // Fermeture : on oublie les fichiers déposés pour repartir propre au coup suivant.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }
  // Glisser-déposer sur TOUTE la page (réservé aux rôles pouvant rattacher).
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setUploadOpen(true)
    },
  })

  function transition(statutId: number) {
    if (statutId === STATUT_TERMINE) {
      setClotureOpen(true)
      return
    }
    change.mutate(
      { id: travaux.id, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={travaux.titre}
        description={`Demandé le ${formatDate(travaux.date_demande)}`}
        titleBadges={
          <Badge variant={variantStatutTravaux(travaux.statut_travaux_id)}>
            {statutLabel}
          </Badge>
        }
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={openUploadEmpty}
              />
              {editable && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier le travaux"
                  variant="outline"
                  onClick={() => setEdit(true)}
                />
              )}
            </>
          ) : undefined
        }
      />

      {/* Description en tête (sans titre : le contenu parle de lui-même). */}
      {travaux.description?.trim() && (
        <Card className="mb-6">
          <CardContent className="text-sm whitespace-pre-wrap">
            {travaux.description}
          </CardContent>
        </Card>
      )}

      {/* Suivi : frise d'avancement + transitions de la machine à états. */}
      {etapes && (
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-4">
            <StatusStepper steps={etapes} />
            {canManage && transitions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <span className="text-muted-foreground text-xs">
                  Faire passer à :
                </span>
                {transitions.map((statutId) => (
                  <Button
                    key={statutId}
                    size="sm"
                    variant={statutId === STATUT_TERMINE ? 'default' : 'outline'}
                    disabled={change.isPending}
                    onClick={() => transition(statutId)}
                  >
                    {travaux.statut_travaux_id === STATUT_TERMINE &&
                    statutId === STATUT_EN_COURS
                      ? 'Rouvrir'
                      : (noms.get(statutId) ?? 'Statut')}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Caractéristiques (sans titre : les libellés suffisent). */}
      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Champ
            label="Prestataire"
            value={travaux.prestataires?.libelle ?? '—'}
          />
          <Champ label="Date prévue" value={formatDate(travaux.date_prevue)} />
          <Champ label="Date de fin" value={formatDate(travaux.date_fin)} />
          <Champ
            label="Date de demande"
            value={formatDate(travaux.date_demande)}
          />
        </CardContent>
      </Card>

      {/* Compte-rendu (présent une fois le travaux clôturé). */}
      {travaux.compte_rendu?.trim() && (
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Compte-rendu</span>
            <p className="whitespace-pre-wrap">{travaux.compte_rendu}</p>
          </CardContent>
        </Card>
      )}

      {/* Périmètre concerné : locaux + équipements liés. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Locaux concernés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {locaux.length === 0 ? (
              <p className="text-muted-foreground">Aucun local lié.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {locaux.map((l) => (
                  <li key={l.local_id} className="truncate">
                    {l.locaux.nom}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Équipements concernés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {equipements.length === 0 ? (
              <p className="text-muted-foreground">Aucun équipement lié.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {equipements.map((e) => (
                  <li key={e.equipement_id} className="truncate">
                    {e.equipements.nom}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zone documents : prend l'espace restant (flex-1) → surface de dépôt
          pleine hauteur, mise en valeur en entier pendant le glisser-déposer. */}
      <div className="relative flex-1">
        <DocumentsTab
          liaison="documents_interventions_travaux"
          parentColumn="travaux_id"
          parentId={travaux.id}
          uploadOpen={uploadOpen}
          onUploadOpenChange={handleUploadOpenChange}
          uploadInitialFiles={droppedFiles}
        />
        {dragging && (
          <div className="border-primary bg-primary/5 pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-dashed" />
        )}
      </div>

      {editable && (
        <TravauxFormDialog
          key={travaux.id}
          open={edit}
          onOpenChange={setEdit}
          siteId={siteId}
          travaux={travaux}
        />
      )}

      <ClotureDialog
        key={clotureOpen ? 'open' : 'closed'}
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        travauxId={travaux.id}
      />
    </PageContainer>
  )
}

function Champ({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-medium', className)}>{value}</span>
    </div>
  )
}
