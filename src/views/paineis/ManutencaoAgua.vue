<script setup>
// Painel "Solicitações e Execuções de Serviços - Manutenção de Água".
// Dados: views painel.mag_* no srvbi (SIMA), via servidor-paineis na rede interna.
// Fora do painel: Corte OB e Religação OB. Equipes aparecem só pelo código (não há cadastro de nomes).
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HudPanel from '../../components/HudPanel.vue'
import GraficoMensal from '../../components/graficos/GraficoMensal.vue'
import Ranking from '../../components/graficos/Ranking.vue'
import MapaPontos from '../../components/graficos/MapaPontos.vue'
import { buscarPainel, numero, pct, horas, dataHora, PAINEIS_URL } from '../../lib/paineis'

const route = useRoute()
const router = useRouter()

const CORES = { abertas: '#38d6ff', executadas: '#a78bfa' }
const CAMPOS = ['inicio', 'fim', 'servico', 'sintoma', 'bairro', 'regiao', 'equipe']

const hoje = new Date()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const atalhos = [
  { id: '30d', nome: '30 dias', inicio: () => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29)) },
  { id: 'ano', nome: 'Este ano', inicio: () => `${hoje.getFullYear()}-01-01` },
  { id: '12m', nome: '12 meses', inicio: () => iso(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)) },
  { id: '24m', nome: '24 meses', inicio: () => iso(new Date(hoje.getFullYear() - 2, hoje.getMonth(), 1)) },
]

// Filtros ficam no endereço: dá para compartilhar o link de um recorte
const f = reactive(Object.fromEntries(CAMPOS.map((c) => [c, route.query[c] || ''])))
if (!f.inicio) f.inicio = atalhos[2].inicio()
if (!f.fim) f.fim = iso(hoje)
const atalhoAtivo = computed(() => (f.fim === iso(hoje) ? atalhos.find((a) => a.inicio() === f.inicio)?.id : null))
const usarAtalho = (a) => { f.inicio = a.inicio(); f.fim = iso(hoje) }

const opcoes = ref(null)
const dados = ref(null)
const carregando = ref(false)
const erro = ref(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    if (!opcoes.value) opcoes.value = await buscarPainel('manutencao-agua/opcoes')
    dados.value = await buscarPainel('manutencao-agua/dados', { ...f })
  } catch (e) {
    erro.value = e
  } finally {
    carregando.value = false
  }
}

let espera
watch(f, () => {
  router.replace({ query: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })
  clearTimeout(espera)
  espera = setTimeout(carregar, 250)
})
onMounted(carregar)

const alternar = (campo, valor) => { f[campo] = String(f[campo]) === String(valor) ? '' : String(valor) }
const temRecorte = computed(() => ['servico', 'sintoma', 'bairro', 'regiao', 'equipe'].some((c) => f[c]))
const limparRecorte = () => { for (const c of ['servico', 'sintoma', 'bairro', 'regiao', 'equipe']) f[c] = '' }
const sel = (campo) => (f[campo] ? Number(f[campo]) : null)

const ind = computed(() => dados.value?.indicadores || {})
const cartoes = computed(() => {
  const i = ind.value
  return [
    { rotulo: 'Solicitações', valor: numero(i.solicitacoes), nota: `${numero(i.os_abertas)} OS geradas` },
    { rotulo: 'OS executadas', valor: pct(i.executadas, i.os_abertas), nota: `${numero(i.executadas)} de ${numero(i.os_abertas)} abertas no período` },
    { rotulo: 'Tempo até executar', valor: horas(i.mediana_horas), nota: `metade sai até esse tempo · 90% até ${horas(i.p90_horas)}` },
    { rotulo: 'No prazo', valor: pct(i.no_prazo, i.com_prazo), nota: `das executadas com prazo definido (${numero(i.com_prazo)})` },
    { rotulo: 'Reprogramadas', valor: pct(i.reprogramadas, i.os_abertas), nota: `${numero(i.reprogramadas)} OS` },
    { rotulo: 'Em aberto agora', valor: numero(i.em_aberto_agora), nota: `${numero(i.em_aberto_48h)} há mais de 48 h`, alerta: i.em_aberto_48h > 0 },
  ]
})
const situacaoTotal = computed(() => (dados.value?.situacao || []).reduce((a, s) => a + s.total, 0))
const corSituacao = { Executada: '#a78bfa', Reprogramada: '#ffc94d', Programada: '#38d6ff', Aguardando: '#7d9bbb', Cancelada: '#ff6b7d', Duplicidade: '#ff6b7d', Parcelada: '#3b6f9e' }
const cobertura = computed(() => dados.value?.cobertura_mapa || {})
</script>

<template>
<div class="painel-proprio">
  <header class="painel-cabecalho">
    <div>
      <h1 class="titulo-tela">Manutenção de Água</h1>
      <p class="suave">Solicitações e execuções de serviços · Sistema SIMA</p>
    </div>
    <p v-if="dados?.atualizacao?.executado_em" class="pequeno suave painel-atualizado">
      Dados de {{ dataHora(dados.atualizacao.executado_em) }}<br />atualizados a cada hora
    </p>
  </header>

  <!-- Filtros: uma linha acima dos gráficos -->
  <section class="painel-filtros">
    <div class="atalhos" role="group" aria-label="Período">
      <button v-for="a in atalhos" :key="a.id" class="feed-filtro" :class="{ ativo: atalhoAtivo === a.id }" @click="usarAtalho(a)">{{ a.nome }}</button>
    </div>
    <label>De <input v-model="f.inicio" type="date" :min="opcoes?.periodo?.inicio" :max="f.fim" /></label>
    <label>Até <input v-model="f.fim" type="date" :min="f.inicio" /></label>
    <select v-model="f.servico" aria-label="Serviço">
      <option value="">Todos os serviços</option>
      <option v-for="o in opcoes?.servicos || []" :key="o.codigo" :value="String(o.codigo)">{{ o.nome }}</option>
    </select>
    <select v-model="f.sintoma" aria-label="Sintoma">
      <option value="">Todos os sintomas</option>
      <option v-for="o in opcoes?.sintomas || []" :key="o.codigo" :value="String(o.codigo)">{{ o.nome }}</option>
    </select>
    <select v-model="f.bairro" aria-label="Bairro">
      <option value="">Todos os bairros</option>
      <option v-for="o in opcoes?.bairros || []" :key="o.codigo" :value="String(o.codigo)">{{ o.nome }}</option>
    </select>
    <select v-model="f.regiao" aria-label="Região">
      <option value="">Todas as regiões</option>
      <option v-for="o in opcoes?.regioes || []" :key="o.codigo" :value="String(o.codigo)">{{ o.nome }}</option>
    </select>
    <select v-model="f.equipe" aria-label="Equipe">
      <option value="">Todas as equipes</option>
      <option v-for="o in opcoes?.equipes || []" :key="o.codigo" :value="String(o.codigo)">{{ o.nome }}</option>
    </select>
    <button v-if="temRecorte" class="botao-link" @click="limparRecorte">Limpar filtros</button>
  </section>

  <HudPanel v-if="erro" class="painel-erro">
    <h2>Painel indisponível</h2>
    <p>{{ erro.message }}</p>
    <p v-if="erro.rede" class="pequeno suave">Servidor de dados: <a :href="`${PAINEIS_URL}/saude`" target="_blank" rel="noopener">{{ PAINEIS_URL }}</a></p>
    <button class="botao secundario" @click="carregar">Tentar de novo</button>
  </HudPanel>

  <div v-else-if="dados" class="painel-grade" :class="{ carregando }">
    <section class="cartoes-indicadores">
      <article v-for="c in cartoes" :key="c.rotulo" class="indicador" :class="{ alerta: c.alerta }">
        <small>{{ c.rotulo }}</small>
        <strong>{{ c.valor }}</strong>
        <span class="pequeno suave">{{ c.nota }}</span>
      </article>
    </section>

    <HudPanel titulo="OS abertas × executadas por mês" class="area-mensal">
      <GraficoMensal :dados="dados.mensal" :series="[
        { campo: 'os_abertas', nome: 'OS abertas', cor: CORES.abertas },
        { campo: 'executadas_no_mes', nome: 'OS executadas no mês', cor: CORES.executadas },
      ]" />
    </HudPanel>

    <HudPanel titulo="Situação das OS" class="area-situacao">
      <div class="barra-situacao" role="img" :aria-label="(dados.situacao || []).map((s) => `${s.nome} ${s.total}`).join(', ')">
        <i v-for="s in dados.situacao" :key="s.nome" :title="`${s.nome}: ${numero(s.total)}`"
           :style="{ flexGrow: s.total, background: corSituacao[s.nome] || '#7d9bbb' }" />
      </div>
      <ul class="lista-situacao">
        <li v-for="s in dados.situacao" :key="s.nome">
          <i :style="{ background: corSituacao[s.nome] || '#7d9bbb' }" />{{ s.nome }}
          <b>{{ numero(s.total) }}</b><span class="suave">{{ pct(s.total, situacaoTotal) }}</span>
        </li>
      </ul>
      <h3 class="subtitulo">Motivos de reprogramação</h3>
      <Ranking :itens="dados.motivos" cor="#ffc94d" detalhe="nenhum" />
    </HudPanel>

    <HudPanel titulo="Serviços mais pedidos" class="area-servicos">
      <template #acao><span class="pequeno suave">clique para filtrar · mediana até executar</span></template>
      <Ranking :itens="dados.servicos" clicavel :selecionado="sel('servico')" @escolher="(c) => alternar('servico', c)" />
    </HudPanel>

    <HudPanel titulo="O que o cidadão relatou" class="area-sintomas">
      <template #acao><span class="pequeno suave">clique para filtrar</span></template>
      <Ranking :itens="dados.sintomas" cor="#a78bfa" clicavel :selecionado="sel('sintoma')" @escolher="(c) => alternar('sintoma', c)" />
    </HudPanel>

    <HudPanel titulo="Onde estão as ocorrências" class="area-mapa">
      <MapaPontos :pontos="dados.mapa" />
      <p class="pequeno suave">{{ pct(cobertura.com_coordenada, cobertura.total) }} das OS têm coordenada no SIMA. O ranking por bairro abaixo considera todas.</p>
    </HudPanel>

    <HudPanel titulo="Bairros" class="area-bairros">
      <template #acao><span class="pequeno suave">clique para filtrar</span></template>
      <Ranking :itens="dados.bairros" clicavel :selecionado="sel('bairro')" @escolher="(c) => alternar('bairro', c)" />
      <h3 class="subtitulo">Regiões DMAE</h3>
      <Ranking :itens="dados.regioes" clicavel :selecionado="sel('regiao')" @escolher="(c) => alternar('regiao', c)" />
    </HudPanel>

    <HudPanel titulo="Equipes que mais executaram" class="area-equipes">
      <template #acao><span class="pequeno suave">só código · clique para filtrar</span></template>
      <Ranking :itens="dados.equipes" cor="#a78bfa" clicavel :selecionado="sel('equipe')" @escolher="(c) => alternar('equipe', c)" />
    </HudPanel>

    <HudPanel titulo="Tabela mensal" class="area-tabela">
      <div class="tabela-rolagem">
        <table class="tabela-painel">
          <thead><tr><th>Mês</th><th>Solicitações</th><th>OS abertas</th><th>Executadas no mês</th><th>Reprogramadas</th><th>Mediana até executar</th></tr></thead>
          <tbody>
            <tr v-for="m in [...dados.mensal].reverse()" :key="m.mes">
              <td>{{ m.mes.slice(5, 7) }}/{{ m.mes.slice(0, 4) }}</td><td>{{ numero(m.solicitacoes) }}</td><td>{{ numero(m.os_abertas) }}</td>
              <td>{{ numero(m.executadas_no_mes) }}</td><td>{{ numero(m.reprogramadas) }}</td><td>{{ horas(m.mediana_horas) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="pequeno suave">Solicitações, OS abertas e reprogramadas contam pelo mês da abertura; executadas, pelo mês da execução. Não inclui Corte OB e Religação OB.</p>
    </HudPanel>
  </div>

  <p v-else class="suave">Carregando o painel…</p>
</div>
</template>
