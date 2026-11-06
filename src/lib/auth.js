import { reactive } from 'vue'
import { supabase, modoDemo } from './supabase'
import { demo } from './demo'

export const auth = reactive({ carregado: false, usuario: null })

async function carregarPerfil(email) {
  if (!email) return null
  if (modoDemo) return demo.autorizados.find(a => a.email === email) || null
  const { data } = await supabase.from('autorizados').select('*').eq('email', email.toLowerCase()).maybeSingle()
  return data
}

export async function iniciarAuth() {
  if (modoDemo) {
    const salvo = sessionStorage.getItem('demo-email')
    auth.usuario = await carregarPerfil(salvo)
  } else {
    const { data } = await supabase.auth.getSession()
    auth.usuario = await carregarPerfil(data.session?.user?.email)
    supabase.auth.onAuthStateChange(async (_evento, sessao) => {
      auth.usuario = await carregarPerfil(sessao?.user?.email)
    })
  }
  auth.carregado = true
}

// Envia o link de acesso por e-mail. Quem não está autorizado é recusado.
export async function entrar(email) {
  email = email.trim().toLowerCase()
  if (modoDemo) {
    const perfil = await carregarPerfil(email)
    if (!perfil) throw new Error('Este e-mail não está autorizado no portal.')
    sessionStorage.setItem('demo-email', email)
    auth.usuario = perfil
    return { entrouDireto: true }
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw new Error('Este e-mail não está autorizado no portal.')
  return { entrouDireto: false }
}

export async function sair() {
  if (modoDemo) sessionStorage.removeItem('demo-email')
  else await supabase.auth.signOut()
  auth.usuario = null
}
