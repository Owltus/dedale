import { describe, expect, it } from 'vitest'
import { lieuDeRetour, retourDeConfiance } from './confiance'

describe('retourDeConfiance (miroir de la migration 154)', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1:5000/cb',
  ])('accepte %s', (u) => expect(retourDeConfiance(u)).toBe(true))

  it.each([
    'https://claude.ai.pirate.example/cb',
    'https://pirate.example/claude.ai',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai:8443/cb',
    'https://evil@claude.ai/cb',
    'http://localhost.pirate.example/cb',
    'https://localhost/cb',
    'javascript:alert(1)',
    'pas une adresse',
    '',
  ])('refuse %s', (u) => expect(retourDeConfiance(u)).toBe(false))

  it('nomme le lieu de retour', () => {
    expect(lieuDeRetour('https://claude.ai/x')).toBe('claude.ai')
    expect(lieuDeRetour('http://localhost:1/x')).toBe(
      'ton ordinateur (Claude Code)',
    )
  })
})
