-- Modo apresentação: páginas dos painéis e ajustes por item.
-- paginas: lista de páginas visíveis do relatório do Power BI, preenchida pela automação diária
--          ([{ "nome": "ReportSection…", "titulo": "Visão geral", "ordem": 0 }, …]).
-- apresentacao: ajustes do item na TV, feitos pela tela Apresentação
--          ({ "tempo": 20, "fora": false, "paginas": "todas" | "primeira", "paginas_fora": ["ReportSection…"] }).
-- Pode ser reaplicada sem problema.
alter table public.aplicacoes add column if not exists paginas jsonb;
alter table public.aplicacoes add column if not exists apresentacao jsonb not null default '{}'::jsonb;
