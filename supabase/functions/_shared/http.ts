// En-têtes CORS et réponse JSON communs aux Edge Functions de comptes
// (invite_user, set_user_password, update_user_email) et à dmbook-connexion.
// `mcp` a son propre CORS : il reste à part.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
