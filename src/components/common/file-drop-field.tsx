import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileDropFieldProps {
  /** Fichiers déposés ou choisis (toujours ≥ 1 ; jamais appelé à vide). */
  onFiles: (files: File[]) => void
  /** Attribut `accept` du sélecteur natif (ex. 'application/pdf'). */
  accept?: string
  /** Aide sous l'invite (ex. « PDF · 20 Mo maximum »). */
  hint?: string
  /** Autorise la sélection multiple. */
  multiple?: boolean
  /** Id pour relier un `<Label htmlFor>`. */
  id?: string
}

/**
 * Zone de dépôt de fichier(s) réutilisable, cohérente avec le design system :
 * une zone en pointillés cliquable (ouvre le sélecteur natif) qui accepte aussi
 * le glisser-déposer. Volontairement SANS état de liste : elle ÉMET les fichiers
 * (`onFiles`) et garde TOUJOURS la même mise en forme (la liste/aperçu est gérée
 * par l'appelant). Aucune logique métier ni validation.
 */
export function FileDropField({
  onFiles,
  accept,
  hint,
  multiple = false,
  id,
}: FileDropFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files')

  const emit = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length) onFiles(files)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault()
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          setDragging(false)
          emit(e.dataTransfer.files)
        }}
        className={cn(
          'border-input flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          'hover:border-ring hover:bg-accent/40',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
          <Upload className="size-5" />
        </span>
        <span className="text-sm font-medium">
          {multiple ? 'Glissez des fichiers ici' : 'Glissez un fichier ici'} ou{' '}
          <span className="text-primary">cliquez pour parcourir</span>
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files)
          // Réinitialise pour autoriser un nouveau dépôt du même fichier.
          e.target.value = ''
        }}
      />
    </>
  )
}
