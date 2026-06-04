import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — vérifie ton fichier .env.local',
  )
}

export const supabase = createClient<Database>(url, anonKey)
