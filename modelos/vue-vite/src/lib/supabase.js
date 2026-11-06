import { createClient } from '@supabase/supabase-js'

// A sessão fica no localStorage (padrão do supabase-js). Dentro do portal o navegador guarda esse
// armazenamento separado do site aberto em aba própria, então o login é feito uma vez em cada lugar.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
