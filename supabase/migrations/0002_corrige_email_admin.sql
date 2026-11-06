-- Corrige o e-mail do primeiro administrador (grafia errada na 0001 aplicada em 06/11/2026)
update public.autorizados
   set email = 'euthiagosilveira@gmail.com'
 where email = 'euthigosilveira@gmail.com'
   and not exists (select 1 from public.autorizados where email = 'euthiagosilveira@gmail.com');
