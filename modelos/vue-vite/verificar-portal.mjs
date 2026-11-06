// Confere se o sistema continua pronto para o Portal do Núcleo. Roda em cada PR (GitHub Actions)
// e localmente com: npm run verificar-portal
import { readFileSync, existsSync } from 'node:fs'

const problemas = []
const ler = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')

// 1. Ficha da aplicação
let ficha = null
try { ficha = JSON.parse(ler('nucleo.json')) } catch { problemas.push('nucleo.json ausente ou inválido') }
if (ficha && ficha.portal !== false) {
  if (!ficha.nome || ficha.nome === 'Novo sistema') problemas.push('preencha "nome" no nucleo.json')
  if (!/^[a-z0-9-]+$/.test(ficha.slug || '')) problemas.push('"slug" no nucleo.json: só minúsculas, números e hífen')
  if (!['producao', 'piloto', 'desenvolvimento'].includes(ficha.status)) problemas.push('"status" no nucleo.json: producao, piloto ou desenvolvimento')
  if (ficha.url && !ficha.url.startsWith('https://')) problemas.push('"url" no nucleo.json deve começar com https://')
}

// 2. Aviso para o portal (embutido.js)
const ehNuxt = existsSync('nuxt.config.ts')
const pagina = ehNuxt ? ler('nuxt.config.ts') : ler('index.html')
if (!pagina.includes('embutido.js')) problemas.push(`${ehNuxt ? 'nuxt.config.ts' : 'index.html'} não carrega o embutido.js do portal`)

// 3. Cookies do login (Nuxt + @nuxtjs/supabase)
if (ehNuxt) {
  const cfg = ler('nuxt.config.ts')
  if (!/sameSite:\s*['"]none['"]/.test(cfg) || !/secure:\s*true/.test(cfg)) problemas.push("nuxt.config.ts: supabase.cookieOptions precisa de sameSite: 'none' e secure: true")
}

// 4. Nada pode impedir o sistema de abrir dentro do portal
const vercel = ler('vercel.json')
if (/x-frame-options/i.test(vercel)) problemas.push('vercel.json define X-Frame-Options, o que impede abrir dentro do portal')
if (/frame-ancestors/i.test(vercel) && !vercel.includes('portalnucleointeligenciadados')) problemas.push('vercel.json: frame-ancestors precisa incluir o portal')

if (problemas.length) {
  console.error('Pronto para o portal: NÃO\n- ' + problemas.join('\n- '))
  process.exit(1)
}
console.log('Pronto para o portal: sim')
