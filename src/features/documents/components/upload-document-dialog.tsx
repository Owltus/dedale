import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { typesDocumentsQueries } from '../queries'
import { MIME_AUTORISES, validerFichier } from '../upload'
import { formatMime, formatTaille } from '../format'
import { useAuth } from '@/auth'
import { FormDialog } from '@/components/common/form-dialog'
import { FileDropField } from '@/components/common/file-drop-field'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

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
   * Formats MIME acceptés (défaut : `MIME_AUTORISES` = PDF + WebP). Restreindre
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
}

interface PendingDoc {
  /** Clé stable de liste (≠ identité métier). */
  key: string
  file: File
  /** Type choisi pour CE fichier ('' = pas encore choisi → repli sur le défaut). */
  typeId: string
}

/**
 * Dialogue d'upload réutilisable, MULTI-FICHIERS : zone de dépôt toujours
 * visible + liste des fichiers, chacun avec son type de document. Valide chaque
 * fichier (format/taille) et téléverse le lot. Aucun état métier hors de l'écran.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  title = 'Ajouter des documents',
  description = 'PDF ou WebP, 20 Mo maximum par fichier.',
  onUpload,
  pending,
  acceptedMimes = MIME_AUTORISES,
  initialFiles,
  defaultTypeNom,
}: UploadDocumentDialogProps) {
  const { session } = useAuth()
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())

  // Trie les fichiers entrants en (valides → items) / (refusés → noms).
  const trier = (files: File[]) => {
    const items: PendingDoc[] = []
    const refuses: string[] = []
    for (const file of files) {
      if (validerFichier(file, acceptedMimes)) refuses.push(file.name)
      else items.push({ key: crypto.randomUUID(), file, typeId: '' })
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
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, typeId } : i)),
    )
  }

  async function handleSubmit() {
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
          file: i.file,
          uploadedBy: uid,
          typeDocumentId: Number(typeEffectif(i)),
        }),
      ),
    )
    const echecs = items.filter((_, idx) => resultats[idx]?.status === 'rejected')
    const reussis = items.length - echecs.length
    if (reussis > 0) {
      toast.success(
        reussis > 1 ? `${String(reussis)} documents ajoutés` : 'Document ajouté',
      )
    }
    if (echecs.length === 0) {
      onOpenChange(false)
      return
    }
    // Échecs partiels : on garde les fichiers en échec pour réessayer.
    setItems(echecs)
    setError(`${String(echecs.length)} document(s) n'ont pas pu être ajoutés.`)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={() => void handleSubmit()}
      submitLabel={items.length > 1 ? `Ajouter (${String(items.length)})` : 'Ajouter'}
      pendingLabel="Envoi…"
      pending={pending}
      submitDisabled={items.length === 0}
    >
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
              className="bg-card flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatTaille(item.file.size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  aria-label={`Type de ${item.file.name}`}
                  value={typeEffectif(item)}
                  onChange={(e) => changerType(item.key, e.target.value)}
                  className="w-full sm:w-44"
                >
                  <option value="">Type…</option>
                  {types.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.nom}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Retirer ${item.file.name}`}
                  onClick={() => retirer(item.key)}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </FormDialog>
  )
}
