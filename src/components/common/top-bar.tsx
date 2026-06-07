import { Link } from '@tanstack/react-router'
import { SiteSwitcher } from '@/components/common/site-switcher'
import { UserMenu } from '@/components/common/user-menu'

/**
 * Barre supérieure du layout demandeur : marque (nom de l'app, cliquable vers les
 * demandes) à gauche ; sélecteur de site (si plusieurs) + bloc compte à droite.
 * Identique sur bureau / tablette / mobile (pas de sidebar pour ce rôle).
 */
export function TopBar() {
  return (
    <header className="bg-card sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <Link
        to="/demandes"
        className="focus-visible:ring-ring/50 focus-visible:ring-offset-card flex shrink-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <img
          src="/logo.svg"
          alt="Logo Dédale"
          className="size-9 shrink-0 dark:invert"
        />
        <div className="min-w-0 leading-tight">
          <p className="text-xl font-bold tracking-wide uppercase">Dédale</p>
          <p className="text-muted-foreground hidden text-xs sm:block">
            Gestion de Maintenance
          </p>
        </div>
      </Link>

      {/* Site courant, juste après la marque (le séparateur est rendu par SiteSwitcher). */}
      <SiteSwitcher variant="bar" />

      <UserMenu responsiveText className="ml-auto w-auto max-w-56 shrink-0" />
    </header>
  )
}
