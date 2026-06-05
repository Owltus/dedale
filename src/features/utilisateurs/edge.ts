import { supabase } from '@/lib/supabase'

/**
 * Appelle une Edge Function et renvoie son corps typé, en levant un message
 * d'erreur lisible. `supabase.functions.invoke` ne throw pas sur un code HTTP
 * >= 400 : on inspecte donc `error` ET le corps `{ error }` renvoyé.
 */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await supabase.functions.invoke<T & { error?: unknown }>(name, {
    body,
  })
  if (res.error) {
    throw new Error(await edgeErrorMessage(res.error, res.data))
  }
  const data = res.data
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(asText(data.error))
  }
  return data as T
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function edgeErrorMessage(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return asText(data.error)
  }
  // FunctionsHttpError expose .context (la Response) ; on tente d'en lire le JSON.
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    try {
      const parsed: unknown = await ctx.clone().json()
      if (
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        parsed.error
      ) {
        return asText(parsed.error)
      }
    } catch {
      // corps non-JSON : message générique ci-dessous.
    }
  }
  return error instanceof Error ? error.message : 'Erreur'
}
