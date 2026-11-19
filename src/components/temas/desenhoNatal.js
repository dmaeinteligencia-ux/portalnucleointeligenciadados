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
