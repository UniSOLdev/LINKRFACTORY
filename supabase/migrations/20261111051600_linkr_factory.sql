-- Durable factory state. The browser never receives the database role.
-- Anonymous and authenticated Data API roles have no grants.

create schema if not exists linkr_factory;

create table if not exists linkr_factory.factory_state (
  id integer primary key check (id = 1),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint factory_state_simulated check (
    (payload->>'lead' is null)
    or (
      (payload->'lead'->>'simulation') = 'true'
      and (payload->'lead'->>'verified') = 'false'
    )
  )
);

create table if not exists linkr_factory.jobs (
  id text primary key,
  kind text not null,
  status text not null,
  simulation boolean not null default true,
  payload jsonb not null,
  updated_at timestamptz not null,
  constraint jobs_simulated check (
    simulation = true
    and (payload->>'simulation') = 'true'
    and (payload->>'executor') = 'simulation'
    and (
      payload->'outputs' is null
      or (
        (payload->'outputs'->>'simulation') = 'true'
        and (payload->'outputs'->>'verified') = 'false'
      )
    )
  )
);

create table if not exists linkr_factory.audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  actor text not null,
  action text not null,
  detail text not null,
  job_id text,
  simulation boolean not null default true,
  verified boolean not null default false,
  constraint audit_simulated check (simulation = true and verified = false),
  constraint audit_event_once unique (job_id, action, at)
);

alter table linkr_factory.factory_state enable row level security;
alter table linkr_factory.jobs enable row level security;
alter table linkr_factory.audit_events enable row level security;

revoke all on schema linkr_factory from public, anon, authenticated;
revoke all on all tables in schema linkr_factory from public, anon, authenticated;

grant usage on schema linkr_factory to linkr_app;
grant select, insert, update, delete on linkr_factory.factory_state to linkr_app;
grant select, insert, update, delete on linkr_factory.jobs to linkr_app;
grant select, insert, update, delete on linkr_factory.audit_events to linkr_app;
grant usage, select on sequence linkr_factory.audit_events_id_seq to linkr_app;

create policy linkr_app_factory_state on linkr_factory.factory_state
  for all to linkr_app
  using (true)
  with check (true);

create policy linkr_app_jobs on linkr_factory.jobs
  for all to linkr_app
  using (simulation = true)
  with check (simulation = true);

create policy linkr_app_audit on linkr_factory.audit_events
  for all to linkr_app
  using (simulation = true and verified = false)
  with check (simulation = true and verified = false);
