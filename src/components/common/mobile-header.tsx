import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Barre supérieure mobile (cachée à partir de lg) : burger + logo + titre. */
export function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="bg-card sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ouvrir le menu"
        onClick={onMenu}
      >
        <Menu />
      </Button>
      <img
        src="/logo.svg"
        alt="Logo Dédale"
        className="size-7 shrink-0 dark:invert"
      />
      <p className="text-lg font-bold tracking-wide uppercase">Dédale</p>
    </header>
  )
}
