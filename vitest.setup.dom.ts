import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Démontage après chaque test : sans lui, les composants d'un test précédent
// restent dans le document et les requêtes `getBy*` deviennent ambiguës.
afterEach(() => {
  cleanup()
})

// jsdom n'implémente ni `matchMedia`, ni `ResizeObserver`, ni les API de capture
// de pointeur dont Radix se sert. On les fournit ici, une fois pour toutes, afin
// que les composants RÉELS montent sans avoir à être adaptés pour les tests.
const rien = (): undefined => undefined

window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: rien,
  removeListener: rien,
  addEventListener: rien,
  removeEventListener: rien,
  dispatchEvent: () => false,
})

class ObservateurInerte implements ResizeObserver {
  observe = rien
  unobserve = rien
  disconnect = rien
}
globalThis.ResizeObserver = ObservateurInerte

Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = rien
Element.prototype.releasePointerCapture = rien
Element.prototype.scrollIntoView = rien
