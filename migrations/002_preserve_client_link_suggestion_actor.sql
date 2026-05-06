-- Preserve legacy reviewer identity when the operator row no longer exists.

begin;

set search_path = ariad, public;

alter table client_link_suggestions
  add column if not exists reviewed_by_actor text not null default '';

commit;
