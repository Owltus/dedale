import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Folder,
  FolderTree,
  Inbox,
  Package,
  Pencil,
  Plus,
  SquareCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { equipementsQueries } from '../queries'
import { useDeleteEquipement } from '../mutations'
import {
  titreAffiche,
  secondaireAffiche,
  tertiaireAffiche,
  nomAfficheTexte,
} from '../format'
import { EquipementParcDialog } from './equipement-parc-dialog'
import { ParcSousCategorieDialog } from './parc-sous-categorie-dialog'
import { EquipementDetail } from './equipement-detail'
import { EquipementBadges } from './equipement-badges'
import { ImportCsvDialog } from './import-csv-dialog'
import { modelesEquipementsQueries } from '@/features/modeles-equipements/queries'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { ConfirmDeleteCategorieDialog } from '@/features/categories/components/confirm-delete-categorie-dialog'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useEquipementsDrill } from '@/hooks/use-equipements-drill'
import {
  useCatalogueDrill,
  type CatalogueDrillCat,
  NON_CLASSE_ID,
} from '@/hooks/use-catalogue-drill'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { parseChamps } from '@/lib/champs'
import { deleteErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { DrillPageHeader } from '@/components/common/drill-page-header'
import { drillCrumbs } from '@/components/common/drill-crumbs'
import {
  TabActionContext,
  type TabAddConfig,
  type TabActionApi,
} from '@/components/common/tab-actions'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRow } from '@/components/common/list-row'
import { actionsEditionSuppression } from '@/components/common/row-actions'
import { listStack } from '@/lib/responsive'
import { ScopeBadges } from '@/components/common/scope-badges'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { FillHeader, ScrollBody } from '@/components/common/page-container'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

/**
 * Case à cocher VISUELLE (pas Radix) posée dans le slot `media` d'une
 * `ListRow` en mode sélection : la card entière porte déjà le clic (bascule
 * la sélection), donc PAS d'élément interactif imbriqué — `media` n'est ici
 * qu'un rendu, cf. contrat de `ListRow` (variante média = bouton overlay).
 */
function CaseSelection({ selected }: { selected: boolean }) {
  return (
    <div className="flex size-full items-center justify-center bg-muted">
      <div
        className={
          selected
            ? 'flex size-5 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground'
            : 'flex size-5 items-center justify-center rounded-[4px] border border-input bg-background'
        }
      >
        {selected && <Check className="size-3.5" />}
      </div>
    </div>
  )
}

/**
 * Catégorie pour le DRILL du parc : projection commune (`CatalogueDrillCat`) plus
 * le modèle fixé sur la sous-catégorie (les équipements en sont des copies).
 */
interface DrillCat extends CatalogueDrillCat {
  modeleId: string | null
}

// Accès stables (identité constante) alimentant `useCatalogueDrill` : id, nom et
// catégorie d'un équipement. L'id/nom peuvent être null en type (vue) → repli.
const equipementId = (e: Equipement) => e.id ?? ''
const equipementNom = (e: Equipement) => nomAfficheTexte(e)
const equipementCategorieId = (e: Equipement) => e.categorie_id

/**
 * Explorateur des Équipements du SITE actif : navigation par CATÉGORIE portée par
 * l'URL (même patron que le panneau « Modèles d'équipements » de la Bibliothèque,
 * via `useEquipementsDrill`), mais pour les ÉQUIPEMENTS RÉELS — chemin CLASSIQUE :
 * - Racine : les catégories d'équipement DU SITE (+ un bac « Non classé » si des
 *   équipements n'ont pas de catégorie de site). On n'y crée QUE des catégories.
 * - Dans une catégorie : ses équipements ; on y crée un équipement (manuel) ou on
 *   le crée depuis un modèle (instanciation → équipement autonome).
 * - Sur un équipement : sa fiche détail.
 * Le commun n'apparaît jamais ici (catalogue = Bibliothèque) ; pas de sélecteur de
 * périmètre (le site actif est fixé par la sidebar).
 */
export function EquipementsExplorer({ siteId }: { siteId: string }) {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)

  const categoriesQuery = useQuery(categoriesQueries.pool())
  const equipementsQuery = useQuery(equipementsQueries.list(siteId))
  const modelesQuery = useQuery(modelesEquipementsQueries.list(siteId))
  // Mises à jour live (équipements ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('equipements', equipementsQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())

  const del = useDeleteEquipement()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Action « ajouter » de la top bar, PILOTÉE par l'onglet actif de la fiche
  // équipement (EquipementDetail → useTabAddAction) : Lier des gammes /
  // Rattacher un document selon l'onglet. Même patron que gammes-explorer.
  const [equipAddConfig, setEquipAddConfig] = useState<TabAddConfig | null>(
    null,
  )
  const [equipActionApi] = useState<TabActionApi>(() => ({
    setAction: setEquipAddConfig,
  }))

  // Catégories de PARC du site actif (scope 'parc', taxonomie DÉDIÉE aux
  // équipements réels — séparée des catégories de modèles depuis 028), actives.
  const equipmentCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && c.scope === 'parc' && c.site_id === siteId,
      ),
    [categoriesQuery.data, siteId],
  )
  // Accès rapide à la catégorie COMPLÈTE (pour l'édition via le formulaire).
  const categoriesById = useMemo(
    () => new Map(equipmentCats.map((c) => [c.id, c])),
    [equipmentCats],
  )

  const equipements = useMemo(
    () => equipementsQuery.data ?? [],
    [equipementsQuery.data],
  )

  // Projection des catégories réelles + fabrique du bac virtuel « Non classé »
  // (avec le champ `modeleId` propre au parc), consommées par `useCatalogueDrill`.
  const realCats = useMemo<DrillCat[]>(
    () =>
      equipmentCats.map((c) => ({
        id: c.id,
        nom: c.nom,
        parent_id: c.parent_id,
        site_id: c.site_id,
        description: c.description,
        miniature_id: c.miniature_id,
        ordre: c.ordre,
        modeleId: c.modele_equipement_id,
        virtual: false,
      })),
    [equipmentCats],
  )
  const makeVirtual = useCallback<() => DrillCat>(
    () => ({
      id: NON_CLASSE_ID,
      nom: 'Non classé',
      parent_id: null,
      site_id: siteId,
      description: 'Équipements sans catégorie',
      miniature_id: null,
      // Toujours en DERNIER dans la liste des catégories racine.
      ordre: Number.MAX_SAFE_INTEGER,
      modeleId: null,
      virtual: true,
    }),
    [siteId],
  )

  const {
    path,
    current,
    depth,
    childCategories,
    goTo,
    itemsInCurrent: equipementsInCurrent,
    openItem: openEquipement,
    goToItem: goToEquipement,
  } = useCatalogueDrill<Equipement, DrillCat>({
    realCats,
    makeVirtual,
    items: equipements,
    getItemId: equipementId,
    getItemNom: equipementNom,
    getCategorieId: equipementCategorieId,
    useDrill: useEquipementsDrill,
  })

  // --- Dialogs ---
  const catDialog = useEntityDialog<Categorie>()
  // Sous-catégorie : formulaire UNIQUE création + édition. `categorie` null +
  // `parentId` → création sous ce parent ; `categorie` → édition de cette sous-cat.
  const [subcatForm, setSubcatForm] = useState<{
    open: boolean
    parentId: string | null
    categorie: Categorie | null
  }>({ open: false, parentId: null, categorie: null })
  // Formulaire équipement UNIQUE (create + edit) : eq = null → création.
  const [equipForm, setEquipForm] = useState<{
    open: boolean
    eq: Equipement | null
  }>({ open: false, eq: null })
  const [importCsvOpen, setImportCsvOpen] = useState(false)
  const suppression = useConfirmDelete<Equipement>({
    onDelete: async (e) => {
      if (e.id) await del.mutateAsync(e.id)
    },
    successMessage: 'Équipement supprimé',
  })
  // Mode sélection multiple : масque tout le temps sauf activation explicite
  // (bouton « Sélectionner ») — cf. échange PO, « simple sans surcharger
  // l'interface ». `selectedIds` vide en dehors du mode, jamais affichée.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const quitterSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])
  // Suppression GROUPÉE : même mutation unitaire que la suppression simple,
  // en parallèle. `Promise.allSettled` (pas `all`) : un refus isolé (ex.
  // équipement rattaché à une gamme) ne doit pas faire échouer tout le lot
  // ni laisser l'utilisateur sans retour sur ce qui a réellement été fait.
  const suppressionGroupee = useConfirmDelete<Equipement[]>({
    onDelete: async (items) => {
      const avecId = items.filter(
        (e): e is Equipement & { id: string } => e.id !== null,
      )
      const resultats = await Promise.allSettled(
        avecId.map((e) => del.mutateAsync(e.id)),
      )
      const echecs = resultats.filter((r) => r.status === 'rejected')
      if (echecs.length > 0) {
        throw new Error(
          `${String(items.length - echecs.length)} supprimé(s), ${String(echecs.length)} refusé(s) (probablement rattaché(s) à une gamme).`,
        )
      }
    },
    successMessage: (items) =>
      `${String(items.length)} équipement${items.length > 1 ? 's' : ''} supprimé${items.length > 1 ? 's' : ''}`,
    errorMessage: (e) =>
      e instanceof Error ? e.message : deleteErrorMessage(e),
    onSuccess: quitterSelection,
  })
  const [toDeleteCategorie, setToDeleteCategorie] = useState<DrillCat | null>(
    null,
  )

  // Une catégorie réelle de site est gérable par le rôle métier ; le bac virtuel
  // « Non classé » ne l'est jamais.
  const canManageCat = useCallback(
    (c: DrillCat) =>
      !c.virtual && canEdit && (canEntreprise || c.site_id !== null),
    [canEdit, canEntreprise],
  )

  // « Créer depuis un modèle » ne propose QUE les modèles DU SITE. Un modèle
  // commun doit d'abord être exporté vers le site depuis la Bibliothèque.
  const modeleOptions = useMemo(
    () =>
      (modelesQuery.data ?? [])
        .filter((m) => m.site_id === siteId)
        .map((m) => ({
          id: m.id,
          nom: m.nom,
          champs: parseChamps(m.specifications),
        })),
    [modelesQuery.data, siteId],
  )

  // Gabarit hérité par un équipement créé dans la sous-catégorie courante :
  // caractéristiques + image. Source = le MODÈLE fixé, sinon le gabarit
  // « spécifique » local de la sous-catégorie. `null` hors sous-catégorie.
  const currentTemplate = useMemo(() => {
    if (!current || current.virtual) return null
    const cat = categoriesById.get(current.id)
    if (!cat) return null
    if (current.modeleId) {
      const m = (modelesQuery.data ?? []).find((x) => x.id === current.modeleId)
      return {
        champs: parseChamps(m?.specifications),
        miniatureId: m?.miniature_id ?? null,
        modeleId: current.modeleId,
      }
    }
    return {
      champs: parseChamps(cat.specifications),
      miniatureId: cat.miniature_id ?? null,
      modeleId: null,
    }
  }, [current, categoriesById, modelesQuery.data])

  // La base BLOQUE la suppression d'une catégorie NON VIDE (sous-catégorie ou
  // équipement rattaché). Pré-calcul pour adapter le message et désactiver.
  const categorieABloquer = toDeleteCategorie
  const categorieEnfants = {
    sousCategories:
      categorieABloquer !== null &&
      equipmentCats.some((c) => c.parent_id === categorieABloquer.id),
    contenus:
      categorieABloquer !== null &&
      equipements.some((e) => e.categorie_id === categorieABloquer.id),
    labelContenu: 'équipements',
  }

  // Catégories racines (parent candidat à l'édition).
  const parentCandidates = useMemo(
    () => equipmentCats.filter((c) => c.parent_id === null),
    [equipmentCats],
  )

  // --- En-tête : titre de page (racine) ou fil d'Ariane (descente) + actions. ---
  const isVirtualCurrent = current?.virtual ?? false
  // Création d'une CATÉGORIE racine (à la racine) ou d'une SOUS-catégorie (dans une
  // catégorie, niveau 1 → niveau 2 ; pas au-delà : 2 niveaux max, comme les gammes).
  // Boutons d'action ICÔNE SEULE + tooltip (comme la barre de la Bibliothèque).
  const newCategoryBtn = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle catégorie"
      variant="outline"
      onClick={catDialog.openCreate}
    />
  ) : null
  const canCreateSubcat = canEdit && depth === 1 && !isVirtualCurrent
  const newSubCategoryBtn = canCreateSubcat ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle sous-catégorie"
      variant="outline"
      onClick={() =>
        setSubcatForm({
          open: true,
          parentId: current?.id ?? null,
          categorie: null,
        })
      }
    />
  ) : null
  // Création d'équipement UNIQUEMENT dans une SOUS-catégorie (niveau ≥2) — chemin
  // strict catégorie → sous-catégorie → équipement. Au niveau 1 (une catégorie),
  // on ne crée QUE des sous-catégories ; jamais d'équipement.
  const canCreateEquipHere = canEdit && depth >= 2 && !isVirtualCurrent
  const newEquipBtn = canCreateEquipHere ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvel équipement"
      variant="outline"
      // L'équipement hérite du gabarit de la sous-catégorie (modèle OU spécifique) :
      // formulaire épuré (nom + emplacement + caractéristiques). eq null = création.
      onClick={() => setEquipForm({ open: true, eq: null })}
    />
  ) : null
  // Import en masse (CSV généré via IA générative) : même gabarit que la
  // création manuelle, réservé à une sous-catégorie déjà existante.
  const importCsvBtn = canCreateEquipHere ? (
    <TooltipIconButton
      icon={<Upload />}
      label="Importer un CSV"
      variant="outline"
      onClick={() => setImportCsvOpen(true)}
    />
  ) : null
  // Sélection multiple : un SEUL bouton en permanence — le reste (cases à
  // cocher, barre d'action groupée) n'existe que le temps du mode, jamais
  // visible par défaut (retour PO : rester simple, ne pas surcharger l'écran).
  const selectBtn = canCreateEquipHere ? (
    <TooltipIconButton
      icon={<SquareCheck />}
      label="Sélectionner"
      variant="outline"
      onClick={() => setSelectionMode(true)}
    />
  ) : null
  const selectedEquipements = equipementsInCurrent.filter(
    (eq) => eq.id !== null && selectedIds.has(eq.id),
  )
  const idsAvecId = equipementsInCurrent
    .map((eq) => eq.id)
    .filter((id): id is string => id !== null)
  const tousSelectionnes =
    idsAvecId.length > 0 && idsAvecId.every((id) => selectedIds.has(id))
  const selectionBar = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          setSelectedIds(tousSelectionnes ? new Set() : new Set(idsAvecId))
        }
      >
        {tousSelectionnes ? 'Tout désélectionner' : 'Tout sélectionner'}
      </Button>
      <span className="text-sm text-muted-foreground">
        {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
      </span>
      <TooltipIconButton
        icon={<Trash2 />}
        label="Supprimer la sélection"
        variant="outline"
        disabled={selectedEquipements.length === 0}
        onClick={() => suppressionGroupee.demander(selectedEquipements)}
      />
      <TooltipIconButton
        icon={<X />}
        label="Annuler la sélection"
        variant="outline"
        onClick={quitterSelection}
      />
    </div>
  )
  // Édition de la sous-catégorie courante (nom, description, image, gabarit) via le
  // MÊME formulaire que la création. Disponible dès qu'on est DANS une sous-catégorie.
  const editSubcatBtn =
    canCreateEquipHere && current && !current.virtual ? (
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier la sous-catégorie"
        variant="outline"
        onClick={() =>
          setSubcatForm({
            open: true,
            parentId: current.parent_id,
            categorie: categoriesById.get(current.id) ?? null,
          })
        }
      />
    ) : null
  const editEquipBtn =
    canEdit && openEquipement !== null ? (
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier"
        variant="outline"
        onClick={() => setEquipForm({ open: true, eq: openEquipement })}
      />
    ) : null
  // Bouton d'ajout DYNAMIQUE de la fiche équipement (Lier des gammes /
  // Rattacher un document selon l'onglet actif), enregistré par
  // EquipementDetail via useTabAddAction — même patron que gammes-explorer.
  const EquipAddIcon = equipAddConfig?.icon ?? Plus
  const equipAddBtn =
    equipAddConfig?.action != null ? (
      <TooltipIconButton
        icon={<EquipAddIcon />}
        label={equipAddConfig.label}
        variant="outline"
        onClick={equipAddConfig.action}
      />
    ) : null

  // Description de SECTION, affichée à toutes les profondeurs (le fil-titre situe
  // précisément, la description rappelle ce qu'est la page) → zone jamais vide.
  const sectionDescription = 'Parc matériel du site, rangé par catégorie.'

  // Un équipement ouvert est une FEUILLE : ses ancêtres sont tout le chemin.
  // Dans une catégorie, le dernier segment devient le titre, d'où le `slice`.
  const racine = { label: 'Équipements', onClick: () => goTo([]) }
  const ancetres =
    openEquipement !== null
      ? drillCrumbs(path, goTo, racine)
      : depth > 0
        ? drillCrumbs(path.slice(0, -1), goTo, racine)
        : []

  const header = (
    <DrillPageHeader
      titreRacine="Équipements"
      ancetres={ancetres}
      titre={
        openEquipement !== null
          ? titreAffiche(openEquipement)
          : (current?.nom ?? 'Catégorie')
      }
      titreBadges={
        openEquipement !== null &&
        (secondaireAffiche(openEquipement) ||
          tertiaireAffiche(openEquipement)) ? (
          <EquipementBadges
            secondaire={secondaireAffiche(openEquipement)}
            tertiaire={tertiaireAffiche(openEquipement)}
          />
        ) : undefined
      }
      description={sectionDescription}
      action={
        openEquipement !== null ? (
          <>
            {editEquipBtn}
            {equipAddBtn}
          </>
        ) : depth > 0 ? (
          selectionMode ? (
            selectionBar
          ) : (
            <>
              {newSubCategoryBtn}
              {editSubcatBtn}
              {newEquipBtn}
              {importCsvBtn}
              {selectBtn}
            </>
          )
        ) : (
          (newCategoryBtn ?? undefined)
        )
      }
    />
  )

  const dialogs = (
    <>
      {canEdit && (
        <CategoryFormDialog
          key={catDialog.dialogKey}
          open={catDialog.open}
          onOpenChange={catDialog.onOpenChange}
          categorie={catDialog.entity}
          // Catégorie RACINE de parc (les sous-catégories passent par leur propre
          // dialog avec modèle fixé).
          preset={{ scope: 'parc' }}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          // Édition comme création : une catégorie de parc appartient TOUJOURS au
          // site actif → on passe le vrai siteId. Un null en édition rebasculerait
          // la catégorie en « commun » à l'enregistrement (site_id=null) et
          // orphelinerait tous ses équipements.
          siteId={siteId}
          siteName={null}
          // Création depuis cette page = catégorie DU SITE actif (portée verrouillée).
          lockedScope={
            catDialog.entity ? undefined : { portee: 'site', siteId }
          }
          minimal
          // Scope 'parc' imposé : jamais proposé/modifiable dans le formulaire.
          hideScope
          // Parc = toujours rattaché au site : pas de « Portée » (ni à la création
          // ni à l'édition, où elle réapparaissait à tort avec une option Commun).
          hidePortee
        />
      )}

      {canEdit && (
        <ParcSousCategorieDialog
          key={`subcat-${subcatForm.categorie?.id ?? subcatForm.parentId ?? 'none'}-${String(subcatForm.open)}`}
          open={subcatForm.open}
          onOpenChange={(open) => setSubcatForm((f) => ({ ...f, open }))}
          siteId={siteId}
          parentId={
            subcatForm.categorie?.parent_id ?? subcatForm.parentId ?? ''
          }
          modeles={modeleOptions}
          categorie={subcatForm.categorie}
          // Équipements de la sous-catégorie éditée : propagation d'un gabarit
          // spécifique modifié (valeurs déjà saisies conservées par clé).
          equipements={
            subcatForm.categorie
              ? equipements
                  .filter(
                    (e) =>
                      e.id !== null &&
                      e.categorie_id === subcatForm.categorie!.id,
                  )
                  .map((e) => ({ id: e.id!, specifications: e.specifications }))
              : []
          }
        />
      )}

      {/* Formulaire UNIQUE création + édition d'un équipement (épuré, hérité).
          eq null = création. Monté dès qu'un template existe (création dans une
          sous-catégorie) OU qu'un équipement est ciblé pour ÉDITION — y compris un
          orphelin du bac « Non classé » (currentTemplate null) : en édition le
          template ne sert pas (les champs viennent de equipement.specifications). */}
      {canEdit && (currentTemplate ?? equipForm.eq) && (
        <EquipementParcDialog
          key={`equip-${current?.id ?? 'root'}-${equipForm.eq?.id ?? 'new'}-${String(equipForm.open)}`}
          open={equipForm.open}
          onOpenChange={(open) => setEquipForm((f) => ({ ...f, open }))}
          siteId={siteId}
          categorieId={current?.id ?? ''}
          template={
            currentTemplate ?? {
              champs: [],
              miniatureId: null,
              modeleId: null,
            }
          }
          equipement={equipForm.eq}
        />
      )}

      {/* Import en masse (CSV) : réservé à une sous-catégorie EXISTANTE avec
          un gabarit résolu — pas de repli comme EquipementParcDialog, pas de
          sens de générer un prompt sans caractéristiques ciblées. */}
      {canEdit && current && !current.virtual && currentTemplate && (
        <ImportCsvDialog
          open={importCsvOpen}
          onOpenChange={setImportCsvOpen}
          siteId={siteId}
          categorieId={current.id}
          sousCategorieNom={current.nom}
          template={currentTemplate}
          champPrincipalCle={
            categoriesById.get(current.id)?.valeur_principale ?? null
          }
          equipementsExistants={equipements.filter(
            (e) => e.categorie_id === current.id,
          )}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={`l’équipement « ${suppression.toDelete ? nomAfficheTexte(suppression.toDelete) : ''} »`}
        // Le backend refuse la suppression d'un équipement rattaché à une gamme
        // active (FK/trigger). Cette info n'est pas chargée ici → on prévient en
        // amont ; l'erreur 23503/42501 reste catchée en filet (toast onError).
        warning="Si cet équipement est rattaché à une ou plusieurs gammes, la suppression sera refusée : détache-le d’abord."
      />

      <ConfirmDeleteDialog
        {...suppressionGroupee.dialogProps}
        entityLabel={`${String(suppressionGroupee.toDelete?.length ?? 0)} équipement${(suppressionGroupee.toDelete?.length ?? 0) > 1 ? 's' : ''}`}
        impactsTitle="Équipements concernés :"
        impacts={(suppressionGroupee.toDelete ?? []).map((e) =>
          nomAfficheTexte(e),
        )}
        warning="Si l'un de ces équipements est rattaché à une ou plusieurs gammes, sa suppression sera refusée (les autres seront tout de même supprimés) : détache-le d'abord."
      />

      <ConfirmDeleteCategorieDialog
        categorie={toDeleteCategorie}
        onClose={() => setToDeleteCategorie(null)}
        enfants={categorieEnfants}
      />
    </>
  )

  // VUE DÉTAIL : un équipement ouvert. `EquipementDetail` pose désormais sa
  // PROPRE coquille à onglets (DetailTabsShell) — comme `GammeDetail` — donc
  // pas de `ScrollBody` ici, juste l'en-tête fixe. Le Provider permet à
  // l'onglet actif d'enregistrer son action « ajouter », rendue dans la top bar
  // (même patron que gammes-explorer).
  if (openEquipement !== null) {
    return (
      <TabActionContext.Provider value={equipActionApi}>
        <div className="flex min-h-0 flex-1 flex-col">
          <FillHeader>{header}</FillHeader>
          <EquipementDetail
            equipement={openEquipement}
            siteId={siteId}
            canEdit={canEdit}
          />
        </div>
        {dialogs}
      </TabActionContext.Provider>
    )
  }

  const emptyHere =
    childCategories.length === 0 &&
    (current === null || equipementsInCurrent.length === 0)

  // En-tête FIXE + corps DÉFILANT via les briques (mode `fill`), comme
  // localisations-explorer et gammes-explorer. Cet explorateur rendait son
  // en-tête nu : il partait donc au défilement, seul des trois.
  return (
    <>
      <FillHeader>{header}</FillHeader>
      <ScrollBody>
        {/* Pas de prop `empty` : on ne court-circuite PAS sur le vide du pool
            global de catégories. Sinon, un site sans catégorie de parc MAIS avec
            des équipements orphelins (import legacy) afficherait « Aucune
            catégorie » et masquerait le bac « Non classé ». La branche interne
            `emptyHere` gère l'état vide en tenant compte des orphelins. */}
        <QueryState
          query={categoriesQuery}
          pending={<ListRowSkeletons count={4} />}
        >
          {() => {
            if (equipementsQuery.isPending)
              return <ListRowSkeletons count={4} />
            if (equipementsQuery.isError) {
              return (
                <ErrorState onRetry={() => void equipementsQuery.refetch()} />
              )
            }
            if (emptyHere) {
              // Niveau 0 : catégories ; niveau 1 : sous-catégories ; niveau ≥2
              // (sous-catégorie) : équipements. Message adapté au palier.
              const isSubcatLevel = depth >= 2 || isVirtualCurrent
              return (
                <EmptyState
                  icon={isSubcatLevel ? Package : FolderTree}
                  title={
                    depth === 0
                      ? 'Aucune catégorie'
                      : depth === 1
                        ? 'Catégorie vide'
                        : 'Sous-catégorie vide'
                  }
                  description={
                    depth === 0
                      ? canEdit
                        ? 'Crée une première catégorie avec le bouton « Nouvelle catégorie ».'
                        : 'Aucune catégorie pour le moment.'
                      : depth === 1
                        ? canCreateSubcat
                          ? 'Crée une sous-catégorie avec le bouton « Nouvelle sous-catégorie ».'
                          : 'Aucune sous-catégorie.'
                        : canCreateEquipHere
                          ? 'Ajoute un équipement avec les boutons ci-dessus.'
                          : 'Aucun équipement dans cette sous-catégorie.'
                  }
                />
              )
            }
            return (
              <div className="flex flex-col gap-6">
                {childCategories.length > 0 && (
                  <div className={listStack}>
                    {childCategories.map((cat) => (
                      <ListRow
                        key={cat.id}
                        media={
                          <MiniatureThumb
                            url={cat.virtual ? null : urlOf(cat.miniature_id)}
                            fallback={
                              cat.virtual ? (
                                <Inbox className="size-10" />
                              ) : (
                                <Folder className="size-10" />
                              )
                            }
                            alt=""
                            onError={refreshMiniatures}
                            className="size-full rounded-none"
                          />
                        }
                        title={cat.nom}
                        subtitle={
                          cat.description?.trim()
                            ? cat.description.trim()
                            : undefined
                        }
                        badges={
                          cat.virtual ? undefined : (
                            <ScopeBadges siteId={cat.site_id} />
                          )
                        }
                        mobileMeta={
                          cat.virtual ? undefined : (
                            <ScopeBadges siteId={cat.site_id} />
                          )
                        }
                        onClick={() => goTo([...path, cat])}
                        menuActions={
                          canManageCat(cat)
                            ? actionsEditionSuppression({
                                onModifier: () => {
                                  const full = categoriesById.get(cat.id)
                                  // `cat` vient d'une catégorie réelle → `full`
                                  // existe toujours (garde défensive).
                                  if (!full) return
                                  // Sous-catégorie (parent) → formulaire unifié de
                                  // sous-catégorie ; catégorie racine → form catégorie.
                                  if (full.parent_id) {
                                    setSubcatForm({
                                      open: true,
                                      parentId: full.parent_id,
                                      categorie: full,
                                    })
                                  } else {
                                    catDialog.openEdit(full)
                                  }
                                },
                                onSupprimer: () => setToDeleteCategorie(cat),
                              })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {equipementsInCurrent.length > 0 && (
                  <div className={listStack}>
                    {equipementsInCurrent.map((eq) => (
                      <ListRow
                        key={eq.id}
                        media={
                          selectionMode ? (
                            <CaseSelection
                              selected={
                                eq.id !== null && selectedIds.has(eq.id)
                              }
                            />
                          ) : (
                            <MiniatureThumb
                              url={urlOf(eq.miniature_id)}
                              fallback={<Package className="size-10" />}
                              alt=""
                              onError={refreshMiniatures}
                              className="size-full rounded-none"
                            />
                          )
                        }
                        title={titreAffiche(eq)}
                        subtitle={
                          eq.localisation_courte ?? eq.local_nom ?? undefined
                        }
                        badges={
                          !selectionMode &&
                          (secondaireAffiche(eq) || tertiaireAffiche(eq)) ? (
                            <EquipementBadges
                              secondaire={secondaireAffiche(eq)}
                              tertiaire={tertiaireAffiche(eq)}
                            />
                          ) : undefined
                        }
                        onClick={() =>
                          selectionMode
                            ? eq.id !== null && toggleSelection(eq.id)
                            : goToEquipement(eq)
                        }
                        menuActions={
                          canEdit && !selectionMode
                            ? actionsEditionSuppression({
                                onModifier: () =>
                                  setEquipForm({ open: true, eq }),
                                onSupprimer: () => suppression.demander(eq),
                              })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          }}
        </QueryState>
      </ScrollBody>

      {dialogs}
    </>
  )
}
