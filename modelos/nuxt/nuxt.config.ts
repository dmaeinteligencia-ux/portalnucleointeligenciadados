// Modelo Nuxt dos sistemas do Núcleo de Inteligência de Dados (DMAE)
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/estilo.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Novo sistema · Núcleo de Inteligência de Dados',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@400;500;600;700&display=swap' },
      ],
      // Avisa o Portal do Núcleo se o login funciona com o sistema aberto dentro dele. Não remover.
      script: [{ src: 'https://portalnucleointeligenciadados.vercel.app/embutido.js', defer: true }],
    },
  },

  supabase: {
    types: false,
    // SUPABASE_URL e SUPABASE_KEY (chave publishable) vêm das variáveis de ambiente.
    redirectOptions: { login: '/entrar', callback: '/confirmar', exclude: [] },
    // Necessário para o login funcionar com o sistema aberto dentro do portal (iframe).
    cookieOptions: { maxAge: 60 * 60 * 8, sameSite: 'none', secure: true },
  },
})
