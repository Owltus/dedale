import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Barre supérieure du mobile (masquée dès `md` : la sidebar y est fixe) : burger à
 * gauche + marque. Le burger ouvre le drawer via le contexte de la sidebar.
 */
export function MobileHeader() {
  const { toggleSidebar } = useSidebar()
  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-2 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ouvrir le menu"
        onClick={toggleSidebar}
        className="shrink-0"
      >
        <Menu />
      </Button>
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        className="size-7 shrink-0 dark:invert"
      />
      <p className="text-lg font-bold tracking-wide uppercase">Dédale</p>
    </header>
  )
}
