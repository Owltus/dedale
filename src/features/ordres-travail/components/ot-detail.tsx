import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { OT_QUERY_KEYS } from '../query-keys'
import { consoOperation } from '../schemas'
import { libelleReleve } from '../releves'
import {
  useChangerStatutOt,
  useDeleteOt,
  useReouvrirOt,
  useUpdateDatePrevueOt,
} from '../mutations'
import { useOperationsEditor } from '../use-operations-editor'
import {
  OperationRow,
  estCompteur,
  estCompteurCumulatif,
} from './operation-row'
import { OtDetailActions } from './ot-detail-actions'
import { MotifDialog } from '@/components/common/motif-dialog'
import { DatePrevueDialog } from './date-prevue-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useFileDrop } from '@/hooks/use-file-drop'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import type { Database } from '@/lib/database.types'
import { DetailSkeleton } from '@/components/common/detail-skeleton'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { PageContainer } from '@/components/common/page-container'
import {
  PageHeader,
  type PageHeaderCrumb,
} from '@/components/common/page-header'
import {
  DetailTabsShell,
  ONGLET_ETAT_VIDE,
} from '@/components/common/detail-tabs-shell'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'

interface OtDetailProps {
  otId: string
  /** Site actif : cloisonne la query en plus de la RLS (défense en profondeur). */
  siteId: string
  canManage: boolean
}

type Onglet = 'operations' | 'documents'

export function OtDetail({ otId, siteId, canManage }: OtDetailProps) {
  const {
    data: ot,
    isPending,
    isError,
    refetch,
  } = useQuery(ordresTravailQueries.detail(otId, siteId))
  const operationsQuery = useQuery(ordresTravailQueries.operations(otId))
  // Mise à jour LIVE du détail : changement de l'OT (statut/dates) ou de ses
  // opérations (saisie d'exécution) — ici, autre onglet ou autre utilisateur — sans F5.
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  useRealtimeRefresh('operations_execution', ordresTravailQueries.all())
  // Focus auto réservé aux pointeurs fins (desktop) : sur tactile, un focus
  // programmatique ouvrirait le clavier virtuel sans valeur ajoutée (pas de Tab).
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)')

  const navigate = useNavigate()
  const changerStatut = useChangerStatutOt()
  const reouvrir = useReouvrirOt()
  const supprimer = useDeleteOt()
  const updateDatePrevue = useUpdateDatePrevueOt()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Suppression définitive (hard-delete) confirmée : état `toDelete` + toasts +
  // fermeture factorisés. Repli navigation vers la liste (l'OT n'existe plus).
  const suppression = useConfirmDelete<string>({
    onDelete: (id) => supprimer.mutateAsync(id),
    successMessage: 'OT supprimé',
    onSuccess: () => void navigate({ to: '/ordres-travail' }),
  })

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [datePrevueOpen, setDatePrevueOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer pleine page → pré-remplissent l'upload.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  // Opérations calculées AVANT les retours anticipés : le moteur d'édition
  // (`useOperationsEditor`) appelle `useBlocker`/`useSaveShortcut`, qui doivent
  // être invoqués inconditionnellement (règle des hooks).
  const operations = operationsQuery.data ?? []

  // Re-clôture manuelle d'un OT rouvert : ses opérations étant déjà toutes
  // terminales, aucun déclencheur de clôture auto ne part (le trigger ne réagit
  // qu'à un changement de STATUT d'opération). La base valide la transition
  // reouvert → cloture et refuse si une opération n'est pas terminée. Déclaration
  // hoistée → utilisable comme `onRecloturer` du moteur d'édition ci-dessous.
  function recloturer() {
    changerStatut.mutate(
      { id: otId, statut: 'cloture' },
      {
        onSuccess: () => toast.success('OT clôturé'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  // Moteur d'édition des opérations : saisies, enregistrement groupé, garde-fou de
  // navigation et Ctrl+S. Un SEUL bouton adaptatif (cf. OtDetailActions) l'actionne.
  const {
    setEdits,
    savingOps,
    opsReadOnly,
    opEdit,
    dirtyOps,
    toutesTerminalesApres,
    saveAllOps,
    blocker,
  } = useOperationsEditor({
    ot,
    otId,
    operations,
    canManage,
    onglet,
    onRecloturer: recloturer,
  })

  // Relevés précédents des compteurs (rappel « précédent : X (+écart) ») : dernier
  // relevé de la même opération (reliée par source_id, stable depuis la migration 063)
  // sur un OT antérieur de la même gamme. La RLS cloisonne par site. Hook appelé AVANT
  // les early-returns (règle des hooks).
  const compteurSourceIds = operations
    .filter((op) => estCompteur(op))
    .map((op) => op.source_id)
  const previousReadingsQuery = useQuery(
    ordresTravailQueries.previousReadings(
      otId,
      ot?.gamme_id ?? null,
      ot?.date_prevue ?? null,
      compteurSourceIds,
    ),
  )
  // Relevé précédent d'une opération compteur (clé `source_type:source_id`, cf.
  // requête previousReadings) — UN seul format de clé pour la carte ET les lignes.
  const relevePrecedentDe = (op: (typeof operations)[number]) =>
    previousReadingsQuery.data?.[`${String(op.source_type)}:${op.source_id}`] ??
    null

  // Glisser-déposer sur TOUTE la page (réservé aux gestionnaires) : un dépôt
  // bascule sur l'onglet Documents et ouvre l'upload pré-rempli des fichiers.
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setOnglet('documents')
      setUploadOpen(true)
    },
  })
  // Fermeture de l'upload : on oublie les fichiers déposés pour repartir propre.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }

  // À l'ouverture de l'onglet Opérations (données chargées), on place le focus sur
  // le 1er champ valeur VIDE et non désactivé → saisie immédiate sans cliquer (puis
  // Tab enchaîne, déjà géré). Si tout est renseigné, ou OT verrouillé (champs
  // désactivés), on ne vole pas le focus. `requestAnimationFrame` attend le rendu.
  useEffect(() => {
    // `isPending` = query DÉTAIL : tant qu'elle charge, l'onglet affiche le
    // squelette (les OperationRow ne sont pas encore dans le DOM). Sans ce garde,
    // si les opérations résolvent avant le détail, l'effet se déclencherait sur le
    // squelette (focus perdu) sans jamais se rejouer (course détail/opérations).
    if (
      !isFinePointer ||
      onglet !== 'operations' ||
      isPending ||
      !operationsQuery.isSuccess
    )
      return
    const raf = requestAnimationFrame(() => {
      const premierVide = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[data-op-value]:not([disabled])',
        ),
      ).find((i) => i.value.trim() === '')
      premierVide?.focus({ preventScroll: true })
      premierVide?.select()
    })
    return () => cancelAnimationFrame(raf)
    // Déclenché à l'ouverture de l'onglet / fin de chargement / changement d'OT,
    // PAS à chaque frappe (sinon le focus sauterait pendant la saisie).
  }, [isFinePointer, onglet, isPending, operationsQuery.isSuccess, otId])

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader
          title="Ordre de travail"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <DetailSkeleton />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Ordre de travail"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }
  if (!ot) {
    return (
      <PageContainer>
        <PageHeader
          title="OT introuvable"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <EmptyState
          icon={ClipboardList}
          title="OT introuvable"
          description="Cet ordre de travail n'existe plus ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  // Strict inverse de `opsReadOnly` (calculé par le moteur d'édition) — une seule
  // règle, pas deux expressions en miroir à garder synchrones.
  const canEditOps = !opsReadOnly
  // Image ESTHÉTIQUE PROPRE de l'OT (snapshot souple hérité de la gamme — 067) :
  // un OT terminal garde la sienne même si la gamme change d'image ensuite.
  const otMiniatureId = ot.miniature_id ?? null

  function reactiver() {
    // Résurrection annule → planifie (refresh snapshots + régénère ops côté DB).
    changerStatut.mutate(
      { id: otId, statut: 'planifie' },
      {
        onSuccess: () => {
          toast.success('OT réactivé')
          setEdits({})
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function annuler(motif: string) {
    changerStatut.mutate(
      { id: otId, statut: 'annule', motifAnnulation: motif },
      {
        onSuccess: () => {
          toast.success('OT annulé')
          setAnnulerOpen(false)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function confirmDatePrevue(valeurs: {
    datePrevue: string
    origine: Database['public']['Enums']['ot_origine']
  }) {
    if (!ot) return
    // origine envoyée seulement si l'utilisateur l'a changée (sinon on n'arme pas le
    // trigger backend pour un no-op). La base valide la bascule : planifie → programme
    // est ouvert aux rôles métier (migration 070), programme → planifie à tous.
    const origineChange = valeurs.origine !== ot.origine
    updateDatePrevue.mutate(
      {
        id: otId,
        datePrevue: valeurs.datePrevue,
        origine: origineChange ? valeurs.origine : undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            origineChange
              ? 'Ordre de travail mis à jour'
              : 'Date prévue modifiée',
          )
          setDatePrevueOpen(false)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function handleReouvrir() {
    // Réouverture en UN clic (pas de modal). Le motif est imposé par la base
    // (CHECK motif_reouverture_oblig_si_reouvert + RPC, valeur juridique NF EN
    // 13306) → on fournit une note générique automatique plutôt que de demander
    // une saisie. Le changement de statut reste tracé dans audit_log.
    reouvrir.mutate(
      { id: otId, motif: 'Réouverture' },
      {
        onSuccess: () => toast.success('OT rouvert'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  // Top bar : badge de STATUT + actions conditionnelles (cf. OtDetailActions).
  const headerActions = (
    <OtDetailActions
      ot={ot}
      onglet={onglet}
      canManage={canManage}
      canEditOps={canEditOps}
      dirtyCount={dirtyOps.length}
      toutesTerminalesApres={toutesTerminalesApres}
      savingOps={savingOps}
      changerStatutPending={changerStatut.isPending}
      updateDatePrevuePending={updateDatePrevue.isPending}
      reouvrirPending={reouvrir.isPending}
      suppressionPending={suppression.pending}
      onSave={() => void saveAllOps()}
      onRecloturer={recloturer}
      onRattacherDocument={() => {
        setDroppedFiles([])
        setUploadOpen(true)
      }}
      onModifierDate={() => setDatePrevueOpen(true)}
      onAnnuler={() => setAnnulerOpen(true)}
      onReouvrir={handleReouvrir}
      onReactiver={reactiver}
      onSupprimer={() => suppression.demander(otId)}
    />
  )

  // Sommes de consommation par unité CUMULATIVE (kVA exclu via estCompteurCumulatif).
  // Réutilise les relevés précédents déjà chargés ; total partiel accepté.
  const toNombre = (s: string) =>
    s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s)
  // Valeur affichée dans la cellule « Relevé » de la carte d'en-tête : MÊME
  // logique exportée que la carte de liste (`libelleReleve`), mais seuil ≥ 2
  // occurrences d'une unité (carte d'en-tête). Vide → « — ».
  const releve =
    libelleReleve(
      operations.filter(estCompteurCumulatif).map((op) => {
        const e = opEdit(op)
        const precedent = relevePrecedentDe(op)
        return {
          symbole: op.unite_symbole ?? '',
          conso: consoOperation({
            precedent,
            courant: toNombre(e.valeur),
            depose: toNombre(e.indexDepose),
            pose: toNombre(e.indexPose),
          }),
        }
      }),
      2,
    ) || null

  // Fil d'Ariane : un OT vient d'une GAMME (décision PO) → on remonte vers le Plan de
  // maintenance et la gamme (ouverte via `?open`, l'explorateur reconstruit le chemin).
  // `Breadcrumb` replie automatiquement la racine en « … » → rendu « … › gamme › [OT] ».
  // OT sans gamme (ad hoc) : repli sur la liste des ordres de travail.
  const gammeId = ot.gamme_id
  const otBreadcrumb: PageHeaderCrumb[] = gammeId
    ? [
        {
          label: 'Plan de maintenance',
          onClick: () =>
            void navigate({ to: '/gammes/$', params: { _splat: '' } }),
        },
        {
          label: ot.nom_gamme,
          onClick: () =>
            void navigate({
              to: '/gammes/$',
              params: { _splat: '' },
              search: { open: gammeId },
            }),
        },
      ]
    : [
        {
          label: 'Ordres de travail',
          onClick: () => void navigate({ to: '/ordres-travail' }),
        },
      ]

  return (
    // Mode `fill` OBLIGATOIRE : `DetailTabsShell` porte sa PROPRE zone défilante
    // (en-tête + onglets fixes, corps `overflow-y-auto no-scrollbar`). Sans
    // `fill`, PageContainer traite son 1er enfant — ici la fiche ENTIÈRE — comme
    // en-tête FIXE `shrink-0` : le corps perd sa hauteur bornée, cesse de défiler
    // et se fait clipper par le `main` (overflow-hidden). Les gouttières sont
    // reprises de `FillHeader`/`ScrollBody`, que le mode `fill` ne pose pas.
    <PageContainer fill>
      {/* Géométrie portée par DetailTabsShell — la MÊME que les fiches gamme et
          prestataire. `overlay` rend la surcouche de glisser-déposer DANS la zone
          défilante (`relative`), qui voile toute la hauteur visible quel que soit
          l'onglet ; `bodyClassName` garde la colonne flex qui centre l'état vide
          « Aucun document » et laisse l'onglet Documents occuper la zone. */}
      <DetailTabsShell
        className="px-4 pt-6 pb-6 sm:px-6 lg:px-8"
        tabsAriaLabel="Sections de l’ordre de travail"
        value={onglet}
        onValueChange={setOnglet}
        items={[
          { id: 'operations', label: 'Opérations' },
          { id: 'documents', label: 'Documents' },
        ]}
        bodyClassName="flex flex-col"
        overlay={canManage ? <FileDropOverlay show={dragging} /> : undefined}
        header={
          <PageHeader
            title={ot.nom_gamme}
            description={ot.description_gamme ?? undefined}
            breadcrumb={otBreadcrumb}
            action={headerActions}
          />
        }
        headerCard={
          // Vignette + infos en grille 3 colonnes (l1 prestataire/périodicité/
          // relevé, l2 dates). Le relevé est masqué par une cellule vide quand
          // il n'y a aucune somme.
          <DetailHeaderCard
            thumbnail={
              <MiniatureThumb
                url={urlOf(otMiniatureId)}
                fallback={<ClipboardList className="size-10" />}
                alt=""
                onError={refreshMiniatures}
                className="size-full rounded-none"
              />
            }
            fields={[
              { label: 'Prestataire', value: ot.nom_prestataire },
              { label: 'Périodicité', value: ot.libelle_periodicite },
              releve ? { label: 'Relevé', value: releve } : null,
              { label: 'Prévue', value: formatDate(ot.date_prevue) },
              {
                label: 'Début',
                value: ot.date_debut ? formatDate(ot.date_debut) : null,
              },
              {
                label: 'Clôture',
                value: ot.date_cloture ? formatDate(ot.date_cloture) : null,
              },
            ]}
          />
        }
      >
        {(actif) => (
          <>
            {actif === 'operations' ? (
              operationsQuery.isPending ? (
                <div className="flex flex-col gap-2">
                  {/* Les opérations sont des lignes : la brique de liste les
                      annonce à la bonne hauteur, au lieu d'une boucle maison. */}
                  <ListRowSkeletons count={3} />
                </div>
              ) : operationsQuery.isError ? (
                <ErrorState onRetry={() => void operationsQuery.refetch()} />
              ) : operations.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="Aucune opération"
                  className={ONGLET_ETAT_VIDE}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {operations.map((op) => (
                    <OperationRow
                      key={op.id}
                      operation={op}
                      value={opEdit(op)}
                      onChange={(v) =>
                        setEdits((prev) => ({ ...prev, [op.id]: v }))
                      }
                      readOnly={opsReadOnly}
                      previousValue={relevePrecedentDe(op)}
                    />
                  ))}
                </div>
              )
            ) : (
              <DocumentsTab
                liaison="documents_ordres_travail"
                parentColumn="ordre_travail_id"
                parentId={otId}
                uploadOpen={uploadOpen}
                onUploadOpenChange={handleUploadOpenChange}
                uploadInitialFiles={droppedFiles}
                className="min-h-0 flex-1"
                namingContext={{
                  prestataire: ot.nom_prestataire,
                  objet: ot.nom_gamme,
                  date: ot.date_prevue,
                }}
              />
            )}
          </>
        )}
      </DetailTabsShell>

      <MotifDialog
        key={annulerOpen ? 'annuler-open' : 'annuler-closed'}
        open={annulerOpen}
        onOpenChange={setAnnulerOpen}
        title="Annuler l'ordre de travail"
        description="Indiquez le motif d'annulation (traçabilité obligatoire)."
        confirmLabel="Annuler l'OT"
        destructive
        pending={changerStatut.isPending}
        onConfirm={annuler}
      />

      {/* Replanification : édition de la date prévue. `key` réinitialise le champ
          à la date courante à chaque ouverture (état interne au dialogue). */}
      <DatePrevueDialog
        key={datePrevueOpen ? 'date-open' : 'date-closed'}
        open={datePrevueOpen}
        onOpenChange={setDatePrevueOpen}
        datePrevue={ot.date_prevue.slice(0, 10)}
        origine={ot.origine}
        pending={updateDatePrevue.isPending}
        onConfirm={confirmDatePrevue}
      />

      {/* Suppression définitive de l'OT — même formulation que la liste. */}
      <ConfirmDialog
        {...suppression.dialogProps}
        title="Supprimer l'ordre de travail ?"
        description={`« ${ot.nom_gamme} » sera supprimé définitivement.`}
        confirmLabel="Supprimer"
        destructive
      />

      {/* Garde-fou navigation : saisies d'opérations non enregistrées. */}
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
        title="Modifications non enregistrées"
        description="Des saisies d'opérations n'ont pas été enregistrées. Si vous quittez cette page, elles seront perdues."
        confirmLabel="Quitter sans enregistrer"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </PageContainer>
  )
}
