<script setup>
// Painel "Solicitações e Execuções de Serviços - Manutenção de Água".
// Dados: views painel.mag_* no srvbi (SIMA), via servidor-paineis na rede interna.
// Fora do painel: Corte OB e Religação OB. Equipes aparecem só pelo código (não há cadastro de nomes).
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import './painel-claro.css'
import GraficoMensal from '../../components/graficos/GraficoMensal.vue'
import Ranking from '../../components/graficos/Ranking.vue'
import MapaBairros from '../../components/graficos/MapaBairros.vue'
import Faisca from '../../components/graficos/Faisca.vue'
import Rosca from '../../components/graficos/Rosca.vue'
import MapaCalor from '../../components/graficos/MapaCalor.vue'
import Colunas from '../../components/graficos/Colunas.vue'
import Treemap from '../../components/graficos/Treemap.vue'
import Dispersao from '../../components/graficos/Dispersao.vue'
import Multiplos from '../../components/graficos/Multiplos.vue'
import { buscarPainel, numero, pct, horas, dataHora, PAINEIS_URL } from '../../lib/paineis'

const route = useRoute()
const router = useRouter()

// Paleta validada sobre fundo branco (azul DMAE, verde, âmbar para atenção)
const CORES = { abertas: '#0e50a0', executadas: '#2f9e72', atencao: '#d98a1c' }
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
  const serie = (k) => (dados.value?.mensal || []).map((m) => m[k])
  return [
    { rotulo: 'Solicitações', valor: numero(i.solicitacoes), nota: `${numero(i.os_abertas)} OS geradas`, faisca: serie('solicitacoes') },
    { rotulo: 'OS executadas', valor: pct(i.executadas, i.os_abertas), nota: `${numero(i.executadas)} de ${numero(i.os_abertas)} abertas no período`, faisca: serie('executadas_no_mes'), cor: CORES.executadas },
    { rotulo: 'Tempo até executar', valor: horas(i.mediana_horas), nota: `metade sai até esse tempo · 90% até ${horas(i.p90_horas)}`, faisca: serie('mediana_horas') },
    { rotulo: 'No prazo', valor: pct(i.no_prazo, i.com_prazo), nota: `das executadas com prazo definido (${numero(i.com_prazo)})`, medidor: i.com_prazo ? i.no_prazo / i.com_prazo : null },
    { rotulo: 'Reprogramadas', valor: pct(i.reprogramadas, i.os_abertas), nota: `${numero(i.reprogramadas)} OS`, faisca: serie('reprogramadas'), cor: CORES.atencao },
    { rotulo: 'Em aberto agora', valor: numero(i.em_aberto_agora), nota: `${numero(i.em_aberto_48h)} há mais de 48 h`, alerta: i.em_aberto_48h > 0 },
  ]
})
const corSituacao = { Executada: '#2f9e72', Reprogramada: '#d98a1c', Programada: '#0e50a0', Aguardando: '#8a9bb0', Cancelada: '#c2414b', Duplicidade: '#c2414b', Parcelada: '#6c8ebf' }
const situacao = computed(() => (dados.value?.situacao || []).map((s) => ({ ...s, cor: corSituacao[s.nome] || '#8a9bb0' })))
const FAIXAS_TEMPO = ['< 4 h', '4–12 h', '12–24 h', '1–2 d', '2–5 d', '5–10 d', '> 10 d']
const faixasTempo = computed(() => FAIXAS_TEMPO.map((nome, k) => ({
  nome, total: (dados.value?.faixas_tempo || []).find((x) => x.faixa === k + 1)?.total || 0,
  cor: k < 3 ? CORES.executadas : k < 5 ? CORES.abertas : CORES.atencao,
})))
const FAIXAS_IDADE = ['< 1 dia', '1–3 dias', '3–7 dias', '7–30 dias', '> 30 dias']
const RAMPA_IDADE = ['#f6dcb4', '#eebc78', '#d98a1c', '#ad6a0e', '#7a4a08']
const idadeAbertas = computed(() => FAIXAS_IDADE.map((nome, k) => ({
  nome, total: (dados.value?.idade_abertas || []).find((x) => x.faixa === k + 1)?.total || 0, cor: RAMPA_IDADE[k],
})))
const sintomasResumo = computed(() => {
  const l = dados.value?.sintomas || [], tot = ind.value.os_abertas || 1
  const top3 = l.slice(0, 3).reduce((a, x) => a + x.total, 0)
  return l.length >= 3 ? `Os 3 sintomas mais comuns somam ${pct(top3, tot)} das OS.` : ''
})
const imprimir = () => window.print()
const cobertura = computed(() => dados.value?.cobertura_mapa || {})
</script>

<template>
<div class="painel-claro">
  <header class="painel-cabecalho">
    <img src="/logo-dmae.png" alt="DMAE · Prefeitura de Uberlândia" class="painel-logo" />
    <div class="painel-titulo">
      <h1>Solicitações e Execuções de Serviços - Manutenção de Água</h1>
      <p>Dados do SIMA · DMAE</p>
    </div>
    <p v-if="dados?.atualizacao?.executado_em" class="pequeno suave painel-atualizado">
      Dados de {{ dataHora(dados.atualizacao.executado_em) }}<br />atualizados a cada hora
    </p>
    <nav class="painel-acoes">
      <button class="painel-botao" @click="imprimir">Imprimir / PDF</button>
      <RouterLink to="/" class="painel-botao secundario">‹ Portal</RouterLink>
    </nav>
  </header>

  <!-- Filtros: uma linha acima dos gráficos -->
  <section class="painel-filtros">
    <div class="atalhos" role="group" aria-label="Período">
      <button v-for="a in atalhos" :key="a.id" class="chip" :class="{ ativo: atalhoAtivo === a.id }" @click="usarAtalho(a)">{{ a.nome }}</button>
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
    <button v-if="temRecorte" class="link-limpar" @click="limparRecorte">Limpar filtros</button>
  </section>

  <section v-if="erro" class="cartao painel-erro">
    <h2>Painel indisponível</h2>
    <p>{{ erro.message }}</p>
    <ul v-if="erro.dicas?.length" class="painel-erro-dicas">
      <li v-for="d in erro.dicas" :key="d">{{ d }}</li>
    </ul>
    <p v-if="erro.rede" class="pequeno suave">Servidor de dados: <a :href="`${PAINEIS_URL}/saude`" target="_blank" rel="noopener">{{ PAINEIS_URL }}</a></p>
    <button class="painel-botao" @click="carregar">Tentar de novo</button>
  </section>

  <div v-else-if="dados" class="painel-grade" :class="{ carregando }">
    <section class="cartoes-indicadores">
      <article v-for="c in cartoes" :key="c.rotulo" class="indicador" :class="{ alerta: c.alerta }">
        <small>{{ c.rotulo }}</small>
        <strong>{{ c.valor }}</strong>
        <span class="pequeno suave">{{ c.nota }}</span>
        <Faisca v-if="c.faisca" :valores="c.faisca" :cor="c.cor || CORES.abertas" />
        <span v-else-if="c.medidor !== undefined && c.medidor !== null" class="medidor" :title="`${Math.round(c.medidor * 100)}% no prazo`">
          <i :style="{ width: `${c.medidor * 100}%` }" />
        </span>
      </article>
    </section>

    <section class="cartao area-mensal">
      <h2>OS abertas × executadas por mês</h2>
      <GraficoMensal :dados="dados.mensal" :series="[
        { campo: 'os_abertas', nome: 'OS abertas', cor: CORES.abertas, forma: 'coluna' },
        { campo: 'executadas_no_mes', nome: 'OS executadas no mês', cor: CORES.executadas },
      ]" />
    </section>

    <section class="cartao area-situacao">
      <h2>Situação das OS</h2>
      <Rosca :itens="situacao" />
      <h3 class="subtitulo">Motivos de reprogramação</h3>
      <Ranking :itens="dados.motivos" :cor="CORES.atencao" detalhe="nenhum" estilo="pirulito" />
    </section>

    <section class="cartao area-calor">
      <h2>Quando os pedidos chegam</h2>
      <p class="cartao-nota">OS abertas por dia da semana e hora</p>
      <MapaCalor :celulas="dados.semana_hora || []" />
    </section>

    <section class="cartao area-tempo">
      <h2>Quanto tempo levou para executar</h2>
      <p class="cartao-nota">OS executadas por faixa de tempo</p>
      <Colunas :itens="faixasTempo" />
      <p class="pequeno suave">Verde: até 24 h · azul: 1 a 5 dias · âmbar: mais de 5 dias.</p>
    </section>

    <section class="cartao area-servicos">
      <h2>Serviços mais pedidos</h2>
      <p class="cartao-nota">clique para filtrar · mediana até executar</p>
      <Ranking :itens="dados.servicos" :cor="CORES.abertas" clicavel :selecionado="sel('servico')" @escolher="(c) => alternar('servico', c)" />
    </section>

    <section class="cartao area-sintomas">
      <h2>O que o cidadão relatou</h2>
      <p class="cartao-nota">clique num bloco para filtrar</p>
      <Treemap :itens="dados.sintomas" :cor="CORES.executadas" :selecionado="sel('sintoma')" @escolher="(c) => alternar('sintoma', c)" />
      <p class="pequeno suave">{{ sintomasResumo }} O tamanho do bloco é o volume.</p>
    </section>

    <section class="cartao area-mapa">
      <h2>Onde estão as ocorrências</h2>
      <p class="cartao-nota">tamanho da bolha pela quantidade · clique para filtrar</p>
      <MapaBairros :itens="dados.bairros_mapa || []" :pontos="dados.mapa || []" :selecionado="f.bairro" :cor="CORES.abertas" @escolher="(c) => alternar('bairro', c)" />
      <p class="pequeno suave">
        Cada bairro fica no ponto central das suas OS com coordenada. No mapa de calor entram {{ pct(cobertura.com_posicao ?? cobertura.com_coordenada, cobertura.total) }} das OS:
        as que têm coordenada no SIMA ({{ pct(cobertura.com_coordenada, cobertura.total) }}) e as posicionadas pelo endereço (erro típico de ~30 m com o número do imóvel).
        Nos pontos do zoom ficam de fora as que só têm a rua, sem número.
      </p>
    </section>

    <section class="cartao area-bairros">
      <h2>Bairros</h2>
      <p class="cartao-nota">clique para filtrar</p>
      <Ranking :itens="dados.bairros" :cor="CORES.abertas" clicavel :selecionado="sel('bairro')" @escolher="(c) => alternar('bairro', c)" />
      <h3 class="subtitulo">Regiões DMAE</h3>
      <Multiplos :linhas="dados.regioes_mensal || []" :cor="CORES.abertas" :selecionado="f.regiao" @escolher="(c) => alternar('regiao', c)" />
    </section>

    <section class="cartao area-ruas">
      <h2>Ruas com mais OS</h2>
      <p class="cartao-nota">15 ruas com mais OS no período · rua · bairro</p>
      <Ranking :itens="(dados.ruas || []).map((r) => ({ codigo: `${r.cd_distrito}-${r.cd_logradouro}`, nome: `${r.nome} · ${r.bairro}`, total: r.total }))" :cor="CORES.abertas" detalhe="nenhum" />
    </section>

    <section class="cartao area-equipes">
      <h2>Equipes: volume × rapidez</h2>
      <p class="cartao-nota">15 equipes com mais OS · só código</p>
      <Dispersao :itens="dados.equipes" :cor="CORES.executadas" :selecionado="sel('equipe')" @escolher="(c) => alternar('equipe', c)" />
    </section>

    <section class="cartao area-idade">
      <h2>Há quanto tempo as pendentes esperam</h2>
      <p class="cartao-nota">OS em aberto agora, por idade</p>
      <Colunas :itens="idadeAbertas" />
      <p class="pequeno suave">Não depende do período escolhido, só dos outros filtros.</p>
    </section>

    <section class="cartao area-tabela">
      <h2>Tabela mensal</h2>
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
    </section>
  </div>

  <p v-else class="painel-carregando">Carregando o painel…</p>
</div>
</template>
