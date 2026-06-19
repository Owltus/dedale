import type { ComponentType } from 'react'
import { FileImage, FileText } from 'lucide-react'

interface FormatIconProps {
  className?: string
}

/**
 * Icône « fichier PDF » MAISON, calquée sur le style lucide (silhouette de
 * fichier identique à `FileImage`/`FileText` + libellé « PDF »), car lucide n'a
 * pas d'icône PDF explicite. Trait `currentColor` → suit la couleur du contexte
 * (ex. tuile `RowMediaIcon`). À utiliser comme une icône lucide (prop `className`).
 */
export function PdfFileIcon({ className }: FormatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Silhouette + coin replié : mêmes tracés que les icônes fichier lucide. */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {/* Libellé PDF (plein, sans trait) centré dans le bas du fichier. */}
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        PDF
      </text>
    </svg>
  )
}

/**
 * Icône à afficher selon le FORMAT d'un document (≠ type métier « devis/contrat »
 * qui, lui, n'est pas porté par le fichier) : PDF explicite, image, ou document
 * générique. Source UNIQUE → même différenciation partout (bibliothèque, fiches).
 */
export function iconeFormat(mime: string): ComponentType<{ className?: string }> {
  if (mime === 'application/pdf') return PdfFileIcon
  if (mime.startsWith('image/')) return FileImage
  return FileText
}
