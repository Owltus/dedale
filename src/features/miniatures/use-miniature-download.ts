import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { MiniatureWithUrl } from './queries'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/form'

// Déclenche un téléchargement navigateur d'un blob.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function fileNameFor(m: MiniatureWithUrl, index?: number) {
  const prefix = index === undefined ? '' : `${String(index).padStart(2, '0')}-`
  return `vignette-${prefix}${m.hash_sha256.slice(0, 8)}.webp`
}

/**
 * Téléchargements de vignettes (unitaire ou sélection). Passe par le SDK Storage
 * (pas de souci CORS). Au-delà d'une image, la sélection part en ZIP (jszip
 * chargé à la demande). `zipping` couvre la préparation de la sélection.
 */
export function useMiniatureDownload(selectedMiniatures: MiniatureWithUrl[]) {
  const [zipping, setZipping] = useState(false)

  // Télécharge UNE vignette (bouton au survol). Disponible à tous les rôles
  // métier, pas seulement aux gestionnaires : télécharger n'est pas une action
  // de gestion.
  const downloadOne = useCallback(async (m: MiniatureWithUrl) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(m.storage_path)
      if (error !== null) {
        toast.error('Image indisponible.')
        return
      }
      downloadBlob(data, fileNameFor(m))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }, [])

  // Télécharge la sélection : un seul fichier WebP, ou un ZIP au-delà.
  const downloadSelection = useCallback(async () => {
    const items = selectedMiniatures
    if (items.length === 0) return
    setZipping(true)
    try {
      // Un seul fichier : téléchargement direct (pas de ZIP).
      if (items.length === 1) {
        const m = items[0]
        if (m === undefined) return
        const { data, error } = await supabase.storage
          .from('documents')
          .download(m.storage_path)
        if (error !== null) {
          toast.error('Image indisponible.')
          return
        }
        downloadBlob(data, fileNameFor(m))
        return
      }
      // Plusieurs : ZIP (jszip chargé à la demande).
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      let n = 0
      for (const m of items) {
        const { data, error } = await supabase.storage
          .from('documents')
          .download(m.storage_path)
        if (error !== null) continue
        n += 1
        zip.file(fileNameFor(m, n), data)
      }
      if (n === 0) {
        toast.error('Aucune image téléchargeable.')
        return
      }
      const archive = await zip.generateAsync({ type: 'blob' })
      downloadBlob(archive, 'vignettes.zip')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setZipping(false)
    }
  }, [selectedMiniatures])

  return { zipping, downloadOne, downloadSelection }
}
