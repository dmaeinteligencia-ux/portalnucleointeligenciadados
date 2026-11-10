-- Rode uma vez no SQL Editor do Supabase deste sistema.
-- O monitoramento do Portal do Núcleo chama esta função 3 vezes por dia: mostra se o banco
-- está no ar e mantém o banco em uso, para o plano grátis não pausar depois de 7 dias parado.
create or replace function public.ping() returns timestamptz
language sql stable as $$ select now() $$;

grant execute on function public.ping() to anon, authenticated;
