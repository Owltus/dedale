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

/**
 * Remplace l'image d'une vignette EXISTANTE en conservant son `id` (et son
 * `site_id`) : on repointe `hash_sha256` + `storage_path` vers une nouvelle
 * image. Toutes les entités qui référencent ce `miniature_id` (catégories,
 * gammes, prestataires, bâtiments, niveaux, locaux) basculent alors sur la
 * nouvelle image au prochain rafraîchissement du pool — sans toucher aux
 * tables-entités ni au backend (résolution d'URL côté entités via
 * `useMiniatureUrls`, map `id → URL`).
 */
export function useReplaceMiniature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      oldStoragePath,
      blob,
      hash,
    }: {
      id: string
      /** Chemin Storage actuel (purgé ensuite s'il devient orphelin). */
      oldStoragePath: string
      /** WebP 150x150 déjà produit par le cropper. */
      blob: Blob
      hash: string
    }) => {
      const storagePath = `miniatures/${hash}.webp`

      // Même contenu (hash identique) → rien à repointer ni à propager.
      if (storagePath === oldStoragePath) {
        return { refs: 0, unchanged: true }
      }

      // 1) Storage d'abord (content-addressed, upsert:false ; 409 = déjà présent,
      //    même contenu → on continue). Identique à l'ajout au pool.
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, blob, { contentType: 'image/webp', upsert: false })
      if (upErr !== null && upErr.statusCode !== '409') throw upErr

      // 2) Repointer la MÊME ligne (id et site_id inchangés) → propage à toutes
      //    les entités via miniature_id, sans rien modifier côté tables-entités.
      //    `created_at`/`created_by` restent ceux de l'entrée d'origine du pool (un
      //    remplacement édite l'entrée, pas son créateur ; pas de colonne d'audit
      //    de mise à jour côté base). `.select('id')` pour DISTINGUER un vrai
      //    succès d'un refus RLS silencieux : un UPDATE hors périmètre est filtré
      //    par la clause USING → 0 ligne SANS erreur (pas de 42501, USING et WITH
      //    CHECK portant le même prédicat à site_id inchangé). 23505 = ce contenu
      //    existe déjà comme une AUTRE vignette de ce périmètre (unique
      //    (site_id, hash)) → message clair plutôt qu'erreur brute.
      const { data: updated, error: updErr } = await supabase
        .from('miniatures')
        .update({ hash_sha256: hash, storage_path: storagePath })
        .eq('id', id)
        .select('id')
      if (updErr !== null) {
        if (updErr.code === '23505') {
          throw new Error(
            'Cette image existe déjà comme une autre vignette de ce périmètre. Utilise-la directement plutôt que de remplacer celle-ci.',
          )
        }
        throw updErr
      }
      // 0 ligne = refus RLS silencieux (USING) sur une vignette hors périmètre :
      // le client a déjà rétréci `updated` à un tableau non-null après le throw.
      if (updated.length === 0) {
        throw new Error(
          'Remplacement refusé : cette vignette est hors de ton périmètre.',
        )
      }

      // 3) Purge best-effort de l'ancien blob s'il n'est plus référencé nulle part
      //    (RPC partagée avec la suppression et le cron). Un hash encore partagé
      //    par une autre portée reste protégé. Échec non bloquant : le cron purge.
      await supabase.rpc('supprimer_blob_orphelin', { p_path: oldStoragePath })

      // 4) Nombre d'entités concernées (inchangé par le remplacement) → libellé du
      //    toast UNIQUEMENT. Best-effort comme l'étape 3 : ne JAMAIS faire échouer
      //    un remplacement DÉJÀ commité si ce comptage cosmétique casse (réseau,
      //    JWT) — sinon onSuccess/invalidation sauteraient et l'UI signalerait un
      //    faux échec. `refs` peut donc être null → 0.
      const { data: refs } = await supabase.rpc('count_miniature_refs', {
        p_miniature_id: id,
      })
      return { refs: refs ?? 0, unchanged: false }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: miniaturesQueries.all() }),
  })
}
