<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import {
  listarAplicacoes, salvarAplicacao, listarAutorizados, autorizar, removerAutorizado,
  listarAvisos, salvarAviso, listarAcessos, rotuloStatus, rotuloTipo, rotuloPlataforma,
  normalizarLinkPainel, linkPublicoPowerBI, linkPowerBI,
} from '../lib/dados'
import { auth } from '../lib/auth'
import { useRoute } from 'vue-router'

const aba = ref('aplicacoes')
const apps = ref([])
const pessoas = ref([])
const avisos = ref([])
const acessos = ref([])

const appVazia = () => ({ tipo: 'sistema', plataforma: 'powerbi', nome: '', slug: '', descricao: '', area: '', status: 'producao', url: '', responsavel: '', ativo: true, restrita: false, ordem: 100, supabase_url: '', supabase_chave: '', supabase_tabela: '' })
const editandoApp = ref(null)
const novaPessoa = reactive({ email: '', nome: '', papel: 'usuario' })
const novoAviso = reactive({ titulo: '', texto: '', ativo: true })
const mensagem = ref('')

async function carregar() {
  ;[apps.value, pessoas.value, avisos.value, acessos.value] = await Promise.all([
    listarAplicacoes({ todas: true }), listarAutorizados(), listarAvisos({ todos: true }), listarAcessos(),
  ])
}
const rota = useRoute()
onMounted(async () => {
  await carregar()
  // Vindo do atalho "Editar" da tela Saúde: abre direto o cadastro da aplicação.
  const app = rota.query.editar && apps.value.find(a => a.slug === rota.query.editar)
  if (app) { aba.value = 'aplicacoes'; editandoApp.value = { ...app } }
})

const nomeApp = id => apps.value.find(a => a.id === id)?.nome || '—'
const dataHora = d => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const avisar = t => { mensagem.value = t; setTimeout(() => (mensagem.value = ''), 3000) }
const gerarSlug = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function chaveSecreta(chave) {
  if (!chave) return false
  if (chave.startsWith('sb_secret_')) return true
  try { return JSON.parse(atob(chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role' } catch { return false }
}
async function gravarApp() {
  const app = { ...editandoApp.value }
  if (!app.slug) app.slug = gerarSlug(app.nome)
  if (linkPowerBI(app.url)) app.tipo = 'painel' // link do Power BI é sempre painel
  if (app.tipo === 'painel') {
    app.url = normalizarLinkPainel(app.url)
    if (!app.plataforma) app.plataforma = 'powerbi'
    if (app.url && !/^https:\/\//.test(app.url)) return avisar('O link do painel deve começar com https://')
    if (linkPublicoPowerBI(app.url) && !confirm('Este link é do "Publicar na web": qualquer pessoa com ele vê os dados, sem login. Salvar mesmo assim?')) return
  } else app.plataforma = null
  for (const c of ['supabase_url', 'supabase_chave', 'supabase_tabela']) app[c] = (app[c] || '').trim().replace(/\/$/, '') || null
  if (chaveSecreta(app.supabase_chave)) {
    return avisar('Essa é a chave secreta do Supabase. Use a chave publishable (anon).')
  }
  await salvarAplicacao(app)
  editandoApp.value = null
  await carregar()
  avisar('Aplicação salva.')
}
async function adicionarPessoa() {
  await autorizar({ ...novaPessoa })
  Object.assign(novaPessoa, { email: '', nome: '', papel: 'usuario' })
  await carregar()
  avisar('Pessoa autorizada. Ela já pode entrar com o e-mail.')
}
async function remover(email) {
  if (!confirm(`Remover o acesso de ${email}?`)) return
  await removerAutorizado(email)
  await carregar()
}
async function publicarAviso() {
  await salvarAviso({ ...novoAviso })
  Object.assign(novoAviso, { titulo: '', texto: '', ativo: true })
  await carregar()
  avisar('Aviso publicado.')
}
async function alternarAviso(aviso) {
  await salvarAviso({ id: aviso.id, ativo: !aviso.ativo })
  await carregar()
}
const acessosPorApp = computed(() => apps.value.map(a => ({ nome: a.nome, total: acessos.value.filter(x => x.aplicacao_id === a.id).length })))
</script>

<template>
<div>
  <h1 class="titulo-tela">Administração</h1>
  <div class="abas" role="tablist">
    <button v-for="(rotulo, chave) in { aplicacoes: 'Aplicações', pessoas: 'Usuários autorizados', avisos: 'Avisos', acessos: 'Acessos' }"
      :key="chave" role="tab" :aria-selected="aba === chave" :class="{ ativa: aba === chave }" @click="aba = chave">{{ rotulo }}</button>
  </div>
  <p v-if="mensagem" class="aviso-ok">{{ mensagem }}</p>

  <!-- Aplicações -->
  <section v-if="aba === 'aplicacoes'">
    <div class="barra"><button class="botao" @click="editandoApp = appVazia()">Nova aplicação</button></div>
    <form v-if="editandoApp" class="hud-painel formulario" @submit.prevent="gravarApp">
      <h2>{{ editandoApp.id ? 'Editar aplicação' : 'Nova aplicação' }}</h2>
      <div class="campos">
        <label>Tipo
          <select v-model="editandoApp.tipo"><option v-for="(r, v) in rotuloTipo" :key="v" :value="v">{{ r }}</option></select>
        </label>
        <label v-if="editandoApp.tipo === 'painel'">Ferramenta
          <select v-model="editandoApp.plataforma"><option v-for="(r, v) in rotuloPlataforma" :key="v" :value="v">{{ r }}</option></select>
        </label>
        <label>Nome<input v-model="editandoApp.nome" required /></label>
        <label>Área<input v-model="editandoApp.area" placeholder="Atendimento, Operação…" /></label>
        <label>Status
          <select v-model="editandoApp.status"><option v-for="(r, v) in rotuloStatus" :key="v" :value="v">{{ r }}</option></select>
        </label>
        <label v-if="editandoApp.tipo === 'painel'" class="largo">Link de inserção do painel
          <input v-model="editandoApp.url" placeholder="Cole o link do relatório do Power BI (o portal converte para o link de inserção)" />
          <small v-if="linkPublicoPowerBI(editandoApp.url)" class="perigo">Link do "Publicar na web": fica aberto para qualquer pessoa com o link.</small>
        </label>
        <label v-else>Endereço (URL)<input v-model="editandoApp.url" type="url" placeholder="https://" /></label>
        <label>Responsável<input v-model="editandoApp.responsavel" /></label>
        <label>Ordem<input v-model.number="editandoApp.ordem" type="number" /></label>
        <label class="largo">Descrição<textarea v-model="editandoApp.descricao" rows="3" /></label>
        <template v-if="editandoApp.tipo !== 'painel'">
        <label>Supabase da aplicação (monitoramento)<input v-model="editandoApp.supabase_url" type="url" placeholder="https://xxxx.supabase.co" /></label>
        <label>Chave publishable do Supabase<input v-model="editandoApp.supabase_chave" placeholder="sb_publishable_… (nunca a secreta)" /></label>
        <label>Tabela para consulta (opcional)<input v-model="editandoApp.supabase_tabela" placeholder="se o banco não tem a função ping()" /></label>
        </template>
        <label class="caixa"><input v-model="editandoApp.ativo" type="checkbox" /> Visível no portal</label>
        <label class="caixa"><input v-model="editandoApp.restrita" type="checkbox" /> Restrita a pessoas específicas</label>
      </div>
      <div class="barra">
        <button class="botao">Salvar</button>
        <button type="button" class="botao secundario" @click="editandoApp = null">Cancelar</button>
      </div>
    </form>
    <table class="tabela">
      <thead><tr><th>Aplicação</th><th>Tipo</th><th>Área</th><th>Status</th><th>Visível</th><th></th></tr></thead>
      <tbody>
        <tr v-for="app in apps" :key="app.id">
          <td><strong>{{ app.nome }}</strong><br /><small class="suave link-curto" :title="app.url">{{ app.url || 'sem link' }}</small></td>
          <td class="sem-quebra">{{ app.tipo === 'painel' ? `Painel ${rotuloPlataforma[app.plataforma] || ''}` : 'Sistema' }}</td>
          <td>{{ app.area }}</td>
          <td><span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span></td>
          <td>{{ app.ativo ? 'Sim' : 'Não' }}</td>
          <td><button class="botao-link" @click="editandoApp = { ...app }">Editar</button></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- Usuários -->
  <section v-if="aba === 'pessoas'">
    <form class="hud-painel formulario linha" @submit.prevent="adicionarPessoa">
      <label>E-mail<input v-model="novaPessoa.email" type="email" required /></label>
      <label>Nome<input v-model="novaPessoa.nome" /></label>
      <label>Perfil
        <select v-model="novaPessoa.papel"><option value="usuario">Usuário</option><option value="admin">Administrador</option></select>
      </label>
      <button class="botao">Autorizar</button>
    </form>
    <table class="tabela">
      <thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th></th></tr></thead>
      <tbody>
        <tr v-for="p in pessoas" :key="p.email">
          <td>{{ p.email }}</td><td>{{ p.nome || '—' }}</td>
          <td>{{ p.papel === 'admin' ? 'Administrador' : 'Usuário' }}</td>
          <td><button v-if="p.email !== auth.usuario.email" class="botao-link perigo" @click="remover(p.email)">Remover</button></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- Avisos -->
  <section v-if="aba === 'avisos'">
    <form class="hud-painel formulario" @submit.prevent="publicarAviso">
      <div class="campos">
        <label class="largo">Título<input v-model="novoAviso.titulo" required /></label>
        <label class="largo">Texto<textarea v-model="novoAviso.texto" rows="3" /></label>
      </div>
      <div class="barra"><button class="botao">Publicar aviso</button></div>
    </form>
    <table class="tabela">
      <thead><tr><th>Aviso</th><th>Publicado</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="v in avisos" :key="v.id">
          <td><strong>{{ v.titulo }}</strong><br /><small class="suave">{{ v.texto }}</small></td>
          <td>{{ dataHora(v.publicado_em) }}</td>
          <td>{{ v.ativo ? 'No ar' : 'Oculto' }}</td>
          <td><button class="botao-link" @click="alternarAviso(v)">{{ v.ativo ? 'Ocultar' : 'Mostrar' }}</button></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- Acessos -->
  <section v-if="aba === 'acessos'">
    <div class="resumo">
      <div v-for="r in acessosPorApp" :key="r.nome" class="hud-painel numero">
        <strong>{{ r.total }}</strong><span>acessos à {{ r.nome }}</span>
      </div>
    </div>
    <table class="tabela">
      <thead><tr><th>Quando</th><th>Quem</th><th>Aplicação</th></tr></thead>
      <tbody>
        <tr v-for="a in acessos" :key="a.id"><td>{{ dataHora(a.em) }}</td><td>{{ a.email }}</td><td>{{ nomeApp(a.aplicacao_id) }}</td></tr>
      </tbody>
    </table>
  </section>
</div>
</template>
