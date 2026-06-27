import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { typesDocumentsQueries } from '../queries'
import { MIME_AUTORISES, validerFichier } from '../upload'
import { formatMime, formatTaille } from '../format'
import {
  splitExtension,
  suggestDocumentName,
  type DocumentNamingContext,
} from '../naming'
import { useAuth } from '@/auth'
import { FormDialog } from '@/components/common/form-dialog'
import { FileDropField } from '@/components/common/file-drop-field'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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

/**
 * Dialogue d'upload réutilisable, MULTI-FICHIERS : zone de dépôt toujours
 * visible + liste des fichiers, chacun avec son type de document. Valide chaque
 * fichier (format/taille) et téléverse le lot. Aucun état métier hors de l'écran.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  title = 'Ajouter des documents',
  description = 'PDF ou image, 20 Mo maximum par fichier.',
  onUpload,
  pending,
  acceptedMimes = MIME_AUTORISES,
  initialFiles,
  defaultTypeNom,
  namingContext,
}: UploadDocumentDialogProps) {
  const { session } = useAuth()
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())

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
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, typeId } : i)),
    )
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
          file: fichierAEnvoyer(i),
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
      contentClassName="sm:max-w-2xl"
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
              className="bg-card flex flex-col gap-3 rounded-lg border p-3"
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
                  className="text-muted-foreground hover:text-foreground size-8 shrink-0"
                  aria-label={`Retirer ${item.file.name}`}
                  onClick={() => retirer(item.key)}
                >
                  <X />
                </Button>
              </div>
              {/* Ligne 2 : type (s'étire) + taille à droite (alignée sous la croix). */}
              <div className="flex items-center gap-2.5">
                <Select
                  aria-label={`Type de ${item.file.name}`}
                  value={typeEffectif(item)}
                  onChange={(e) => changerType(item.key, e.target.value)}
                  className="min-w-0 flex-1"
                >
                  <option value="">Type…</option>
                  {types.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.nom}
                    </option>
                  ))}
                </Select>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatTaille(item.file.size)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </FormDialog>
  )
}
