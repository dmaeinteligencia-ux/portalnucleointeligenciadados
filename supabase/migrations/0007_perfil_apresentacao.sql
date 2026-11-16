-- Perfil "Apresentação": conta só para a TV/telão exibir o modo apresentação.
-- Pode ler o catálogo (o que um usuário comum vê) e nada mais. Não grava em nenhuma tabela:
-- - aplicacoes, permissoes, autorizados, avisos: a escrita já é só de administradores;
-- - acessos: este perfil deixa de poder registrar acessos (era a única escrita de não administradores).
-- No navegador, o portal leva esse perfil direto para /apresentacao, sem menu nem outras telas.
-- Pode ser reaplicada sem problema.
alter table public.autorizados drop constraint if exists autorizados_papel_check;
alter table public.autorizados add constraint autorizados_papel_check
  check (papel in ('admin', 'usuario', 'apresentacao'));

create or replace function public.is_apresentacao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.autorizados where email = public.email_atual() and papel = 'apresentacao')
$$;

drop policy if exists acessos_registrar on public.acessos;
create policy acessos_registrar on public.acessos for insert to authenticated
  with check (public.is_autorizado() and not public.is_apresentacao() and email = public.email_atual());
