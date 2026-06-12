import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { miniaturesQueries } from './queries'

export function useUploadMiniature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      blob,
      hash,
      siteId,
      createdBy,
    }: {
      /** WebP 150x150 déjà produit par le cropper. */
      blob: Blob
      hash: string
      /** null = pool entreprise ; sinon pool du site. */
      siteId: string | null
      createdBy: string
    }) => {
      const storagePath = `miniatures/${hash}.webp`

      // INSERT pur (upsert:false, comme l'upload de documents). Un upsert
      // forcerait la policy UPDATE de storage.objects (admin/manager only) et
      // casserait l'upload pour les techniciens ; l'INSERT autorise tous les
      // rôles d'écriture. Le fichier étant content-addressed (même hash = même
      // contenu), « déjà présent » n'est pas une erreur : on continue.
      // Ordre voulu (Storage avant DB) : si l'insert du pointeur échoue ensuite,
      // on préfère un blob orphelin (invisible, purgé par le cron backend) à une
      // ligne pointant un fichier absent. Pas de rollback du blob : partagé entre
      // portées (même hash).
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, blob, { contentType: 'image/webp', upsert: false })
      // 409 = fichier déjà présent (content-addressed : même hash = même
      // contenu) → pas une erreur, on continue. `statusCode` (string | undefined)
      // est le statut HTTP structuré : plus robuste qu'un test sur le message.
      if (upErr !== null && upErr.statusCode !== '409') {
        throw upErr
      }

      // Insert du pointeur. 23505 = déjà présente dans ce périmètre (dédup
      // scopée par site) → on considère l'image disponible, pas une erreur.
      const { error: insErr } = await supabase.from('miniatures').insert({
        site_id: siteId,
        hash_sha256: hash,
        storage_path: storagePath,
        created_by: createdBy,
      })
      if (insErr && insErr.code !== '23505') throw insErr

      // Résout l'id de la miniature — créée À L'INSTANT ou déjà présente (dédup
      // par hash dans le périmètre) → permet à l'appelant (sélecteur d'image) de
      // l'assigner directement à une entité. L'unicité (site_id, hash) garantit
      // au plus une ligne.
      const base = supabase
        .from('miniatures')
        .select('id')
        .eq('hash_sha256', hash)
      const scoped =
        siteId === null ? base.is('site_id', null) : base.eq('site_id', siteId)
      const { data: row } = await scoped.maybeSingle().throwOnError()
      return row?.id ?? null
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: miniaturesQueries.all() }),
  })
}

export function useDeleteMiniature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression sûre : refusée tant qu'une entité référence la miniature.
      const { data: refs } = await supabase
        .rpc('count_miniature_refs', { p_miniature_id: id })
        .throwOnError()
      if (refs > 0) {
        throw new Error(
          `Image utilisée par ${String(refs)} élément(s) : retire-la d’abord de ces entités.`,
        )
      }
      // Chemin Storage récupéré AVANT de détruire le pointeur.
      const { data: row } = await supabase
        .from('miniatures')
        .select('storage_path')
        .eq('id', id)
        .single()
        .throwOnError()
      await supabase.from('miniatures').delete().eq('id', id).throwOnError()

      // Nettoyage du blob via RPC SECURITY DEFINER (même méthode que le cron) :
      // contourne la RLS Storage ET le trigger protect_delete. La fonction ne
      // supprime QUE si le fichier n'est plus rattaché nulle part (sûr pour un
      // hash partagé entre portées).
      const { data: blobDeleted, error: blobErr } = await supabase.rpc(
        'supprimer_blob_orphelin',
        { p_path: row.storage_path },
      )
      return {
        blob: blobErr
          ? `échec RPC : ${blobErr.message}`
          : blobDeleted
            ? 'fichier supprimé du bucket'
            : 'conservé (encore référencé ailleurs)',
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: miniaturesQueries.all() }),
  })
}
