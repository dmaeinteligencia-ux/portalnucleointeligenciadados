<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import {
  listarAplicacoes, salvarAplicacao, listarAutorizados, autorizar, removerAutorizado,
  listarAvisos, salvarAviso, listarAcessos, listarPermissoes, salvarPermissoes, rotuloStatus,
} from '../lib/dados'
import { auth } from '../lib/auth'

const aba = ref('aplicacoes')
const apps = ref([])
const pessoas = ref([])
const avisos = ref([])
const acessos = ref([])
const permissoes = ref([])
const escolhidos = ref([])

const appVazia = () => ({ nome: '', slug: '', descricao: '', area: '', status: 'producao', url: '', responsavel: '', ativo: true, restrita: false, ordem: 100 })
const editandoApp = ref(null)
const novaPessoa = reactive({ email: '', nome: '', papel: 'usuario' })
const novoAviso = reactive({ titulo: '', texto: '', ativo: true })
const mensagem = ref('')

async function carregar() {
  ;[apps.value, pessoas.value, avisos.value, acessos.value, permissoes.value] = await Promise.all([
    listarAplicacoes({ todas: true }), listarAutorizados(), listarAvisos({ todos: true }), listarAcessos(), listarPermissoes(),
  ])
}
onMounted(carregar)

const nomeApp = id => apps.value.find(a => a.id === id)?.nome || '—'
const dataHora = d => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const avisar = t => { mensagem.value = t; setTimeout(() => (mensagem.value = ''), 3000) }
const gerarSlug = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const pessoasComAcesso = id => permissoes.value.filter(p => p.aplicacao_id === id).map(p => p.email)
function editarApp(app) {
  editandoApp.value = { ...app }
  escolhidos.value = app.id ? pessoasComAcesso(app.id) : []
}
async function gravarApp() {
  const app = { ...editandoApp.value }
  if (!app.slug) app.slug = gerarSlug(app.nome)
  const id = await salvarAplicacao(app)
  if (app.restrita) await salvarPermissoes(id, escolhidos.value)
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
    <div class="barra"><button class="botao" @click="editarApp(appVazia())">Nova aplicação</button></div>
    <form v-if="editandoApp" class="hud-painel formulario" @submit.prevent="gravarApp">
      <h2>{{ editandoApp.id ? 'Editar aplicação' : 'Nova aplicação' }}</h2>
      <div class="campos">
        <label>Nome<input v-model="editandoApp.nome" required /></label>
        <label>Área<input v-model="editandoApp.area" placeholder="Atendimento, Operação…" /></label>
        <label>Status
          <select v-model="editandoApp.status"><option v-for="(r, v) in rotuloStatus" :key="v" :value="v">{{ r }}</option></select>
        </label>
        <label>Endereço (URL)<input v-model="editandoApp.url" type="url" placeholder="https://" /></label>
        <label>Responsável<input v-model="editandoApp.responsavel" /></label>
        <label>Ordem<input v-model.number="editandoApp.ordem" type="number" /></label>
        <label class="largo">Descrição<textarea v-model="editandoApp.descricao" rows="3" /></label>
        <label class="caixa"><input v-model="editandoApp.ativo" type="checkbox" /> Visível no portal</label>
        <label class="caixa"><input v-model="editandoApp.restrita" type="checkbox" /> Restrita a pessoas específicas</label>
        <fieldset v-if="editandoApp.restrita" class="largo quem-acessa">
          <legend>Quem pode ver esta aplicação</legend>
          <p class="suave pequeno">Administradores veem todas as aplicações. Escolha os usuários que também podem ver esta.</p>
          <div class="lista-pessoas">
            <label v-for="p in pessoas.filter(x => x.papel !== 'admin')" :key="p.email" class="caixa pessoa">
              <input v-model="escolhidos" type="checkbox" :value="p.email" />
              <span><strong>{{ p.nome || p.email }}</strong><small v-if="p.nome">{{ p.email }}</small></span>
            </label>
            <p v-if="!pessoas.some(x => x.papel !== 'admin')" class="suave pequeno">Nenhum usuário autorizado ainda. Cadastre na aba Usuários autorizados.</p>
          </div>
        </fieldset>
      </div>
      <div class="barra">
        <button class="botao">Salvar</button>
        <button type="button" class="botao secundario" @click="editandoApp = null">Cancelar</button>
      </div>
    </form>
    <table class="tabela">
      <thead><tr><th>Aplicação</th><th>Área</th><th>Status</th><th>Visível</th><th>Quem vê</th><th></th></tr></thead>
      <tbody>
        <tr v-for="app in apps" :key="app.id">
          <td><strong>{{ app.nome }}</strong><br /><small class="suave">{{ app.url || 'sem link' }}</small></td>
          <td>{{ app.area }}</td>
          <td><span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span></td>
          <td>{{ app.ativo ? 'Sim' : 'Não' }}</td>
          <td>{{ app.restrita ? `${pessoasComAcesso(app.id).length} pessoa(s)` : 'Todos' }}</td>
          <td><button class="botao-link" @click="editarApp(app)">Editar</button></td>
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
