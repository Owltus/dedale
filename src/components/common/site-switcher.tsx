import { useSiteContext } from '@/lib/site-context'

/** Sélecteur de site actif (masqué s'il n'y a qu'un seul site accessible). */
export function SiteSwitcher() {
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext()

  if (sites.length <= 1) return null

  return (
    <select
      value={activeSiteId ?? ''}
      onChange={(e) => setActiveSiteId(e.target.value)}
      aria-label="Site actif"
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
    >
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.nom}
        </option>
      ))}
    </select>
  )
}
