/*
 * Portal do Núcleo de Inteligência de Dados: aviso para o portal quando o sistema está embutido.
 *
 * Uso, no index.html (ou no head do Nuxt) de cada sistema:
 *   <script src="https://portalnucleointeligenciadados.vercel.app/embutido.js" defer></script>
 *
 * Por padrão testa cookies (sessão em cookie, como no @nuxtjs/supabase).
 * Sistemas que guardam a sessão no localStorage (supabase-js padrão, Vue/Vite) usam:
 *   <script src=".../embutido.js" data-sessao="local" defer></script>
 *
 * Fora de um iframe não faz nada. Dentro, envia uma única mensagem ao portal:
 *   { tipo: 'nucleo:sessao-ok' } ou { tipo: 'nucleo:sessao-bloqueada' }
 * A mensagem não carrega nenhum dado do sistema.
 */
(function () {
  if (window.parent === window) return

  var script = document.currentScript
  var modo = (script && script.getAttribute('data-sessao')) || 'cookie'

  function cookiesFuncionam() {
    try {
      var nome = 'nucleo_teste_' + Math.random().toString(36).slice(2)
      document.cookie = nome + '=1; path=/; max-age=60; SameSite=None; Secure'
      var ok = document.cookie.indexOf(nome + '=1') !== -1
      document.cookie = nome + '=; path=/; max-age=0; SameSite=None; Secure'
      return ok
    } catch (e) {
      return false
    }
  }

  function armazenamentoFunciona() {
    try {
      var chave = '__nucleo_teste__'
      window.localStorage.setItem(chave, '1')
      var ok = window.localStorage.getItem(chave) === '1'
      window.localStorage.removeItem(chave)
      return ok
    } catch (e) {
      return false
    }
  }

  var ok = modo === 'local' ? armazenamentoFunciona() : cookiesFuncionam()
  try {
    window.parent.postMessage({ tipo: ok ? 'nucleo:sessao-ok' : 'nucleo:sessao-bloqueada' }, '*')
  } catch (e) { /* sem portal para avisar */ }
})()
