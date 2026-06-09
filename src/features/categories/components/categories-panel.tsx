import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { categoriesQueries } from '../queries'
import type { Categorie } from '../queries'
import { useDeleteCategorie } from '../mutations'
import type { CategorieFormValues } from '../schemas'
import { CategoryTree } from './category-tree'
import { CategoryFormDialog } from './category-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

interface Preset {
  parent_id?: string
  scope?: CategorieFormValues['scope']
  portee?: CategorieFormValues['portee']
}

interface FormState {
  open: boolean
  categorie: Categorie | null
  preset?: Preset
}

/** Panneau « Domaines & familles » : arbre des catégories + CRUD. */
export function CategoriesPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { activeSiteId, activeSite } = useSiteContext()
  const query = useQuery(categoriesQueries.list(activeSiteId))
  const del = useDeleteCategorie()

  const [form, setForm] = useState<FormState>({
    open: false,
    categorie: null,
  })
  const [toDelete, setToDelete] = useState<Categorie | null>(null)

  // Action « + » mutualisée dans l'en-tête de la Bibliothèque.
  const handleAdd = useCallback(
    () => setForm({ open: true, categorie: null, preset: undefined }),
    [],
  )
  useTabAddAction(canManage ? handleAdd : null, 'Nouvelle catégorie')

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Catégorie supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={query}
        pending={<CardSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Layers}
            title="Aucune catégorie"
            description={
              canManage
                ? 'Crée un premier domaine via le bouton + en haut à droite.'
                : 'Aucune catégorie accessible.'
            }
          />
        }
      >
        {(categories) => (
          <CategoryTree
            categories={categories}
            canManage={canManage}
            canManageEntreprise={canEntreprise}
            onEdit={(c) =>
              setForm({ open: true, categorie: c, preset: undefined })
            }
            onAddChild={(parent) =>
              setForm({
                open: true,
                categorie: null,
                preset: {
                  parent_id: parent.id,
                  scope: parent.scope,
                  // Un tech ajoute une sous-catégorie de site, même sous un parent
                  // entreprise (le backend l'autorise).
                  portee: canEntreprise
                    ? parent.site_id === null
                      ? 'entreprise'
                      : 'site'
                    : 'site',
                },
              })
            }
            onDelete={(c) => setToDelete(c)}
          />
        )}
      </QueryState>

      {canManage && (
        <CategoryFormDialog
          key={form.categorie?.id ?? form.preset?.parent_id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          categorie={form.categorie}
          preset={form.preset}
          categories={query.data ?? []}
          canEntreprise={canEntreprise}
          siteId={activeSiteId}
          siteName={activeSite?.nom ?? null}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer la catégorie ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placée dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
