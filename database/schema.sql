-- MEDCONTROL | PostgreSQL / Supabase
-- Somente dados fictícios. Execute este arquivo no SQL Editor de um projeto Supabase novo.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'reception'
    check (role in ('admin', 'reception', 'doctor', 'pharmacy')),
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) >= 3),
  birth_date date,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  specialty text not null,
  license_number text not null unique,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  presentation text not null,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 5 check (minimum_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  diagnosis text not null,
  summary text not null,
  created_by uuid references public.user_profiles(auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references public.medical_records(id) on delete restrict,
  medication_id uuid not null references public.medications(id) on delete restrict,
  dosage text not null,
  frequency text not null,
  duration_days integer not null check (duration_days > 0),
  instructions text,
  created_at timestamptz not null default now()
);

create index if not exists idx_appointments_doctor_time
  on public.appointments (doctor_id, scheduled_at);
create index if not exists idx_appointments_patient_time
  on public.appointments (patient_id, scheduled_at desc);
create index if not exists idx_records_appointment
  on public.medical_records (appointment_id);
create index if not exists idx_prescriptions_medical_record
  on public.prescriptions (medical_record_id);

-- Cria automaticamente um perfil básico quando uma conta é registrada no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (auth_user_id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Usuário MEDCONTROL'),
    coalesce(new.email, new.id::text || '@sem-email.local'),
    'reception'
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_medcontrol on auth.users;
create trigger on_auth_user_created_medcontrol
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Função centralizada para consultar o perfil do usuário autenticado sem expor a tabela de perfis.
create or replace function public.current_medcontrol_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_profiles where auth_user_id = auth.uid();
$$;

grant execute on function public.current_medcontrol_role() to authenticated;

alter table public.user_profiles enable row level security;
alter table public.patients enable row level security;
alter table public.doctors enable row level security;
alter table public.appointments enable row level security;
alter table public.medical_records enable row level security;
alter table public.medications enable row level security;
alter table public.prescriptions enable row level security;

-- Perfis: cada usuário consulta somente o próprio perfil; administradores podem consultar todos.
drop policy if exists "profile_self_or_admin_read" on public.user_profiles;
create policy "profile_self_or_admin_read" on public.user_profiles
for select to authenticated
using (auth_user_id = auth.uid() or public.current_medcontrol_role() = 'admin');

-- Pacientes: administração, recepção e médicos.
drop policy if exists "patients_staff_access" on public.patients;
create policy "patients_staff_access" on public.patients
for all to authenticated
using (public.current_medcontrol_role() in ('admin', 'reception', 'doctor'))
with check (public.current_medcontrol_role() in ('admin', 'reception', 'doctor'));

-- Médicos: todos os usuários autenticados podem consultar; somente administração altera cadastros.
drop policy if exists "doctors_read_authenticated" on public.doctors;
create policy "doctors_read_authenticated" on public.doctors
for select to authenticated using (true);
drop policy if exists "doctors_admin_write" on public.doctors;
create policy "doctors_admin_write" on public.doctors
for all to authenticated
using (public.current_medcontrol_role() = 'admin')
with check (public.current_medcontrol_role() = 'admin');

-- Consultas: administração, recepção e médicos.
drop policy if exists "appointments_staff_access" on public.appointments;
create policy "appointments_staff_access" on public.appointments
for all to authenticated
using (public.current_medcontrol_role() in ('admin', 'reception', 'doctor'))
with check (public.current_medcontrol_role() in ('admin', 'reception', 'doctor'));

-- Prontuários: administração e médicos.
drop policy if exists "records_clinical_access" on public.medical_records;
create policy "records_clinical_access" on public.medical_records
for all to authenticated
using (public.current_medcontrol_role() in ('admin', 'doctor'))
with check (public.current_medcontrol_role() in ('admin', 'doctor'));

-- Medicamentos: todos podem consultar; administração e farmácia podem alterar estoque/cadastro.
drop policy if exists "medications_read_authenticated" on public.medications;
create policy "medications_read_authenticated" on public.medications
for select to authenticated using (true);
drop policy if exists "medications_admin_pharmacy_write" on public.medications;
create policy "medications_admin_pharmacy_write" on public.medications
for all to authenticated
using (public.current_medcontrol_role() in ('admin', 'pharmacy'))
with check (public.current_medcontrol_role() in ('admin', 'pharmacy'));

-- Prescrições: administração e médicos.
drop policy if exists "prescriptions_clinical_access" on public.prescriptions;
create policy "prescriptions_clinical_access" on public.prescriptions
for all to authenticated
using (public.current_medcontrol_role() in ('admin', 'doctor'))
with check (public.current_medcontrol_role() in ('admin', 'doctor'));

-- Permissões de tabela e RLS atuam em conjunto: conceder acesso ao papel authenticated
-- não elimina as restrições definidas nas políticas acima.
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.patients, public.doctors,
  public.appointments, public.medical_records, public.medications,
  public.prescriptions to authenticated;

-- Cinco perfis fictícios para cumprir a base de demonstração. Não são contas autenticáveis.
insert into public.user_profiles (full_name, email, role) values
('Alex Demo - Administração', 'alex.admin@example.com', 'admin'),
('Bia Demo - Recepção', 'bia.recepcao@example.com', 'reception'),
('Caio Demo - Médico', 'caio.medico@example.com', 'doctor'),
('Dani Demo - Farmácia', 'dani.farmacia@example.com', 'pharmacy'),
('Enzo Demo - Apoio', 'enzo.apoio@example.com', 'reception')
on conflict (email) do nothing;

-- DADOS DE DEMONSTRAÇÃO: nomes e situações totalmente fictícios.
insert into public.patients (id, full_name, birth_date, phone, email) values
('11111111-1111-4111-8111-111111111111', 'Marina Costa', '1994-03-12', '(54) 90000-1001', 'marina.demo@example.com'),
('11111111-1111-4111-8111-111111111112', 'Lucas Martins', '1987-07-25', '(54) 90000-1002', 'lucas.demo@example.com'),
('11111111-1111-4111-8111-111111111113', 'Camila Ribeiro', '2001-11-08', '(54) 90000-1003', 'camila.demo@example.com'),
('11111111-1111-4111-8111-111111111114', 'Pedro Almeida', '1979-01-19', '(54) 90000-1004', 'pedro.demo@example.com'),
('11111111-1111-4111-8111-111111111115', 'Sofia Oliveira', '1999-05-30', '(54) 90000-1005', 'sofia.demo@example.com')
on conflict (id) do nothing;

insert into public.doctors (id, full_name, specialty, license_number, phone, active) values
('22222222-2222-4222-8222-222222222221', 'Dra. Renata Lopes', 'Clínica Geral', 'CRM-DEMO-1001', '(54) 90000-2001', true),
('22222222-2222-4222-8222-222222222222', 'Dr. André Nunes', 'Cardiologia', 'CRM-DEMO-1002', '(54) 90000-2002', true),
('22222222-2222-4222-8222-222222222223', 'Dra. Paula Mendes', 'Pediatria', 'CRM-DEMO-1003', '(54) 90000-2003', true),
('22222222-2222-4222-8222-222222222224', 'Dr. Felipe Rocha', 'Ortopedia', 'CRM-DEMO-1004', '(54) 90000-2004', true),
('22222222-2222-4222-8222-222222222225', 'Dra. Beatriz Lima', 'Dermatologia', 'CRM-DEMO-1005', '(54) 90000-2005', true)
on conflict (id) do nothing;

insert into public.medications (id, name, presentation, stock_quantity, minimum_stock, active) values
('55555555-5555-4555-8555-555555555551', 'Paracetamol (DEMO)', 'Comprimido - demonstração', 40, 10, true),
('55555555-5555-4555-8555-555555555552', 'Soro fisiológico (DEMO)', 'Frasco - demonstração', 7, 10, true),
('55555555-5555-4555-8555-555555555553', 'Loratadina (DEMO)', 'Comprimido - demonstração', 25, 8, true),
('55555555-5555-4555-8555-555555555554', 'Vitamina C (DEMO)', 'Comprimido - demonstração', 4, 10, true),
('55555555-5555-4555-8555-555555555555', 'Curativo (DEMO)', 'Unidade - demonstração', 60, 15, true)
on conflict (id) do nothing;

insert into public.appointments (id, patient_id, doctor_id, scheduled_at, status, reason) values
('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222221', '2026-11-10 09:00:00-03', 'scheduled', 'Consulta de rotina (demonstração)'),
('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111112', '22222222-2222-4222-8222-222222222222', '2026-11-10 10:00:00-03', 'scheduled', 'Avaliação cardiológica (demonstração)'),
('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111113', '22222222-2222-4222-8222-222222222223', '2026-11-11 08:30:00-03', 'completed', 'Retorno (demonstração)'),
('33333333-3333-4333-8333-333333333334', '11111111-1111-4111-8111-111111111114', '22222222-2222-4222-8222-222222222224', '2026-11-11 13:30:00-03', 'scheduled', 'Avaliação ortopédica (demonstração)'),
('33333333-3333-4333-8333-333333333335', '11111111-1111-4111-8111-111111111115', '22222222-2222-4222-8222-222222222225', '2026-11-12 14:00:00-03', 'cancelled', 'Consulta cancelada (demonstração)')
on conflict (id) do nothing;

insert into public.medical_records (id, appointment_id, diagnosis, summary) values
('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'Registro demonstrativo A', 'Atendimento fictício para teste de relacionamento.'),
('44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333332', 'Registro demonstrativo B', 'Atendimento fictício para teste de relacionamento.'),
('44444444-4444-4444-8444-444444444443', '33333333-3333-4333-8333-333333333333', 'Registro demonstrativo C', 'Atendimento fictício para teste de relacionamento.'),
('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333334', 'Registro demonstrativo D', 'Atendimento fictício para teste de relacionamento.'),
('44444444-4444-4444-8444-444444444445', '33333333-3333-4333-8333-333333333335', 'Registro demonstrativo E', 'Atendimento fictício para teste de relacionamento.')
on conflict (id) do nothing;

insert into public.prescriptions (id, medical_record_id, medication_id, dosage, frequency, duration_days, instructions) values
('66666666-6666-4666-8666-666666666661', '44444444-4444-4444-8444-444444444441', '55555555-5555-4555-8555-555555555551', 'Conforme exemplo acadêmico', 'Demonstração', 3, 'Não utilizar como orientação médica.'),
('66666666-6666-4666-8666-666666666662', '44444444-4444-4444-8444-444444444442', '55555555-5555-4555-8555-555555555552', 'Conforme exemplo acadêmico', 'Demonstração', 2, 'Não utilizar como orientação médica.'),
('66666666-6666-4666-8666-666666666663', '44444444-4444-4444-8444-444444444443', '55555555-5555-4555-8555-555555555553', 'Conforme exemplo acadêmico', 'Demonstração', 5, 'Não utilizar como orientação médica.'),
('66666666-6666-4666-8666-666666666664', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555554', 'Conforme exemplo acadêmico', 'Demonstração', 7, 'Não utilizar como orientação médica.'),
('66666666-6666-4666-8666-666666666665', '44444444-4444-4444-8444-444444444445', '55555555-5555-4555-8555-555555555555', 'Conforme exemplo acadêmico', 'Demonstração', 1, 'Não utilizar como orientação médica.')
on conflict (id) do nothing;
