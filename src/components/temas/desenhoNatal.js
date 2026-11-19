// Desenhos do tema de Natal em volta da esfera do Núcleo (canvas 2D, traço holográfico do HUD).

// Contagem regressiva: até o Natal e, depois dele, até o ano novo
export function contagemNatal(d = new Date()) {
  const hoje = new Date(d); hoje.setHours(0, 0, 0, 0)
  const ano = hoje.getFullYear()
  const dias = alvo => Math.round((alvo - hoje) / 86400000)
  const natal = dias(new Date(ano, 11, 25))
  if (natal > 1) return { titulo: 'FELIZ NATAL', linha: `FALTAM ${natal} DIAS PARA O NATAL` }
  if (natal === 1) return { titulo: 'FELIZ NATAL', linha: 'AMANHÃ É NATAL' }
  if (natal === 0) return { titulo: 'FELIZ NATAL', linha: 'BOAS FESTAS' }
  if (hoje.getMonth() === 0) return { titulo: `FELIZ ${ano}`, linha: 'BOAS FESTAS' }
  const virada = dias(new Date(ano + 1, 0, 1))
  return { titulo: 'FELIZ ANO NOVO', linha: virada === 1 ? `AMANHÃ É ${ano + 1}` : `FALTAM ${virada} DIAS PARA ${ano + 1}` }
}

// Cor dos pontos e linhas da esfera em faixas, como uma bola de Natal listrada
const FAIXAS = [[255, 77, 99], [255, 201, 77], [52, 245, 164], [255, 201, 77]]
export const corFaixa = y => FAIXAS[Math.min(FAIXAS.length - 1, Math.floor(((y + 1) / 2) * FAIXAS.length))]

export function estrela(ctx, x, y, r, agora) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5)
  g.addColorStop(0, 'rgba(255,214,120,0.55)'); g.addColorStop(1, 'rgba(255,214,120,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fill()
  ctx.save(); ctx.translate(x, y); ctx.rotate(agora / 3000)
  ctx.strokeStyle = 'rgba(255,230,160,0.35)'; ctx.lineWidth = 1
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, f = i % 2 ? 2 : 2.8
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); ctx.lineTo(Math.cos(a) * r * f, Math.sin(a) * r * f); ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = '#ffe39a'; ctx.shadowColor = 'rgba(255,201,77,1)'; ctx.shadowBlur = 16
  ctx.fill(); ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,250,225,0.95)'; ctx.lineWidth = 1; ctx.stroke()
}

// Pinheiro holográfico: três andares em linhas verdes, luzes piscando e estrela no topo
const CORES_LUZ = ['255,77,99', '255,201,77', '56,214,255', '255,120,200']
export function arvore(ctx, x, base, alt, agora, semente = 0) {
  const larg = alt * 0.62
  const andares = [[0, 0.42, 0.42], [0.25, 0.7, 0.72], [0.5, 0.92, 1]]
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(52,245,164,0.85)'; ctx.fillStyle = 'rgba(52,245,164,0.10)'
  ctx.shadowColor = 'rgba(52,245,164,0.7)'; ctx.shadowBlur = 8
  for (const [t0, t1, l] of andares) {
    const yt = base - alt + t0 * alt, yb = base - alt + t1 * alt, meio = (larg * l) / 2
    ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + meio, yb); ctx.lineTo(x - meio, yb); ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  ctx.shadowBlur = 0
  // Tronco
  ctx.strokeStyle = 'rgba(255,190,110,0.8)'; ctx.fillStyle = 'rgba(255,170,90,0.25)'
  ctx.fillRect(x - alt * 0.05, base - alt * 0.08, alt * 0.1, alt * 0.08); ctx.strokeRect(x - alt * 0.05, base - alt * 0.08, alt * 0.1, alt * 0.08)
  // Luzes em zigue-zague
  for (let i = 0; i < 14; i++) {
    const t = 0.18 + (i / 13) * 0.72, y = base - alt + t * alt
    const meia = larg * 0.5 * (t * 0.95) * 0.75, lado = (i % 2 ? 1 : -1) * ((i * 37 + semente) % 7) / 7
    const cor = CORES_LUZ[(i + semente) % CORES_LUZ.length], b = 0.4 + 0.6 * Math.max(0, Math.sin(agora / 380 + i * 1.7 + semente))
    ctx.fillStyle = `rgba(${cor},${b})`; ctx.shadowColor = `rgba(${cor},1)`; ctx.shadowBlur = 8 * b
    ctx.beginPath(); ctx.arc(x + lado * meia, y, 2.2, 0, Math.PI * 2); ctx.fill()
  }
  ctx.shadowBlur = 0
  estrela(ctx, x, base - alt - 2, alt * 0.07, agora + semente * 500)
}

export function presente(ctx, x, y, s, cor, laco) {
  ctx.fillStyle = `rgba(${cor},0.22)`; ctx.strokeStyle = `rgba(${cor},0.95)`; ctx.lineWidth = 1.2
  ctx.shadowColor = `rgba(${cor},0.8)`; ctx.shadowBlur = 8
  ctx.fillRect(x - s / 2, y - s, s, s); ctx.strokeRect(x - s / 2, y - s, s, s)
  ctx.strokeRect(x - s * 0.56, y - s * 1.12, s * 1.12, s * 0.2)
  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(${laco},0.95)`; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 1.12); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(x - s * 0.16, y - s * 1.2, s * 0.16, s * 0.09, -0.5, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(x + s * 0.16, y - s * 1.2, s * 0.16, s * 0.09, 0.5, 0, Math.PI * 2); ctx.stroke()
}

// Tampa dourada, argola e fita: a esfera fica pendurada como uma bola de Natal
export function tampaEFita(ctx, cx, topoEsfera, R, agora) {
  const lt = R * 0.3, at = R * 0.16, yt = topoEsfera - at * 0.55
  // Fita vermelha descendo do alto do quadro, com laço
  ctx.strokeStyle = 'rgba(255,77,99,0.9)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,77,99,0.8)'; ctx.shadowBlur = 8
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, yt - at * 0.9); ctx.stroke()
  const yl = Math.max(14, yt - at * 2.6), bal = Math.sin(agora / 900) * 0.08
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.ellipse(cx - R * 0.13, yl, R * 0.13, R * 0.06, -0.45 + bal, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(cx + R * 0.13, yl, R * 0.13, R * 0.06, 0.45 - bal, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, yl); ctx.lineTo(cx - R * 0.1, yl + R * 0.2); ctx.moveTo(cx, yl); ctx.lineTo(cx + R * 0.1, yl + R * 0.2); ctx.stroke()
  ctx.fillStyle = 'rgba(255,77,99,1)'; ctx.beginPath(); ctx.arc(cx, yl, 3, 0, Math.PI * 2); ctx.fill()
  // Argola
  ctx.strokeStyle = 'rgba(255,214,120,0.95)'; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(255,201,77,0.9)'
  ctx.beginPath(); ctx.ellipse(cx, yt - at * 0.65, at * 0.35, at * 0.45, 0, 0, Math.PI * 2); ctx.stroke()
  // Tampa com frisos
  const g = ctx.createLinearGradient(cx - lt / 2, 0, cx + lt / 2, 0)
  g.addColorStop(0, 'rgba(160,110,30,0.9)'); g.addColorStop(0.5, 'rgba(255,225,140,0.95)'); g.addColorStop(1, 'rgba(160,110,30,0.9)')
  ctx.fillStyle = g; ctx.shadowBlur = 12
  ctx.beginPath(); ctx.roundRect(cx - lt / 2, yt - at * 0.25, lt, at, 3); ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(120,80,20,0.6)'; ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) { const x = cx - lt / 2 + (lt * i) / 6; ctx.beginPath(); ctx.moveTo(x, yt - at * 0.2); ctx.lineTo(x, yt + at * 0.7); ctx.stroke() }
}
