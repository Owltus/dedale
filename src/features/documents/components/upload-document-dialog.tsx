import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { typesDocumentsQueries, documentsQueries } from '../queries'
import { MIME_AUTORISES, validerFichier } from '../upload'
import { formatMime, formatTaille } from '../format'
import {
  splitExtension,
  suggestDocumentName,
  type DocumentNamingContext,
} from '../naming'
import { useAuth } from '@/auth'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { DialogShell } from '@/components/common/dialog-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileDropField } from '@/components/common/file-drop-field'
import { SearchInput } from '@/components/common/search-input'
import { CheckboxList } from '@/components/common/checkbox-list'
import { CheckRow } from '@/components/common/checklist-dialog'
import { NoSearchResults } from '@/components/common/no-search-results'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { iconeFormat } from '@/components/common/file-format-icons'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface UploadDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  title?: string
  description?: string
  /**
   * Réalise l'upload d'UN document (étapes a+b, et c si rattachement). Appelé
   * une fois PAR FICHIER ; doit rejeter en cas d'échec.
   */
  onUpload: (params: {
    file: File
    uploadedBy: string
    typeDocumentId: number
  }) => Promise<unknown>
  pending: boolean
  /**
   * Formats MIME acceptés (défaut : `MIME_AUTORISES` = PDF + toute image, les
   * images étant converties en WebP compressé à l'upload). Restreindre
   * pour une fiche « plus pro » — ex. `MIME_PDF` (PDF uniquement) côté
   * investissements. Pilote l'attribut `accept` du picker ET la validation.
   */
  acceptedMimes?: readonly string[]
  /**
   * Fichiers PRÉ-SÉLECTIONNÉS (ex. déposés en glisser-déposer sur la page). Lus
   * au montage et validés comme des fichiers choisis à la main. Le dialogue étant
   * remonté à chaque ouverture (`key`), un nouveau dépôt repart propre.
   */
  initialFiles?: File[]
  /**
   * Type de document PRÉ-SÉLECTIONNÉ pour chaque fichier, par NOM (ex. « Devis »).
   * Appliqué tant que l'utilisateur n'a pas choisi lui-même un type. Inconnu → ignoré.
   */
  defaultTypeNom?: string
  /**
   * Contexte de NOMMAGE (prestataire / objet / date de la fiche parente). Si
   * fourni, chaque fichier est pré-renommé avec un nom lisible et normalisé
   * « [Type] - [Prestataire] - [Objet] - [Date] » (éditable, jamais imposé), au
   * lieu de garder son nom brut. Omis → le fichier garde son nom d'origine.
   */
  namingContext?: DocumentNamingContext
  /**
   * Active l'onglet « Documents existants » (lier un document déjà en base, sans
   * upload) à côté de l'onglet « Téléverser ». Omis → dialogue mono-onglet
   * inchangé (ex. bibliothèque, où il n'y a pas d'entité à laquelle rattacher).
   */
  onAttachExisting?: (documentIds: string[]) => Promise<unknown>
  /** Envoi de la liaison en cours (désactive le bouton « Lier »). */
  attachPending?: boolean
  /** Ids des documents déjà rattachés à l'entité — exclus de l'onglet « Documents existants ». */
  linkedDocumentIds?: string[]
}

interface PendingDoc {
  /** Clé stable de liste (≠ identité métier). */
  key: string
  file: File
  /** Type choisi pour CE fichier ('' = pas encore choisi → repli sur le défaut). */
  typeId: string
  /**
   * Nom (SANS extension) saisi à la main par l'utilisateur, qui prime alors sur
   * la suggestion. `null` = pas encore touché → on affiche le nom suggéré dérivé
   * (qui se recalcule avec le type). L'extension réelle est ré-accolée à l'envoi.
   */
  nomOverride: string | null
}

type Onglet = 'televerser' | 'existants'

/**
 * Dialogue d'upload réutilisable, MULTI-FICHIERS : zone de dépôt toujours
 * visible + liste des fichiers, chacun avec son type de document. Valide chaque
 * fichier (format/taille) et téléverse le lot. Si `onAttachExisting` est fourni,
 * un second onglet « Documents existants » permet de LIER un document déjà en
 * base (bibliothèque du site + bibliothèque entreprise) sans le re-uploader.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  siteId,
  title = 'Ajouter des documents',
  description = 'PDF ou image, 20 Mo maximum par fichier.',
  onUpload,
  pending,
  acceptedMimes = MIME_AUTORISES,
  initialFiles,
  defaultTypeNom,
  namingContext,
  onAttachExisting,
  attachPending = false,
  linkedDocumentIds = [],
}: UploadDocumentDialogProps) {
  const { session } = useAuth()
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const hasExistingTab = onAttachExisting !== undefined
  const [onglet, setOnglet] = useState<Onglet>('televerser')

  // --- Onglet « Téléverser » (comportement inchangé) -----------------------

  // Trie les fichiers entrants en (valides → items) / (refusés → noms).
  const trier = (files: File[]) => {
    const items: PendingDoc[] = []
    const refuses: string[] = []
    for (const file of files) {
      if (validerFichier(file, acceptedMimes)) refuses.push(file.name)
      else
        items.push({
          key: crypto.randomUUID(),
          file,
          typeId: '',
          nomOverride: null,
        })
    }
    return { items, refuses }
  }
  const messageRefus = (noms: string[]) =>
    `Format non pris en charge, ignoré : ${noms.join(', ')}.`

  const [items, setItems] = useState<PendingDoc[]>(
    () => trier(initialFiles ?? []).items,
  )
  const [error, setError] = useState<string | null>(() => {
    const { refuses } = trier(initialFiles ?? [])
    return refuses.length ? messageRefus(refuses) : null
  })

  // Type par défaut (par nom) : dérivé du référentiel, repli par fichier tant que
  // l'utilisateur n'a pas choisi. La valeur effective = choix explicite, sinon défaut.
  const defaultTypeId = defaultTypeNom
    ? (types.find((t) => t.nom.toLowerCase() === defaultTypeNom.toLowerCase())
        ?.id ?? null)
    : null
  const defaultTypeStr = defaultTypeId !== null ? String(defaultTypeId) : ''
  const typeEffectif = (item: PendingDoc) =>
    item.typeId !== '' ? item.typeId : defaultTypeStr

  // Nom de type lisible (1er segment du nom suggéré) ; undefined si aucun type.
  const nomDuType = (typeId: string): string | undefined =>
    typeId ? types.find((t) => String(t.id) === typeId)?.nom : undefined
  // Nom suggéré DÉRIVÉ : sans contexte → nom d'origine (sans extension) ; sinon
  // « [Type] - [Prestataire] - [Objet] - [Date] ». Recalculé à chaque rendu →
  // suit automatiquement le type choisi, sans effet de bord.
  const nomSuggere = (item: PendingDoc): string =>
    namingContext
      ? suggestDocumentName(nomDuType(typeEffectif(item)), namingContext)
      : splitExtension(item.file.name).base
  // Nom affiché/édité : la saisie manuelle (override) prime, sinon la suggestion.
  const nomAffiche = (item: PendingDoc): string =>
    item.nomOverride ?? nomSuggere(item)

  const formatsHint = `${acceptedMimes.map((m) => formatMime(m)).join(' ou ')} · 20 Mo maximum`

  function ajouter(files: File[]) {
    const { items: nouveaux, refuses } = trier(files)
    if (nouveaux.length) setItems((prev) => [...prev, ...nouveaux])
    setError(refuses.length ? messageRefus(refuses) : null)
  }

  function retirer(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  function changerType(key: string, typeId: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, typeId } : i)))
  }

  function changerNom(key: string, nom: string) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, nomOverride: nom } : i)),
    )
  }

  // Fichier prêt à l'envoi : ré-accole l'extension réelle au nom affiché/édité.
  // Sans contexte de nommage et sans saisie, on garde le fichier tel quel. Un nom
  // vidé retombe sur la SUGGESTION (joli nom, pas le nom technique brut) ; en
  // dernier recours seulement, le fichier d'origine (jamais d'envoi nommé « .pdf »).
  function fichierAEnvoyer(item: PendingDoc): File {
    if (!namingContext && item.nomOverride === null) return item.file
    const base = nomAffiche(item).trim() || nomSuggere(item).trim()
    if (!base) return item.file
    const { ext } = splitExtension(item.file.name)
    return new File([item.file], `${base}${ext}`, { type: item.file.type })
  }

  async function handleUploadSubmit() {
    if (items.length === 0) {
      setError('Ajoute au moins un fichier.')
      return
    }
    if (items.some((i) => typeEffectif(i) === '')) {
      setError('Choisis un type pour chaque fichier.')
      return
    }
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    setError(null)
    const uid = session.user.id
    const resultats = await Promise.allSettled(
      items.map((i) =>
        onUpload({
          file: fichierAEnvoyer(i),
          uploadedBy: uid,
          typeDocumentId: Number(typeEffectif(i)),
        }),
      ),
    )
    const echecs = items.filter(
      (_, idx) => resultats[idx]?.status === 'rejected',
    )
    const reussis = items.length - echecs.length
    if (reussis > 0) {
      toast.success(
        reussis > 1
          ? `${String(reussis)} documents ajoutés`
          : 'Document ajouté',
      )
    }
    if (echecs.length === 0) {
      onOpenChange(false)
      return
    }
    // Échecs partiels : on garde les fichiers en échec pour réessayer. Le
    // message générique (« n'ont pas pu être ajoutés ») masquait la raison la
    // plus fréquente — 23505 sur documents_unique_hash (même contenu déjà
    // présent sur le site) — laissant croire à un bug plutôt qu'à un doublon.
    // On traduit chaque raison (dédupliquée) au lieu d'un simple décompte.
    setItems(echecs)
    const raisons = [
      ...new Set(
        resultats
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) =>
            writeErrorMessage(r.reason, {
              '23505': hasExistingTab
                ? 'Ce fichier existe déjà dans la bibliothèque du site (même contenu) — utilise l’onglet « Documents existants » pour le rattacher au lieu de le téléverser à nouveau.'
                : 'Ce fichier existe déjà dans la bibliothèque du site (même contenu).',
            }),
          ),
      ),
    ]
    setError(raisons.join(' '))
  }

  const uploadContent = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="document-fichier">Fichiers *</Label>
        <FileDropField
          id="document-fichier"
          onFiles={ajouter}
          accept={acceptedMimes.join(',')}
          hint={formatsHint}
          multiple
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3"
            >
              {/* Ligne 1 : nom (pleine largeur) + croix. Champ ÉDITABLE PARTOUT
                  (cœur réutilisable) : avec contexte → nom suggéré « [Type] - … » ;
                  sans contexte → nom d'origine (sans extension), toujours modifiable.
                  L'extension réelle est ré-accolée à l'envoi. */}
              <div className="flex items-center gap-2.5">
                <Input
                  aria-label={`Nom de ${item.file.name}`}
                  value={nomAffiche(item)}
                  onChange={(e) => changerNom(item.key, e.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Retirer ${item.file.name}`}
                  onClick={() => retirer(item.key)}
                >
                  <X />
                </Button>
              </div>
              {/* Ligne 2 : type (s'étire) + taille à droite (alignée sous la croix). */}
              <div className="flex items-center gap-2.5">
                <SelectDropdown
                  ariaLabel={`Type de ${item.file.name}`}
                  value={typeEffectif(item)}
                  onValueChange={(v) => changerType(item.key, v)}
                  options={types.map((t) => ({
                    value: String(t.id),
                    label: t.nom,
                  }))}
                  placeholder="— Choisir un type —"
                  className="min-w-0 flex-1"
                />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatTaille(item.file.size)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  )

  const uploadFooter = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={pending}
      >
        Annuler
      </Button>
      <Button type="submit" disabled={pending || items.length === 0}>
        {pending
          ? 'Envoi…'
          : items.length > 1
            ? `Ajouter (${String(items.length)})`
            : 'Ajouter'}
      </Button>
    </>
  )

  // --- Onglet « Documents existants » (lier sans upload) --------------------

  const { data: liables, isPending: liablesPending } = useQuery({
    ...documentsQueries.listLiables(siteId),
    enabled: hasExistingTab,
  })
  const [searchExistants, setSearchExistants] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const linkedSet = useMemo(
    () => new Set(linkedDocumentIds),
    [linkedDocumentIds],
  )
  // Même restriction de format que l'onglet « Téléverser » (ex. PDF seul pour
  // les investissements) : sans ce filtre, lier un document existant contournait
  // acceptedMimes.
  const candidats = useMemo(() => {
    const mimeAccepte = (mime: string) =>
      acceptedMimes.some((m) =>
        m === 'image/*' ? mime.startsWith('image/') : mime === m,
      )
    return (liables ?? []).filter(
      (doc) => !linkedSet.has(doc.id) && mimeAccepte(doc.mime_type),
    )
  }, [liables, linkedSet, acceptedMimes])
  const filtresExistants = useMemo(() => {
    const q = searchExistants.trim().toLowerCase()
    if (q === '') return candidats
    return candidats.filter((doc) => doc.nom_original.toLowerCase().includes(q))
  }, [candidats, searchExistants])

  function toggleExistant(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAttachSubmit() {
    if (selected.size === 0 || onAttachExisting === undefined) return
    try {
      await onAttachExisting([...selected])
      toast.success(
        selected.size > 1
          ? `${String(selected.size)} documents liés`
          : 'Document lié',
      )
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  let existingBody
  if (liablesPending) {
    existingBody = (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  } else if (filtresExistants.length === 0) {
    existingBody =
      candidats.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          Aucun document disponible à lier.
        </p>
      ) : (
        <NoSearchResults description="Aucun document ne correspond à ta recherche." />
      )
  } else {
    existingBody = (
      <ul className="divide-y">
        {filtresExistants.map((doc) => (
          <li key={doc.id}>
            <CheckRow
              media={<RowMediaIcon icon={iconeFormat(doc.mime_type)} />}
              titre={doc.nom_original}
              sousTitre={`${formatTaille(doc.taille_octets)} · ${formatDate(doc.uploaded_at)}`}
              badge={
                doc.site_id == null ? (
                  <Badge variant="secondary">Bibliothèque entreprise</Badge>
                ) : undefined
              }
              checked={selected.has(doc.id)}
              onToggle={() => toggleExistant(doc.id)}
            />
          </li>
        ))}
      </ul>
    )
  }

  const existingContent = (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={searchExistants}
        onChange={setSearchExistants}
        placeholder="Rechercher un document…"
        autoFocus
      />
      <CheckboxList className="rounded-md border">{existingBody}</CheckboxList>
    </div>
  )

  const existingFooter = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={attachPending}
      >
        Annuler
      </Button>
      <Button
        type="button"
        onClick={() => void handleAttachSubmit()}
        disabled={attachPending || selected.size === 0}
      >
        {attachPending ? 'Liaison…' : `Lier (${String(selected.size)})`}
      </Button>
    </>
  )

  // --- Rendu -----------------------------------------------------------------

  if (!hasExistingTab) {
    return (
      <DialogShell
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        size="lg"
        wrap={(inner) => (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void handleUploadSubmit()
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {inner}
          </form>
        )}
        footer={uploadFooter}
      >
        {uploadContent}
      </DialogShell>
    )
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="lg"
      wrap={(inner) =>
        onglet === 'televerser' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void handleUploadSubmit()
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {inner}
          </form>
        ) : (
          inner
        )
      }
      footer={onglet === 'televerser' ? uploadFooter : existingFooter}
    >
      <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
        <TabsList className="w-full">
          <TabsTrigger value="televerser">
            <Upload className="size-4" /> Téléverser
          </TabsTrigger>
          <TabsTrigger value="existants">
            <Library className="size-4" /> Documents existants
          </TabsTrigger>
        </TabsList>
        <TabsContent value="televerser" className="flex flex-col gap-4">
          {uploadContent}
        </TabsContent>
        <TabsContent value="existants">{existingContent}</TabsContent>
      </Tabs>
    </DialogShell>
  )
}
