import { useMemo, useState } from 'react'
import {
  Package,
  Pencil,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ModeleEquipement } from '../queries'
import { useUpdateModeleSpecifications } from '../mutations'
import { ChampFormDialog } from './champ-form-dialog'
import {
  CHAMP_TYPES,
  formatChampValeur,
  parseChamps,
  prepareChamps,
  type Champ,
} from '@/lib/champs'
import { errorMessage } from '@/lib/form'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRow } from '@/components/common/list-row'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listStack } from '@/lib/responsive'

// Sous-titre lisible d'un champ : type, unité (si nombre), valeur par défaut.
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
 * Page de détail d'un MODÈLE d'équipement (niveau FEUILLE de la navigation). Le
 * modèle se crée avec nom + description ; ICI on voit ses CARACTÉRISTIQUES sous
 * forme de cartes et on les ajoute / modifie / supprime via un MODAL (un champ à
 * la fois) — plus d'éditeur inline. Chaque opération réécrit le JSONB
 * `specifications`. Le nom / la description / l'état s'éditent via « Modifier »
 * dans la barre d'onglet.
 */
export function ModeleEquipementDetail({
  modele,
  canEdit,
}: {
  modele: ModeleEquipement
  /** Édition réservée au rôle métier sur la portée du modèle (sinon lecture seule). */
  canEdit: boolean
}) {
  const update = useUpdateModeleSpecifications()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const champs = useMemo(
    () => parseChamps(modele.specifications),
    [modele.specifications],
  )
  const [champForm, setChampForm] = useState<{
    open: boolean
    champ: Champ | null
  }>({ open: false, champ: null })
  const [toDelete, setToDelete] = useState<Champ | null>(null)

  // UPDATE PARTIEL (specifications uniquement) : ne touche à aucun autre attribut
  // du modèle → pas de risque d'écraser nom/description/état édités ailleurs (le
  // formulaire « Modifier » n'écrit jamais les caractéristiques, et inversement).
  // Renvoie `true` si l'enregistrement a réussi.
  async function persist(next: Champ[]): Promise<boolean> {
    const prepared = prepareChamps(next)
    if (!prepared.ok) {
      toast.error(prepared.error)
      return false
    }
    try {
      await update.mutateAsync({ id: modele.id, champs: prepared.champs })
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    }
  }

  async function handleSubmitChamp(champ: Champ) {
    const original = champForm.champ
    // L'original a pu disparaître entre-temps (suppression concurrente realtime) :
    // on bascule alors en AJOUT plutôt que de perdre la saisie (un map ne réinsère
    // pas un élément absent), et le toast reflète l'opération réelle.
    const editing =
      original !== null && champs.some((c) => c.cle === original.cle)
    const next =
      original !== null && editing
        ? champs.map((c) => (c.cle === original.cle ? champ : c))
        : [...champs, champ]
    if (await persist(next)) {
      toast.success(editing ? 'Champ modifié' : 'Champ ajouté')
      setChampForm({ open: false, champ: null })
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    const next = champs.filter((c) => c.cle !== toDelete.cle)
    if (await persist(next)) {
      toast.success('Champ supprimé')
      setToDelete(null)
    }
  }

  // Noms des AUTRES champs (pour refuser un doublon dans le modal).
  const existingCles = champs
    .filter((c) => c.cle !== champForm.champ?.cle)
    .map((c) => c.cle.toLowerCase())

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : nom + description (les actions modèle vivent dans la barre
          d'onglet : « Modifier » / « Copier »). */}
      <ListRow
        media={
          <MiniatureThumb
            url={urlOf(modele.miniature_id)}
            fallback={<Package className="size-10" />}
            alt=""
            onError={refreshMiniatures}
            className="size-full rounded-none"
          />
        }
        title={modele.nom}
        subtitle={
          modele.description?.trim() ? modele.description.trim() : undefined
        }
        badges={
          <>
            <Badge variant={modele.site_id === null ? 'secondary' : 'outline'}>
              {modele.site_id === null ? 'Commun' : 'Site'}
            </Badge>
            {!modele.est_actif && <Badge variant="outline">Masqué</Badge>}
          </>
        }
      />

      {/* Section Caractéristiques : cartes + ajout via modal (un champ à la fois). */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="text-muted-foreground size-4" />
          Caractéristiques
        </h3>
        {canEdit && (
          <TooltipIconButton
            icon={<Plus />}
            label="Ajouter un champ"
            onClick={() => setChampForm({ open: true, champ: null })}
          />
        )}
      </div>

      {champs.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Aucune caractéristique"
          description={
            canEdit
              ? 'Ajoute un champ avec le bouton + ci-dessus.'
              : 'Aucune caractéristique pour le moment.'
          }
        />
      ) : (
        <div className={listStack}>
          {champs.map((c) => (
            <ListRow
              key={c.cle}
              icon={<Tag className="size-5" />}
              title={c.cle}
              subtitle={champResume(c)}
              badges={
                c.requis ? (
                  <Badge variant="outline">Obligatoire</Badge>
                ) : undefined
              }
              onClick={
                canEdit
                  ? () => setChampForm({ open: true, champ: c })
                  : undefined
              }
              actions={
                canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Modifier le champ"
                      onClick={() => setChampForm({ open: true, champ: c })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer le champ"
                      onClick={() => setToDelete(c)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {canEdit && (
        <ChampFormDialog
          key={`${champForm.champ?.cle ?? 'new'}-${String(champForm.open)}`}
          open={champForm.open}
          onOpenChange={(open) => setChampForm((f) => ({ ...f, open }))}
          champ={champForm.champ}
          existingCles={existingCles}
          onSubmit={(champ) => void handleSubmitChamp(champ)}
          pending={update.isPending}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le champ ?"
        description={
          toDelete ? `« ${toDelete.cle} » sera retiré du modèle.` : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={update.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
