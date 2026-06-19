import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Barre supérieure du drawer (mobile + tablette tactile ; affichage piloté en JS
 *  depuis _app) : logo + titre centrés, burger à droite. */
export function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="bg-card z-30 flex h-14 shrink-0 items-center border-b px-4">
      {/* Espace fantôme (largeur du burger) pour centrer réellement le titre. */}
      <div className="size-9 shrink-0" aria-hidden />
      <div className="flex flex-1 items-center justify-center gap-2">
        <img
          src="/logo.svg"
          alt="Logo Dédale"
          className="size-7 shrink-0 dark:invert"
        />
        <p className="text-lg font-bold tracking-wide uppercase">Dédale</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ouvrir le menu"
        onClick={onMenu}
        className="shrink-0"
      >
        <Menu />
      </Button>
    </header>
  )
}
