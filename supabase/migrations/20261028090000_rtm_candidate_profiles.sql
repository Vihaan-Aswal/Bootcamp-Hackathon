begin;

create table if not exists public.rtm_candidate_profiles (
    profile_id uuid primary key,
    owner_id uuid not null references auth.users (id) on delete cascade,
    schema_version text not null,
    profile jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint rtm_candidate_profiles_profile_object check (
        jsonb_typeof(profile) = 'object'
        and profile ? 'profile_id'
        and profile ? 'schema_version'
    ),
    constraint rtm_candidate_profiles_profile_id_match check (
        profile_id::text = (profile ->> 'profile_id')
    ),
    constraint rtm_candidate_profiles_schema_version_match check (
        schema_version = (profile ->> 'schema_version')
    )
);

create index if not exists rtm_candidate_profiles_owner_updated_idx
    on public.rtm_candidate_profiles (owner_id, updated_at desc);

alter table public.rtm_candidate_profiles enable row level security;

revoke all on table public.rtm_candidate_profiles from public, anon;
grant select, insert, update, delete on table public.rtm_candidate_profiles to authenticated;

drop policy if exists rtm_candidate_profiles_select_own
    on public.rtm_candidate_profiles;
create policy rtm_candidate_profiles_select_own
    on public.rtm_candidate_profiles
    for select
    to authenticated
    using ((select auth.uid()) = owner_id);

drop policy if exists rtm_candidate_profiles_insert_own
    on public.rtm_candidate_profiles;
create policy rtm_candidate_profiles_insert_own
    on public.rtm_candidate_profiles
    for insert
    to authenticated
    with check ((select auth.uid()) = owner_id);

drop policy if exists rtm_candidate_profiles_update_own
    on public.rtm_candidate_profiles;
create policy rtm_candidate_profiles_update_own
    on public.rtm_candidate_profiles
    for update
    to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id);

drop policy if exists rtm_candidate_profiles_delete_own
    on public.rtm_candidate_profiles;
create policy rtm_candidate_profiles_delete_own
    on public.rtm_candidate_profiles
    for delete
    to authenticated
    using ((select auth.uid()) = owner_id);

create or replace function public.rtm_set_candidate_profile_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := coalesce(new.created_at, now());
    end if;
    new.updated_at := now();
    new.profile := jsonb_set(
        jsonb_set(new.profile, '{created_at}', to_jsonb(new.created_at::text), true),
        '{updated_at}',
        to_jsonb(new.updated_at::text),
        true
    );
    return new;
end;
$$;

revoke all on function public.rtm_set_candidate_profile_timestamps() from public, anon, authenticated;

drop trigger if exists rtm_candidate_profiles_set_timestamps
    on public.rtm_candidate_profiles;
create trigger rtm_candidate_profiles_set_timestamps
    before insert or update on public.rtm_candidate_profiles
    for each row execute function public.rtm_set_candidate_profile_timestamps();

commit;
