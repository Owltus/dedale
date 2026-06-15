import { useState } from 'react'
import { Pencil, Plus, SlidersHorizontal, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateParcSousCategorie } from '../mutations'
import { ChampFormDialog } from '@/features/modeles-equipements/components/champ-form-dialog'
import {
  CHAMP_TYPES,
  formatChampValeur,
  prepareChamps,
  serializeChamps,
  type Champ,
} from '@/lib/champs'
import { errorMessage } from '@/lib/form'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listStack } from '@/lib/responsive'

interface ParcSousCategorieDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Catégorie parente (niveau 1) sous laquelle créer la sous-catégorie. */
  parentId: string
  /** Modèles DU SITE proposés (un modèle commun doit d'abord être exporté). */
  modeles: { id: string; nom: string }[]
}

// Sous-titre lisible d'un champ (calque de la page de détail d'un modèle).
function champResume(c: Champ): string {
  const parts: string[] = [
    CHAMP_TYPES.find((t) => t.value === c.type)?.label ?? c.type,
  ]
  if (c.type === 'nombre' && c.unite) parts.push(c.unite)
  if (c.defaut !== null && c.defaut !== '') {
    parts.push(`défaut : ${formatChampValeur(c, c.defaut)}`)
  }
  return parts.join(' · ')
}

/**
 * Création d'une SOUS-catégorie de parc : un vrai formulaire (nom, description,
 * image) + le GABARIT dont hériteront ses équipements :
 * - « Spécifique » (défaut) → on définit les caractéristiques ICI (comme un modèle,
 *   mais local : rien ne va dans la Bibliothèque) ;
 * - un MODÈLE du site → les équipements en seront des copies.
 */
export function ParcSousCategorieDialog({
  open,
  onOpenChange,
  siteId,
  parentId,
  modeles,
}: ParcSousCategorieDialogProps) {
  const create = useCreateParcSousCategorie()
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [miniatureId, setMiniatureId] = useState<string | null>(null)
  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site.
  const [modeleId, setModeleId] = useState('')
  const [champs, setChamps] = useState<Champ[]>([])
  const [champForm, setChampForm] = useState<{
    open: boolean
    champ: Champ | null
  }>({ open: false, champ: null })
  const [toDeleteChamp, setToDeleteChamp] = useState<Champ | null>(null)
  const [errors, setErrors] = useState<{ nom?: string }>({})

  const specifique = modeleId === ''

  function handleSubmitChamp(champ: Champ) {
    const original = champForm.champ
    const editing =
      original !== null && champs.some((c) => c.cle === original.cle)
    setChamps(
      editing
        ? champs.map((c) => (c.cle === original.cle ? champ : c))
        : [...champs, champ],
    )
    setChampForm({ open: false, champ: null })
  }

  function confirmDeleteChamp() {
    if (!toDeleteChamp) return
    setChamps(champs.filter((c) => c.cle !== toDeleteChamp.cle))
    setToDeleteChamp(null)
  }

  // Noms des AUTRES champs (refus de doublon dans le modal de champ).
  const existingCles = champs
    .filter((c) => c.cle !== champForm.champ?.cle)
    .map((c) => c.cle.toLowerCase())

  async function handleSubmit() {
    if (!nom.trim()) {
      setErrors({ nom: 'Le nom est obligatoire' })
      return
    }
    setErrors({})

    let specifications: { champs: Champ[] } | null = null
    let chosenModele: string | null = null
    if (specifique) {
      const prepared = prepareChamps(champs)
      if (!prepared.ok) {
        toast.error(prepared.error)
        return
      }
      specifications = serializeChamps(prepared.champs)
    } else {
      chosenModele = modeleId
    }

    try {
      await create.mutateAsync({
        nom,
        parentId,
        siteId,
        description,
        miniatureId,
        modeleId: chosenModele,
        specifications,
      })
      toast.success('Sous-catégorie créée')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle sous-catégorie"
      description="Définis le gabarit dont hériteront tous les équipements de cette sous-catégorie."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
      contentClassName="sm:max-w-2xl"
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
      />
      <MiniatureField
        value={miniatureId}
        onChange={setMiniatureId}
        targetSiteId={siteId}
        canUpload
      />

      <SelectField
        label="Gabarit des équipements"
        id="parc_subcat_source"
        value={modeleId}
        onChange={setModeleId}
      >
        <option value="">Spécifique (définir les caractéristiques ici)</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            Modèle : {m.nom}
          </option>
        ))}
      </SelectField>

      {specifique && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="text-muted-foreground size-4" />
              Caractéristiques
            </span>
            <TooltipIconButton
              icon={<Plus />}
              label="Ajouter un champ"
              onClick={() => setChampForm({ open: true, champ: null })}
            />
          </div>
          {champs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ;
              les équipements de cette sous-catégorie en hériteront.
            </p>
          ) : (
            <div className={listStack}>
              {champs.map((c) => (
                <ListRow
                  key={c.cle}
                  icon={<Tag className="size-5" />}
                  title={c.cle}
                  subtitle={champResume(c)}
                  hideChevron
                  badges={
                    c.requis ? (
                      <Badge variant="outline">Obligatoire</Badge>
                    ) : undefined
                  }
                  onClick={() => setChampForm({ open: true, champ: c })}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Modifier le champ"
                        onClick={() => setChampForm({ open: true, champ: c })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer le champ"
                        onClick={() => setToDeleteChamp(c)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ChampFormDialog
        key={`${champForm.champ?.cle ?? 'new'}-${String(champForm.open)}`}
        open={champForm.open}
        onOpenChange={(o) => setChampForm((f) => ({ ...f, open: o }))}
        champ={champForm.champ}
        existingCles={existingCles}
        onSubmit={handleSubmitChamp}
        pending={false}
      />

      <ConfirmDialog
        open={toDeleteChamp !== null}
        onOpenChange={(o) => {
          if (!o) setToDeleteChamp(null)
        }}
        title="Supprimer le champ ?"
        description={
          toDeleteChamp
            ? `« ${toDeleteChamp.cle} » sera retiré du gabarit.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDeleteChamp}
      />
    </FormDialog>
  )
}
