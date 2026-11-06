-- Portal do Núcleo de Inteligência de Dados (DMAE)
-- Estrutura inicial: usuários autorizados, catálogo de aplicações, permissões, acessos e avisos.

-- Usuários autorizados (só quem está aqui consegue criar conta e entrar)
create table if not exists public.autorizados (
  email      text primary key check (email = lower(email)),
  nome       text,
  papel      text not null default 'usuario' check (papel in ('admin', 'usuario')),
  criado_em  timestamptz not null default now()
);

-- Catálogo de aplicações
create table if not exists public.aplicacoes (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nome         text not null,
  descricao    text,
  area         text,
  status       text not null default 'producao' check (status in ('producao', 'piloto', 'desenvolvimento')),
  url          text,
  responsavel  text,
  restrita     boolean not null default false, -- true: só quem está em permissoes vê
  ativo        boolean not null default true,
  ordem        int not null default 100,
  criado_em    timestamptz not null default now()
);

-- Quem pode ver cada aplicação restrita
create table if not exists public.permissoes (
  email         text not null references public.autorizados(email) on delete cascade on update cascade,
  aplicacao_id  uuid not null references public.aplicacoes(id) on delete cascade,
  primary key (email, aplicacao_id)
);

-- Registro de cada acesso a uma aplicação pelo portal
create table if not exists public.acessos (
  id            bigint generated always as identity primary key,
  email         text not null,
  aplicacao_id  uuid not null references public.aplicacoes(id) on delete cascade,
  em            timestamptz not null default now()
);
create index if not exists acessos_em_idx on public.acessos (em desc);

-- Avisos do Núcleo na página inicial
create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  texto         text,
  ativo         boolean not null default true,
  publicado_em  timestamptz not null default now()
);

-- Funções de apoio
create or replace function public.email_atual() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_autorizado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.autorizados where email = public.email_atual())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.autorizados where email = public.email_atual() and papel = 'admin')
$$;

-- Bloqueia a criação de conta de quem não está autorizado
create or replace function public.bloquear_nao_autorizados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.autorizados where email = lower(new.email)) then
    raise exception 'E-mail não autorizado no portal';
  end if;
  return new;
end $$;

drop trigger if exists bloquear_nao_autorizados on auth.users;
create trigger bloquear_nao_autorizados
  before insert on auth.users
  for each row execute function public.bloquear_nao_autorizados();

-- Row Level Security
alter table public.autorizados enable row level security;
alter table public.aplicacoes  enable row level security;
alter table public.permissoes  enable row level security;
alter table public.acessos     enable row level security;
alter table public.avisos      enable row level security;

create policy autorizados_ler on public.autorizados for select to authenticated
  using (email = public.email_atual() or public.is_admin());
create policy autorizados_admin on public.autorizados for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy aplicacoes_ler on public.aplicacoes for select to authenticated
  using (
    public.is_admin()
    or (public.is_autorizado() and ativo and (
      not restrita
      or exists (select 1 from public.permissoes p where p.aplicacao_id = id and p.email = public.email_atual())
    ))
  );
create policy aplicacoes_admin on public.aplicacoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy permissoes_ler on public.permissoes for select to authenticated
  using (email = public.email_atual() or public.is_admin());
create policy permissoes_admin on public.permissoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy acessos_registrar on public.acessos for insert to authenticated
  with check (public.is_autorizado() and email = public.email_atual());
create policy acessos_ler on public.acessos for select to authenticated
  using (public.is_admin());

create policy avisos_ler on public.avisos for select to authenticated
  using (public.is_admin() or (public.is_autorizado() and ativo));
create policy avisos_admin on public.avisos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Dados iniciais
insert into public.autorizados (email, papel) values
  ('euthiagosilveira@gmail.com', 'admin'),
  ('nativowesley@gmail.com', 'admin')
on conflict (email) do nothing;

insert into public.aplicacoes (slug, nome, descricao, area, status, ordem) values
  ('ouvidoria', 'Ouvidoria', 'Registro e acompanhamento das manifestações recebidas pela Ouvidoria.', 'Atendimento', 'producao', 10),
  ('agenda-lavagem', 'Agenda de lavagem', 'Agendamento das lavagens.', 'Operação', 'producao', 20)
on conflict (slug) do nothing;
