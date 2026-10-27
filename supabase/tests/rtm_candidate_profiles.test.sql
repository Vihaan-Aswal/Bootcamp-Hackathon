begin;

select plan(18);

select has_table(
    'public',
    'rtm_candidate_profiles',
    'profile persistence table exists'
);
select ok(
    (select relrowsecurity
     from pg_class
     where oid = 'public.rtm_candidate_profiles'::regclass),
    'row level security is enabled'
);
select ok(
    not has_table_privilege('anon', 'public.rtm_candidate_profiles', 'select'),
    'the unauthenticated anon role has no direct select grant'
);

insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    is_anonymous
)
values
    (
        '00000000-0000-4000-8000-000000000011',
        'authenticated',
        'authenticated',
        'rtm-rls-owner-a@example.invalid',
        '',
        '{}'::jsonb,
        '{}'::jsonb,
        true
    ),
    (
        '00000000-0000-4000-8000-000000000012',
        'authenticated',
        'authenticated',
        'rtm-rls-owner-b@example.invalid',
        '',
        '{}'::jsonb,
        '{}'::jsonb,
        true
    )
on conflict (id) do nothing;

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000011',
    true
);
select set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated","is_anonymous":true}',
    true
);
insert into public.rtm_candidate_profiles (profile_id, owner_id, schema_version, profile)
values (
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    '1.0.0',
    '{"profile_id":"10000000-0000-4000-8000-000000000011","schema_version":"1.0.0"}'::jsonb
);
select is(
    (select count(*)::integer from public.rtm_candidate_profiles),
    1,
    'anonymous owner A can insert and read their profile'
);
select is(
    (select profile ->> 'updated_at'
     from public.rtm_candidate_profiles
     where profile_id = '10000000-0000-4000-8000-000000000011'),
    (select updated_at::text
     from public.rtm_candidate_profiles
     where profile_id = '10000000-0000-4000-8000-000000000011'),
    'database timestamps are copied into the validated profile JSON'
);
select throws_ok(
    $$update public.rtm_candidate_profiles
      set owner_id = '00000000-0000-4000-8000-000000000012'
      where profile_id = '10000000-0000-4000-8000-000000000011'$$,
    '42501',
    null,
    'owner A cannot reassign a profile to owner B'
);

select set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000012',
    true
);
select set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated","is_anonymous":true}',
    true
);
select is(
    (select count(*)::integer from public.rtm_candidate_profiles),
    0,
    'anonymous owner B cannot read owner A profile'
);
select throws_ok(
    $$insert into public.rtm_candidate_profiles (profile_id, owner_id, schema_version, profile)
      values ('10000000-0000-4000-8000-000000000011',
              '00000000-0000-4000-8000-000000000012',
              '1.0.0',
              '{"profile_id":"10000000-0000-4000-8000-000000000011","schema_version":"1.0.0"}'::jsonb)
      on conflict (profile_id) do update
      set owner_id = excluded.owner_id, profile = excluded.profile$$,
    '42501',
    null,
    'anonymous owner B cannot hijack owner A profile through upsert'
);
select is(
    (with changed as (
        update public.rtm_candidate_profiles
        set profile = jsonb_set(profile, '{display_name}', '"changed by B"'::jsonb)
        where profile_id = '10000000-0000-4000-8000-000000000011'
        returning profile_id
    ) select count(*)::integer from changed),
    0,
    'anonymous owner B cannot update owner A profile'
);
select is(
    (with removed as (
        delete from public.rtm_candidate_profiles
        where profile_id = '10000000-0000-4000-8000-000000000011'
        returning profile_id
    ) select count(*)::integer from removed),
    0,
    'anonymous owner B cannot delete owner A profile'
);
insert into public.rtm_candidate_profiles (profile_id, owner_id, schema_version, profile)
values (
    '10000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000012',
    '1.0.0',
    '{"profile_id":"10000000-0000-4000-8000-000000000012","schema_version":"1.0.0"}'::jsonb
);
select is(
    (select count(*)::integer from public.rtm_candidate_profiles),
    1,
    'anonymous owner B can insert and read their own profile'
);

select set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000011',
    true
);
select set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated","is_anonymous":true}',
    true
);
select is(
    (select count(*)::integer from public.rtm_candidate_profiles),
    1,
    'anonymous owner A still sees only their own profile'
);
select is(
    (with changed as (
        update public.rtm_candidate_profiles
        set profile = jsonb_set(profile, '{display_name}', '"changed by A"'::jsonb)
        where profile_id = '10000000-0000-4000-8000-000000000011'
        returning profile_id
    ) select count(*)::integer from changed),
    1,
    'anonymous owner A can update their own profile'
);
select is(
    (with removed as (
        delete from public.rtm_candidate_profiles
        where profile_id = '10000000-0000-4000-8000-000000000011'
        returning profile_id
    ) select count(*)::integer from removed),
    1,
    'anonymous owner A can delete their own profile'
);

reset role;
set local role anon;
select throws_ok(
    'select * from public.rtm_candidate_profiles',
    '42501',
    'permission denied for table rtm_candidate_profiles',
    'unauthenticated anon role cannot read profiles'
);
select throws_ok(
    $$insert into public.rtm_candidate_profiles (profile_id, owner_id, schema_version, profile)
      values ('10000000-0000-4000-8000-000000000099',
              '00000000-0000-4000-8000-000000000099',
              '1.0.0',
              '{"profile_id":"10000000-0000-4000-8000-000000000099","schema_version":"1.0.0"}'::jsonb)$$,
    '42501',
    'permission denied for table rtm_candidate_profiles',
    'unauthenticated anon role cannot insert profiles'
);
select throws_ok(
    $$update public.rtm_candidate_profiles
      set profile = jsonb_set(profile, '{display_name}', '"changed by anon"'::jsonb)$$,
    '42501',
    'permission denied for table rtm_candidate_profiles',
    'unauthenticated anon role cannot update profiles'
);
select throws_ok(
    'delete from public.rtm_candidate_profiles',
    '42501',
    'permission denied for table rtm_candidate_profiles',
    'unauthenticated anon role cannot delete profiles'
);

reset role;
select * from finish();
rollback;
