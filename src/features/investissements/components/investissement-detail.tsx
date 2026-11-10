import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CircleSlash, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  decisionsCapexQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import {
  decisionsCapex,
  etapesInvestissement,
  ID_ANNULE,
  ID_CLOTURE,
  ID_REFUSE,
  ID_REPORTE,
  ISSUES_ARRET,
  libelleDecision,
  libelleDecisionPar,
  nomStatutCapex,
  statutCapexTone,
  type DecisionCapex,
  type DecisionPar,
} from '@/features/investissements/etat'
import { useChangeStatutCapex } from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate, isoLocale } from '@/lib/date'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { cn } from '@/lib/utils'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MotifDialog } from '@/components/common/motif-dialog'
import { DetailNoteCard } from '@/components/common/detail-note-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toneToken } from '@/components/common/charts/chart-tokens'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export function InvestissementDetail({
  investissement: inv,
  siteId,
  canManage,
}: {
  investissement: Investissement
  siteId: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const edit = useEntityDialog<Investissement>()
  const cloture = useEntityDialog<Investissement>()
  const { session } = useAuth()
  const confirmAction = useConfirmAction<{ statutId: number }>()
  // Quelle issue on est en train de poser (Refusé, Annulé, Reporté) et PAR QUI
  // (137) : le même dialogue de motif sert aux trois, seul le vocabulaire
  // change. `null` = fermé.
  const [arret, setArret] = useState<{
    statutId: number
    par: DecisionPar | null
  } | null>(null)
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  const upload = useUploadDrop({ enabled: canManage })
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const change = useChangeStatutCapex()
  const { data: historique = [] } = useQuery(decisionsCapexQueries.list(inv.id))
  const decisions = canManage ? decisionsCapex(inv.statut_capex_id) : []
  const parCourant = inv.decision_par as DecisionPar | null
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesInvestissement(inv.statut_capex_id, noms)

  const { label, depassement } = ecartCapex(inv)
  const ecartLabel = label ?? '—'
  // Issues hors parcours de la frise (121, 137) : Refusé et Reporté passent par
  // l'ARBRE DE DÉCISION (avec qui décide) ; Annulé (abandon, à tout moment)
  // reste en barre de titre. Les trois exigent un motif (la base le refuse
  // sinon). « Relancer » ramène au départ, l'historique garde tout.
  const estArrete = ISSUES_ARRET.includes(inv.statut_capex_id)
  const canAnnuler = canManage && inv.statut_capex_id !== ID_ANNULE

  function decider(d: DecisionCapex) {
    if (d.statutId === ID_CLOTURE) {
      cloture.openEdit(inv)
      return
    }
    if (ISSUES_ARRET.includes(d.statutId)) {
      setArret({ statutId: d.statutId, par: d.par })
      return
    }
    change.mutate(
      { id: inv.id, statutId: d.statutId, decisionPar: d.par },
      {
        onSuccess: () =>
          toast.success(
            `${libelleDecision(d.statutId, d.par, noms, false)} — enregistré`,
          ),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function changeStatut(statutId: number) {
    if (statutId === inv.statut_capex_id) return
    // Clôturer demande un bilan : on passe par le dialogue. Tout autre statut
    // est immédiat. Le cycle étant libre, on peut rouvrir un investissement
    // clos — la mutation efface alors date et bilan.
    if (statutId === ID_CLOTURE) {
      cloture.openEdit(inv)
      return
    }
    // Refuser et annuler exigent un motif : on passe par le dialogue, jamais en
    // direct. Vaut aussi pour un clic sur la frise, pas seulement pour les
    // boutons — sinon la base renverrait un 23514 illisible.
    if (ISSUES_ARRET.includes(statutId)) {
      setArret({ statutId, par: 'responsable' })
      return
    }
    change.mutate(
      { id: inv.id, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={inv.libelle}
        // Pas de description ici : la date de demande vit dans la carte, en
        // regard de celle de clôture. La répéter donnerait deux endroits à
        // corriger pour une seule information (patron de la page Événements).
        breadcrumb={[
          {
            label: 'Investissements (CapEx)',
            onClick: () => void navigate({ to: '/investissements' }),
          },
        ]}
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={upload.openUploadEmpty}
              />
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="outline"
                onClick={() => edit.openEdit(inv)}
              />
              {canAnnuler && (
                <TooltipIconButton
                  icon={<CircleSlash />}
                  label="Annuler l'investissement"
                  variant="outline"
                  onClick={() =>
                    setArret({ statutId: ID_ANNULE, par: 'responsable' })
                  }
                />
              )}
            </>
          ) : undefined
        }
      />

      {/* Le budget est dans une `Card` ordinaire et non `DetailHeaderCard` :
          cette brique est faite pour une entité ILLUSTRÉE (équipement, gamme,
          prestataire) ; un investissement n'a pas de vignette, on lui posait donc
          une icône de repli dans un carré de 80 px qui ne servait qu'à décaler
          son contenu. */}

      {/* FRISE — seule à rester PLEINE LARGEUR : c'est le résumé de l'état, on
          la lit avant le détail. Statut LIBRE → toute pastille est cliquable
          (positionne ce statut) ; « Refuser » est en barre de titre. */}
      {(etapes ?? decisions.length > 0) && (
        <Card className="mb-4">
          <CardContent className="space-y-4">
            {etapes && (
              <StatusStepper
                steps={etapes}
                disabled={change.isPending}
                onStepClick={
                  canManage
                    ? (i) => {
                        const cible = etapes[i]
                        if (cible) changeStatut(cible.statutId)
                      }
                    : undefined
                }
              />
            )}
            {/* ARBRE DE DÉCISION (137) : seulement les choix qui ont un sens à
                l'étape courante — le « oui » en premier, puis refuser et
                reporter. La direction n'utilisant pas l'appli, ses décisions
                sont notées ici par le responsable. */}
            {decisions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <span className="mr-1 text-sm text-muted-foreground">
                  {invitationDecision(inv.statut_capex_id, estArrete)}
                </span>
                {decisions.map((d, i) => (
                  <Button
                    key={d.statutId}
                    size="sm"
                    variant={
                      i === 0
                        ? 'default'
                        : d.statutId === ID_REFUSE
                          ? 'destructive'
                          : 'outline'
                    }
                    disabled={change.isPending}
                    onClick={() => decider(d)}
                  >
                    {d.libelle}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* BUDGET — une BARRE pleine largeur, juste sous la frise : comme elle,
          il résume l'état du dossier d'un regard, et comme elle il se lit en
          travers plutôt qu'en colonne. Les quatre montants tiennent donc sur UNE
          ligne, dans l'ordre de lecture Demandé → Prévu → Réel → Écart ; à
          mi-largeur, ils s'enchaînaient en zigzag et « Prévu » se retrouvait
          séparé de « Réel » — précisément la comparaison qu'on vient chercher.

          Les quatre emplacements sont TOUJOURS rendus, « — » compris : sur un
          écran de suivi, un montant manquant est une information (contrairement
          à la liste, qui n'affiche que les montants renseignés).

          PAS de titre de carte, comme la frise juste au-dessus : les deux barres
          de tête sont auto-descriptives — « Demandé / Prévu / Réel / Écart » dit
          déjà qu'il s'agit du budget, et un titre au-dessus n'aurait fait que
          répéter en occupant une ligne. Les cartes de CONTENU (notes, documents),
          elles, gardent le leur. */}
      <Card className="mb-4 py-4">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {[
            { label: 'Demandé', value: formatEuros(inv.montant_demande) },
            { label: 'Prévu', value: formatEuros(inv.montant_prevu) },
            { label: 'Réel', value: formatEuros(inv.depense_reelle) },
            {
              label: 'Écart prévu / réel',
              value: ecartLabel,
              alerte: depassement,
            },
          ].map((m) => (
            <div key={m.label} className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">
                {m.label}
              </div>
              <div
                className={cn(
                  'truncate font-medium tabular-nums',
                  m.alerte && 'text-warning',
                )}
              >
                {m.value}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* LES DEUX BOUTS DU DOSSIER, CÔTE À CÔTE : ce qui était demandé à gauche,
          ce qu'il en est advenu à droite. `lg:` et pas `md:` — à 768 px, deux
          colonnes de texte deviennent deux couloirs étroits ; en dessous tout se
          réempile dans l'ordre de lecture (mobile-first). */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* DEMANDE — toujours rendue, description vide comprise : sinon la date
            de demande n'aurait plus d'endroit où vivre. */}
        <DetailNoteCard
          label={`Demandé le ${formatDate(inv.date_demande)}`}
          text={inv.description}
          emptyText="Aucune description."
          action={
            canManage && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="ghost"
                onClick={() => edit.openEdit(inv)}
              />
            )
          }
        />

        {/* BILAN — rendu EN PERMANENCE, y compris avant la clôture : la fiche
            annonce ainsi les deux bouts de son cycle dès l'ouverture du dossier,
            au lieu de faire apparaître un bloc en fin de course. Le libellé dit
            alors « Clôture » (l'étape qui reste à venir) et non « Clôturé », qui
            serait faux ; le crayon n'apparaît qu'une fois la clôture faite —
            avant, on clôture par la frise. */}
        <DetailNoteCard
          label={
            inv.statut_capex_id === ID_CLOTURE
              ? `Clôturé${inv.date_cloture ? ` le ${formatDate(inv.date_cloture)}` : ''}`
              : 'Clôture'
          }
          text={inv.statut_capex_id === ID_CLOTURE ? inv.bilan : null}
          emptyText={
            inv.statut_capex_id === ID_CLOTURE
              ? 'Aucun bilan.'
              : 'Investissement non clôturé.'
          }
          action={
            canManage &&
            inv.statut_capex_id === ID_CLOTURE && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier la clôture"
                variant="ghost"
                onClick={() => cloture.openEdit(inv)}
              />
            )
          }
        />

        {/* MOTIF D'ARRÊT — à l'inverse du bilan, cette carte n'apparaît QUE si
            le dossier est refusé ou annulé. Elle n'annonce rien d'un cycle
            normal : afficher « Arrêt : néant » sur un investissement en cours
            suggérerait qu'il lui manque quelque chose. Le libellé dit LAQUELLE
            des deux issues, sinon le motif ne se comprendrait qu'à moitié. */}
        {estArrete && (
          <DetailNoteCard
            label={`${nomStatutCapex(inv.statut_capex_id, noms)}${
              parCourant ? ` par ${libelleDecisionPar(parCourant)}` : ''
            }${inv.date_arret ? ` le ${formatDate(inv.date_arret)}` : ''}`}
            text={inv.motif_arret}
            emptyText="Aucun motif."
            action={
              canManage && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier le motif"
                  variant="ghost"
                  onClick={() =>
                    setArret({
                      statutId: inv.statut_capex_id,
                      par: parCourant,
                    })
                  }
                />
              )
            }
          />
        )}
      </div>

      {/* HISTORIQUE DES DÉCISIONS (137) : écrit par la base à chaque changement
          de statut — qui a décidé, quand, pourquoi. Le plus récent en haut. */}
      {historique.length > 0 && (
        <Card className="mb-4 gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">
              Historique des décisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {historique
                .map((h, i) => ({ h, premiere: i === 0 }))
                .reverse()
                .map(({ h, premiere }) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                      {formatDate(h.created_at.slice(0, 10))}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{
                        background: toneToken(
                          statutCapexTone(h.statut_capex_id),
                        ),
                      }}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">
                        {libelleDecision(
                          h.statut_capex_id,
                          h.decision_par as DecisionPar | null,
                          noms,
                          premiere,
                        )}
                      </span>
                      {h.motif && (
                        <span className="block text-muted-foreground">
                          « {h.motif} »
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* DOCUMENTS — pleine largeur, hauteur naturelle et défilement de page :
          même patron que les fiches Événement et Travaux. */}
      <Card className="relative gap-3 py-4">
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsTab
            liaison="documents_investissements"
            parentColumn="investissement_id"
            parentId={inv.id}
            acceptedMimes={MIME_PDF}
            uploadOpen={upload.uploadOpen}
            onUploadOpenChange={upload.onUploadOpenChange}
            uploadInitialFiles={upload.droppedFiles}
            uploadDefaultTypeNom="Devis"
          />
        </CardContent>
        <FileDropOverlay show={upload.dragging} />
      </Card>

      {canManage && (
        <>
          <InvestissementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={siteId}
            investissement={inv}
          />
          <ClotureInvestissementDialog
            key={cloture.dialogKey}
            open={cloture.open}
            onOpenChange={cloture.onOpenChange}
            pending={change.isPending}
            dateDemande={inv.date_demande}
            // Déjà clôturé → le dialogue s'ouvre pré-rempli, en correction.
            initial={
              inv.statut_capex_id === ID_CLOTURE
                ? { date_cloture: inv.date_cloture, bilan: inv.bilan }
                : undefined
            }
            onConfirm={({ date_cloture, bilan }) => {
              change.mutate(
                {
                  id: inv.id,
                  statutId: ID_CLOTURE,
                  bilan,
                  dateCloture: date_cloture,
                  clotureBy: session?.user.id,
                },
                {
                  onSuccess: () => {
                    toast.success(
                      inv.statut_capex_id === ID_CLOTURE
                        ? 'Clôture modifiée'
                        : 'Investissement clôturé',
                    )
                    cloture.onOpenChange(false)
                  },
                  onError: (e) => toast.error(writeErrorMessage(e)),
                },
              )
            }}
          />
        </>
      )}

      {/* UN dialogue pour les DEUX issues : seuls les mots changent. Deux
          composants auraient dupliqué la même saisie, le même appel et la même
          gestion d'erreur pour une nuance de vocabulaire. */}
      <MotifDialog
        open={arret !== null}
        onOpenChange={(o) => !o && setArret(null)}
        title={titreArret(arret)}
        description={`${descriptionArret(arret?.statutId)} C’est ce qui restera pour comprendre la décision plus tard.`}
        label="Motif"
        confirmLabel={
          arret?.statutId === ID_ANNULE
            ? 'Annuler le dossier'
            : arret?.statutId === ID_REPORTE
              ? 'Reporter'
              : 'Refuser'
        }
        destructive={arret?.statutId !== ID_REPORTE}
        pending={change.isPending}
        onConfirm={(motif) => {
          if (arret === null) return
          const { statutId, par } = arret
          change.mutate(
            {
              id: inv.id,
              statutId,
              decisionPar: par,
              motifArret: motif,
              // Date NUE (`isoLocale`) et jamais `toISOString()` : c'est ce qui
              // avait produit le 23514 des ordres de travail.
              dateArret: isoLocale(new Date()),
              arreteBy: session?.user.id,
            },
            {
              onSuccess: () => {
                setArret(null)
                toast.success(
                  `${libelleDecision(statutId, par, noms, false)} — enregistré`,
                )
              },
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }}
      />

      <ConfirmDialog {...confirmAction.dialogProps} />
    </PageContainer>
  )
}

/** Invitation devant les boutons de décision, selon l'étape (137). */
function invitationDecision(statutId: number, estArrete: boolean): string {
  if (estArrete) return 'Revenir sur ce dossier :'
  if (statutId === 1) return 'Ma décision :'
  if (statutId === 5) return 'Décision de la direction :'
  return 'Étape suivante :'
}

/** Titre du dialogue de motif selon l'issue et qui la décide (137). */
function titreArret(
  arret: { statutId: number; par: DecisionPar | null } | null,
): string {
  if (!arret) return ''
  const qui = arret.par === 'direction' ? ' (décision de la direction)' : ''
  if (arret.statutId === ID_ANNULE) return "Annuler l'investissement ?"
  if (arret.statutId === ID_REPORTE) return `Reporter la demande${qui} ?`
  return `Refuser la demande${qui} ?`
}

function descriptionArret(statutId: number | undefined): string {
  if (statutId === ID_ANNULE)
    return 'Le dossier passera au statut « Annulé ». Dites pourquoi il est abandonné.'
  if (statutId === ID_REPORTE)
    return 'Le dossier passera au statut « Reporté ». Dites pourquoi la décision est repoussée.'
  return 'Le dossier passera au statut « Refusé ». Dites pourquoi il est écarté.'
}
