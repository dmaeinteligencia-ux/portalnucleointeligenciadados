import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as variáveis de ambiente o portal roda em modo demonstração, com dados de exemplo.
export const supabase = url && chave ? createClient(url, chave) : null
export const modoDemo = !supabase
