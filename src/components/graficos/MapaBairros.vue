<script setup>
// Mapa de bolhas por bairro, sobre as ruas do OpenStreetMap (mesmo mapa dos relatórios da Ouvidoria).
// Cada bairro é um ponto (o ponto mediano das OS com coordenada daquele bairro) e a área da bolha é
// proporcional à quantidade de OS no recorte. Clicar numa bolha filtra o painel pelo bairro.
// Ao aproximar (zoom 14+), as bolhas de bairro dão lugar aos pontos (grade de ~100 m). No modo
// "Mapa de calor", os mesmos pontos viram manchas que mostram as ruas onde as OS se concentram.
// Só o desenho do mapa (as ruas) vem da internet; os dados das OS não saem do navegador.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { numero, pct, horas } from '../../lib/paineis'

const props = defineProps({
  itens: { type: Array, required: true }, // [{ codigo, nome, total, executadas, mediana_horas, lat, lon }]
  pontos: { type: Array, default: () => [] }, // [{ lat, lon, total }] na grade de ~100 m
  selecionado: { type: [Number, String], default: null },
  cor: { type: String, default: '#0e50a0' },
})
const emit = defineEmits(['escolher'])

const CENTRO = [-18.9186, -48.2772]
const LIMITES = [[-19.60, -48.95], [-18.40, -47.60]]
const raio = (n, max, maior = 26, menor = 4) => (!n || !max ? 0 : Math.max(menor, Math.sqrt(n / max) * maior))

const total = computed(() => props.itens.reduce((a, i) => a + i.total, 0))
const noMapa = computed(() => props.itens.filter((i) => i.lat != null && i.lon != null))
const foraDoMapa = computed(() => {
  const fora = props.itens.filter((i) => i.lat == null || i.lon == null)
  return { bairros: fora.length, n: fora.reduce((a, i) => a + i.total, 0) }
})
const maximo = computed(() => Math.max(0, ...noMapa.value.map((i) => i.total)))
const legenda = computed(() => {
  const m = maximo.value
  return m ? [...new Set([m, Math.round(m / 4), Math.max(1, Math.round(m / 16))])].filter((n) => n > 0) : []
})

const ZOOM_PONTOS = 14
const modo = ref('bolhas') // 'bolhas' | 'calor'
const zoom = ref(12)
const emPontos = computed(() => modo.value === 'bolhas' && zoom.value >= ZOOM_PONTOS)
const maxPonto = computed(() => Math.max(1, ...props.pontos.map((p) => p.total)))
// Referência do calor: o percentil 95, para um único ponto muito cheio não apagar o resto
const refCalor = computed(() => {
  const v = props.pontos.map((p) => p.total).sort((a, b) => a - b)
  return v.length ? Math.max(1, v[Math.floor(v.length * 0.95)]) : 1
})

const elemento = ref(null)
let L = null, mapa = null, camada = null, camadaPontos = null, camadaCalor = null, enquadrado = false
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function desenharPontos() {
  if (!mapa || !camadaPontos) return
  camadaPontos.clearLayers()
  if (!emPontos.value) return
  for (const p of props.pontos) {
    L.circleMarker([p.lat, p.lon], {
      radius: 2.5 + Math.sqrt(p.total / maxPonto.value) * 7, color: '#ffffff', weight: 0.5,
      fillColor: props.cor, fillOpacity: 0.65,
    }).bindTooltip(`<b>${numero(p.total)} OS</b> neste ponto (≈100 m)`, { direction: 'top' }).addTo(camadaPontos)
  }
}

function desenharCalor() {
  if (!mapa) return
  if (camadaCalor) { mapa.removeLayer(camadaCalor); camadaCalor = null }
  if (modo.value !== 'calor' || !L.heatLayer) return
  camadaCalor = L.heatLayer(props.pontos.map((p) => [p.lat, p.lon, Math.min(1, p.total / refCalor.value)]), {
    radius: 16, blur: 18, maxZoom: 15, minOpacity: 0.25,
    gradient: { 0.2: '#a9c4e8', 0.45: '#4a7fc4', 0.7: '#d98a1c', 1: '#c2414b' },
  }).addTo(mapa)
}

function desenharTudo() { desenhar(); desenharPontos(); desenharCalor() }

function desenhar() {
  if (!mapa || !camada) return
  camada.clearLayers()
  if (modo.value !== 'bolhas' || emPontos.value) return
  // Maiores primeiro, para as bolhas pequenas ficarem por cima e continuarem clicáveis
  for (const i of [...noMapa.value].sort((a, b) => b.total - a.total)) {
    const ativo = String(props.selecionado) === String(i.codigo)
    L.circleMarker([i.lat, i.lon], {
      radius: raio(i.total, maximo.value), color: ativo ? '#1b2a3a' : '#ffffff', weight: ativo ? 3 : 1,
      fillColor: props.cor, fillOpacity: ativo ? 0.9 : 0.6,
    })
      .bindTooltip(`<b>${escapar(i.nome)}</b><br>${numero(i.total)} OS (${pct(i.total, total.value)})`
        + (i.mediana_horas != null ? `<br>mediana até executar: ${horas(i.mediana_horas)}` : ''), { direction: 'top' })
      .on('mouseover', (e) => e.target.setStyle({ fillOpacity: 0.85 }))
      .on('mouseout', (e) => e.target.setStyle({ fillOpacity: ativo ? 0.9 : 0.6 }))
      .on('click', () => emit('escolher', i.codigo))
      .addTo(camada)
  }
  // Enquadra os bairros na primeira vez; depois mantém o zoom de quem está olhando
  if (!enquadrado && noMapa.value.length > 1) {
    mapa.fitBounds(L.latLngBounds(noMapa.value.map((i) => [i.lat, i.lon])).pad(0.1), { maxZoom: 14 })
    enquadrado = true
  }
}

onMounted(async () => {
  await nextTick()
  const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
  L = mod.default ?? mod
  window.L = L // o plugin de calor se pendura no L global
  await import('leaflet.heat')
  if (!elemento.value) return
  mapa = L.map(elemento.value, { center: CENTRO, zoom: 12, minZoom: 10, maxBounds: L.latLngBounds(LIMITES).pad(0.2), preferCanvas: true })
  mapa.on('zoomend', () => { zoom.value = mapa.getZoom() })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(mapa)
  mapa.attributionControl.setPrefix(false)
  camada = L.layerGroup().addTo(mapa)
  camadaPontos = L.layerGroup().addTo(mapa)
  desenharTudo()
  zoom.value = mapa.getZoom()
})
onBeforeUnmount(() => mapa?.remove())
watch([noMapa, () => props.selecionado, () => props.pontos, modo, emPontos], desenharTudo)
</script>

<template>
  <div class="mapa-bairros">
    <div class="mapa-bairros-modos" role="group" aria-label="Tipo de mapa">
      <button class="chip" :class="{ ativo: modo === 'bolhas' }" @click="modo = 'bolhas'">Bolhas por bairro</button>
      <button class="chip" :class="{ ativo: modo === 'calor' }" @click="modo = 'calor'">Mapa de calor</button>
      <span class="pequeno suave">{{ modo === 'calor' ? 'Mais quente = mais OS na rua.' : emPontos ? 'Pontos de ~100 m. Afaste o mapa para voltar às bolhas.' : 'Aproxime o mapa para ver os pontos.' }}</span>
    </div>
    <div ref="elemento" class="mapa-bairros-area" role="img" :aria-label="`Mapa com ${noMapa.length} bairros; a lista completa está em Bairros.`" />
    <div class="mapa-bairros-rodape pequeno suave">
      <div v-if="modo === 'calor'" class="mapa-bairros-legenda calor" aria-hidden="true">
        <span>menos</span><i class="escala-calor" /><span>mais OS</span>
      </div>
      <div v-else-if="emPontos" class="mapa-bairros-legenda" aria-hidden="true"><span>Cada ponto soma as OS de ~100 m ao redor.</span></div>
      <div v-else-if="legenda.length" class="mapa-bairros-legenda" aria-hidden="true">
        <span>OS</span>
        <span v-for="n in legenda" :key="n">
          <i :style="{ width: `${raio(n, maximo) * 2}px`, height: `${raio(n, maximo) * 2}px`, background: cor }" />{{ numero(n) }}
        </span>
      </div>
      <span v-else>Nenhum bairro do recorte tem posição no mapa.</span>
      <span v-if="foraDoMapa.bairros">
        {{ numero(foraDoMapa.bairros) }} {{ foraDoMapa.bairros === 1 ? 'bairro sem coordenada fica' : 'bairros sem coordenada ficam' }}
        fora do mapa ({{ numero(foraDoMapa.n) }} OS).
      </span>
    </div>
  </div>
</template>
