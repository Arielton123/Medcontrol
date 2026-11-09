import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, AlertCircle, ArrowUpRight, CalendarDays, Check,
  ClipboardList, Clock3, Database, FilePlus2, FileText,
  LayoutDashboard, LogOut, Menu, Pill, Plus, Search, ShieldCheck,
  Stethoscope, Trash2, Users, X, Pencil, RefreshCw, LockKeyhole,
} from 'lucide-react';
import { deleteRow, fetchRows, saveRow, checkAppointmentConflict, type DataRow, type ResourceName } from './lib/data';
import { getSupabase, isSupabaseConfigured } from './lib/supabase';

type UserRole = 'admin' | 'reception' | 'doctor' | 'pharmacy';
type UserProfile = { id: string; full_name: string; role: UserRole };
type FieldKind = 'text' | 'email' | 'date' | 'datetime-local' | 'number' | 'select' | 'textarea' | 'checkbox';
type FieldOption = { table: ResourceName; labelField: string };
type ResourceField = {
  name: string;
  label: string;
  type: FieldKind;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  relation?: FieldOption;
  min?: number;
};
type ResourceConfig = {
  key: ResourceName;
  title: string;
  subtitle: string;
  icon: typeof Users;
  roles: UserRole[];
  fields: ResourceField[];
  columns: string[];
};

type ReferenceMap = Partial<Record<ResourceName, DataRow[]>>;

const RESOURCES: ResourceConfig[] = [
  {
    key: 'patients', title: 'Pacientes', subtitle: 'Cadastro e informações básicas dos pacientes.', icon: Users,
    roles: ['admin', 'reception', 'doctor'],
    fields: [
      { name: 'full_name', label: 'Nome completo', type: 'text', required: true, placeholder: 'Nome do paciente' },
      { name: 'birth_date', label: 'Data de nascimento', type: 'date' },
      { name: 'phone', label: 'Telefone', type: 'text', placeholder: '(00) 00000-0000' },
      { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@exemplo.com' },
    ], columns: ['full_name', 'birth_date', 'phone', 'email'],
  },
  {
    key: 'doctors', title: 'Médicos', subtitle: 'Profissionais, especialidades e registro profissional fictício.', icon: Stethoscope,
    roles: ['admin'],
    fields: [
      { name: 'full_name', label: 'Nome completo', type: 'text', required: true },
      { name: 'specialty', label: 'Especialidade', type: 'text', required: true },
      { name: 'license_number', label: 'Registro profissional', type: 'text', required: true },
      { name: 'phone', label: 'Telefone', type: 'text' },
      { name: 'active', label: 'Cadastro ativo', type: 'checkbox' },
    ], columns: ['full_name', 'specialty', 'license_number', 'active'],
  },
  {
    key: 'appointments', title: 'Consultas', subtitle: 'Agendamento, acompanhamento e situação dos atendimentos.', icon: CalendarDays,
    roles: ['admin', 'reception', 'doctor'],
    fields: [
      { name: 'patient_id', label: 'Paciente', type: 'select', required: true, relation: { table: 'patients', labelField: 'full_name' } },
      { name: 'doctor_id', label: 'Médico', type: 'select', required: true, relation: { table: 'doctors', labelField: 'full_name' } },
      { name: 'scheduled_at', label: 'Data e horário', type: 'datetime-local', required: true },
      { name: 'status', label: 'Situação', type: 'select', required: true, options: ['scheduled', 'completed', 'cancelled'] },
      { name: 'reason', label: 'Motivo do atendimento', type: 'textarea', required: true },
    ], columns: ['patient_id', 'doctor_id', 'scheduled_at', 'status', 'reason'],
  },
  {
    key: 'medical_records', title: 'Prontuários', subtitle: 'Registros acadêmicos vinculados a consultas.', icon: FileText,
    roles: ['admin', 'doctor'],
    fields: [
      { name: 'appointment_id', label: 'Consulta', type: 'select', required: true, relation: { table: 'appointments', labelField: 'reason' } },
      { name: 'diagnosis', label: 'Identificação do registro', type: 'text', required: true },
      { name: 'summary', label: 'Resumo do atendimento', type: 'textarea', required: true },
    ], columns: ['appointment_id', 'diagnosis', 'summary', 'created_at'],
  },
  {
    key: 'medications', title: 'Medicamentos', subtitle: 'Catálogo demonstrativo e controle de estoque.', icon: Pill,
    roles: ['admin', 'pharmacy', 'doctor'],
    fields: [
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'presentation', label: 'Apresentação', type: 'text', required: true },
      { name: 'stock_quantity', label: 'Quantidade em estoque', type: 'number', required: true, min: 0 },
      { name: 'minimum_stock', label: 'Estoque mínimo', type: 'number', required: true, min: 0 },
      { name: 'active', label: 'Cadastro ativo', type: 'checkbox' },
    ], columns: ['name', 'presentation', 'stock_quantity', 'minimum_stock', 'active'],
  },
  {
    key: 'prescriptions', title: 'Prescrições', subtitle: 'Relacionamento demonstrativo entre prontuários e medicamentos.', icon: ClipboardList,
    roles: ['admin', 'doctor'],
    fields: [
      { name: 'medical_record_id', label: 'Prontuário', type: 'select', required: true, relation: { table: 'medical_records', labelField: 'diagnosis' } },
      { name: 'medication_id', label: 'Medicamento', type: 'select', required: true, relation: { table: 'medications', labelField: 'name' } },
      { name: 'dosage', label: 'Dosagem (exemplo)', type: 'text', required: true },
      { name: 'frequency', label: 'Frequência (exemplo)', type: 'text', required: true },
      { name: 'duration_days', label: 'Duração em dias', type: 'number', required: true, min: 1 },
      { name: 'instructions', label: 'Observações', type: 'textarea' },
    ], columns: ['medical_record_id', 'medication_id', 'dosage', 'frequency', 'duration_days'],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador', reception: 'Recepção', doctor: 'Médico', pharmacy: 'Farmácia',
};

function localDateTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function displayValue(key: string, value: unknown, refs: ReferenceMap): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'active') return value ? 'Ativo' : 'Inativo';
  if (key === 'status') {
    const states: Record<string, string> = { scheduled: 'Agendada', completed: 'Concluída', cancelled: 'Cancelada' };
    return states[String(value)] ?? String(value);
  }
  const relation = RESOURCES.flatMap((resource) => resource.fields)
    .find((field) => field.name === key && field.relation)?.relation;
  if (relation && typeof value === 'string') {
    const match = refs[relation.table]?.find((row) => row.id === value);
    const label = match?.[relation.labelField];
    return typeof label === 'string' ? label : value.slice(0, 8);
  }
  if (key === 'scheduled_at' || key === 'created_at') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
  }
  return String(value);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabase();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    if (!session?.user) {
      setProfile(null);
      setProfileError('');
      return;
    }
    setProfileLoading(true);
    getSupabase().from('user_profiles').select('id, full_name, role').eq('auth_user_id', session.user.id).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setProfileError('Não foi possível carregar o perfil. Confira se o arquivo schema.sql foi executado no Supabase.');
        } else {
          setProfile(data as UserProfile);
        }
        setProfileLoading(false);
      }, () => {
        if (!active) return;
        setProfileError('Não foi possível carregar o perfil. Verifique sua conexão e as configurações do Supabase.');
        setProfileLoading(false);
      });
    return () => { active = false; };
  }, [session]);

  if (!isSupabaseConfigured) return <ConfigurationScreen />;
  if (!session) return <AuthScreen />;
  if (profileLoading) return <LoadingScreen label="Carregando seu perfil..." />;
  if (profileError || !profile) return <ErrorScreen message={profileError || 'Perfil não encontrado.'} onSignOut={() => getSupabase().auth.signOut()} />;
  return <Workspace session={session} profile={profile} />;
}

function ConfigurationScreen() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark"><Activity size={26} /></div>
        <span className="eyebrow">CONFIGURAÇÃO INICIAL</span>
        <h1>Conecte o MEDCONTROL ao banco de dados</h1>
        <p>A interface foi publicada, mas ainda não recebeu a URL e a chave pública do seu projeto Supabase.</p>
        <div className="setup-step"><span>01</span><div><b>Crie o projeto no Supabase</b><small>Copie a Project URL e a chave Publishable (ou anon legada).</small></div></div>
        <div className="setup-step"><span>02</span><div><b>Configure os Secrets no GitHub</b><small>VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.</small></div></div>
        <div className="setup-step"><span>03</span><div><b>Execute o banco de dados</b><small>Abra SQL Editor no Supabase e execute database/schema.sql.</small></div></div>
        <p className="setup-note"><LockKeyhole size={15} /> Nunca coloque uma chave service_role no código do navegador.</p>
      </div>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const client = getSupabase();
      if (mode === 'register') {
        const { data, error: authError } = await client.auth.signUp({
          email, password, options: { data: { full_name: name.trim() } },
        });
        if (authError) throw authError;
        setMessage(data.session
          ? 'Conta criada. O perfil foi configurado como Recepção; um administrador poderá alterar sua função.'
          : 'Conta criada. Confira o e-mail para confirmar o cadastro antes de entrar.');
        setMode('login');
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-screen">
      <section className="auth-visual">
        <div className="brand brand-light"><div className="brand-mark"><Activity size={23} /></div><span>MEDCONTROL</span></div>
        <div className="visual-copy"><span className="eyebrow">GESTÃO INTEGRADA</span><h1>Informação organizada.<br /><em>Atendimento conectado.</em></h1><p>Uma central acadêmica para demonstrar a gestão de pacientes, consultas, prontuários e medicamentos.</p></div>
        <div className="visual-footer"><ShieldCheck size={16} /> Protótipo educacional com dados fictícios</div>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <span className="eyebrow">ACESSO AO SISTEMA</span>
          <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Criar conta'}</h2>
          <p>{mode === 'login' ? 'Entre com suas credenciais para continuar.' : 'Seu perfil inicial será criado com acesso de recepção.'}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && <label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} autoComplete="name" /></label>}
            <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
            <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
            {error && <div className="alert error"><AlertCircle size={16} />{error}</div>}
            {message && <div className="alert success"><Check size={16} />{message}</div>}
            <button className="button primary full" type="submit" disabled={busy}>{busy ? 'Processando...' : mode === 'login' ? 'Entrar no MEDCONTROL' : 'Criar minha conta'}</button>
          </form>
          <div className="auth-switch">{mode === 'login' ? 'Ainda não tem acesso?' : 'Já possui uma conta?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Criar conta' : 'Fazer login'}</button></div>
          <div className="auth-disclaimer"><LockKeyhole size={15} /> Não utilize informações médicas reais neste protótipo.</div>
        </div>
      </section>
    </main>
  );
}

function Workspace({ session, profile }: { session: Session; profile: UserProfile }) {
  const [activePage, setActivePage] = useState<'dashboard' | ResourceName>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const visibleResources = useMemo(() => RESOURCES.filter((resource) => resource.roles.includes(profile.role)), [profile.role]);
  const activeResource = RESOURCES.find((resource) => resource.key === activePage);
  const signOut = async () => { await getSupabase().auth.signOut(); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Activity size={22} /></div><span>MEDCONTROL</span></div>
        <div className="workspace-label">WORKSPACE <span>DEMONSTRAÇÃO</span></div>
        <nav className="nav-list">
          <button className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => { setActivePage('dashboard'); setMobileMenu(false); }}><LayoutDashboard size={18} /> Visão geral</button>
          <div className="nav-caption">GESTÃO HOSPITALAR</div>
          {visibleResources.map((resource) => {
            const Icon = resource.icon;
            return <button key={resource.key} className={`nav-item ${activePage === resource.key ? 'active' : ''}`} onClick={() => { setActivePage(resource.key); setMobileMenu(false); }}><Icon size={18} /> {resource.title}</button>;
          })}
        </nav>
        <div className="sidebar-bottom"><div className="security-chip"><ShieldCheck size={16} /><span>Acesso autenticado</span></div><div className="sidebar-version">MEDCONTROL · V1.0.0</div></div>
      </aside>
      {mobileMenu && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="breadcrumb">MEDCONTROL <span>/</span> {activeResource?.title ?? 'Visão geral'}</div>
          <div className="topbar-actions"><div className="user-avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{profile.full_name}</b><span>{ROLE_LABELS[profile.role]}</span></div><button className="icon-button" onClick={signOut} title="Sair"><LogOut size={18} /></button></div>
        </header>
        <div className="page-content">
          {activePage === 'dashboard'
            ? <Dashboard profile={profile} onNavigate={setActivePage} />
            : activeResource
              ? <ResourcePage key={activeResource.key} config={activeResource} currentUserId={session.user.id} />
              : null}
        </div>
        <footer className="app-footer"><span>MEDCONTROL · Sistema acadêmico de gestão hospitalar</span><span>Dados fictícios para demonstração</span></footer>
      </main>
    </div>
  );
}

function Dashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (page: 'dashboard' | ResourceName) => void }) {
  const [counts, setCounts] = useState({ patients: 0, doctors: 0, appointments: 0, medications: 0 });
  const [upcoming, setUpcoming] = useState<DataRow[]>([]);
  const [lowStock, setLowStock] = useState<DataRow[]>([]);
  const [refs, setRefs] = useState<ReferenceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [patients, doctors, appointments, medications] = await Promise.all([
        fetchRows('patients'), fetchRows('doctors'), fetchRows('appointments'), fetchRows('medications'),
      ]);
      setCounts({ patients: patients.length, doctors: doctors.length, appointments: appointments.length, medications: medications.length });
      setRefs({ patients, doctors });
      setUpcoming([...appointments].filter((row) => row.status === 'scheduled').sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at))).slice(0, 5));
      setLowStock(medications.filter((row) => Number(row.stock_quantity) <= Number(row.minimum_stock)).slice(0, 4));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao carregar o painel.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const cards = [
    { label: 'Pacientes cadastrados', value: counts.patients, icon: Users, trend: 'Base de pacientes', page: 'patients' as const, color: 'teal' },
    { label: 'Médicos ativos', value: counts.doctors, icon: Stethoscope, trend: 'Equipe cadastrada', page: 'doctors' as const, color: 'blue' },
    { label: 'Consultas registradas', value: counts.appointments, icon: CalendarDays, trend: 'Histórico de atendimentos', page: 'appointments' as const, color: 'violet' },
    { label: 'Medicamentos', value: counts.medications, icon: Pill, trend: 'Itens no catálogo', page: 'medications' as const, color: 'amber' },
  ];

  return (
    <div className="dashboard-page">
      <section className="welcome-row"><div><span className="eyebrow">PAINEL DE CONTROLE</span><h1>Visão geral</h1><p>Olá, {profile.full_name.split(' ')[0]}. Acompanhe os principais registros do sistema.</p></div><button className="button outline" onClick={() => void refresh()}><RefreshCw size={16} /> Atualizar dados</button></section>
      {error && <div className="alert error"><AlertCircle size={16} />{error}</div>}
      <section className="metric-grid">
        {cards.map((card) => { const Icon = card.icon; return <button key={card.label} className="metric-card" onClick={() => onNavigate(card.page)}><div className={`metric-icon ${card.color}`}><Icon size={20} /></div><span className="metric-label">{card.label}</span><strong>{loading ? '—' : card.value}</strong><small>{card.trend}</small><span className="metric-arrow"><ArrowUpRight size={17} /></span></button>; })}
      </section>
      <section className="dashboard-columns">
        <div className="panel"><div className="panel-heading"><div><span className="eyebrow">AGENDA</span><h2>Próximas consultas</h2></div><button className="text-button" onClick={() => onNavigate('appointments')}>Ver todas <ArrowUpRight size={15} /></button></div>
          {loading ? <LoadingInline /> : upcoming.length === 0 ? <EmptyState text="Nenhuma consulta agendada." /> : <div className="appointment-list">{upcoming.map((row) => <div className="appointment-row" key={row.id}><div className="date-badge"><b>{new Date(String(row.scheduled_at)).toLocaleDateString('pt-BR', { day: '2-digit' })}</b><span>{new Date(String(row.scheduled_at)).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div className="appointment-info"><b>{displayValue('patient_id', row.patient_id, refs)}</b><span>{displayValue('doctor_id', row.doctor_id, refs)} · {String(row.reason)}</span></div><div className="appointment-time"><Clock3 size={14} />{new Date(String(row.scheduled_at)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div></div>)}</div>}
        </div>
        <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FARMÁCIA</span><h2>Estoque em atenção</h2></div><button className="text-button" onClick={() => onNavigate('medications')}>Estoque <ArrowUpRight size={15} /></button></div>
          {loading ? <LoadingInline /> : lowStock.length === 0 ? <EmptyState text="Nenhum item abaixo do estoque mínimo." /> : <div className="stock-list">{lowStock.map((row) => <div className="stock-row" key={row.id}><div className="stock-icon"><AlertCircle size={17} /></div><div className="stock-info"><b>{String(row.name)}</b><span>Mínimo: {String(row.minimum_stock)} unidades</span></div><strong>{String(row.stock_quantity)} <small>un.</small></strong></div>)}</div>}
        </div>
      </section>
      <section className="notice-strip"><div className="notice-icon"><ShieldCheck size={19} /></div><div><b>Ambiente de demonstração protegido</b><p>Use somente os registros fictícios do projeto. As permissões de leitura e escrita são verificadas pelo banco de dados.</p></div></section>
    </div>
  );
}

function ResourcePage({ config, currentUserId }: { config: ResourceConfig; currentUserId: string }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [refs, setRefs] = useState<ReferenceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataRow | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const ownRows = await fetchRows(config.key);
      const relationTables = [...new Set(config.fields.map((field) => field.relation?.table).filter((table): table is ResourceName => Boolean(table)))];
      const relationEntries = await Promise.all(relationTables.map(async (table) => [table, await fetchRows(table)] as const));
      setRows(ownRows);
      setRefs(Object.fromEntries(relationEntries) as ReferenceMap);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os registros.'); }
    finally { setLoading(false); }
  }, [config]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = config.columns.map((column) => displayValue(column, row[column], refs)).join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [rows, config.columns, refs, search]);

  function openCreate() {
    const initial: Record<string, string | number | boolean> = {};
    config.fields.forEach((field) => { initial[field.name] = field.type === 'checkbox' ? true : ''; });
    if (config.key === 'appointments') initial.status = 'scheduled';
    setEditing(null); setForm(initial); setError(''); setModalOpen(true);
  }

  function openEdit(row: DataRow) {
    const values: Record<string, string | number | boolean> = {};
    config.fields.forEach((field) => {
      const raw = row[field.name];
      values[field.name] = field.type === 'datetime-local' ? localDateTime(raw) : (raw as string | number | boolean | null) ?? (field.type === 'checkbox' ? false : '');
    });
    setEditing(row); setForm(values); setError(''); setModalOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {};
      for (const field of config.fields) {
        const raw = form[field.name];
        if (field.type === 'checkbox') payload[field.name] = Boolean(raw);
        else if (raw === '' || raw === undefined) payload[field.name] = null;
        else if (field.type === 'number') payload[field.name] = Number(raw);
        else if (field.type === 'datetime-local') payload[field.name] = new Date(String(raw)).toISOString();
        else payload[field.name] = raw;
      }
      if (config.key === 'appointments' && payload.status === 'scheduled') {
        const conflict = await checkAppointmentConflict(String(payload.doctor_id), String(payload.scheduled_at), editing?.id ?? null);
        if (conflict) throw new Error('Este médico já possui uma consulta agendada nesse intervalo de 30 minutos. Escolha outro horário.');
      }
      if (config.key === 'medical_records') payload.created_by = currentUserId;
      await saveRow(config.key, editing?.id ?? null, payload);
      setModalOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o registro.'); }
    finally { setSaving(false); }
  }

  async function remove(row: DataRow) {
    const label = String(row.full_name ?? row.name ?? row.diagnosis ?? row.id);
    if (!window.confirm(`Deseja realmente excluir "${label}"? Essa ação não poderá ser desfeita.`)) return;
    setError('');
    try { await deleteRow(config.key, row.id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir. Verifique se existem registros relacionados.'); }
  }

  const Icon = config.icon;
  return (
    <div className="resource-page">
      <div className="resource-heading"><div><div className="title-icon"><Icon size={20} /><span className="eyebrow">CADASTROS</span></div><h1>{config.title}</h1><p>{config.subtitle}</p></div><button className="button primary" onClick={openCreate}><Plus size={17} /> Novo registro</button></div>
      {error && <div className="alert error"><AlertCircle size={16} />{error}</div>}
      <section className="table-panel">
        <div className="table-toolbar"><div><b>Registros cadastrados</b><span>{filtered.length} item(ns) encontrado(s)</span></div><div className="toolbar-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar registros..." /></label><button className="icon-button" onClick={() => void load()} aria-label="Atualizar"><RefreshCw size={17} /></button></div></div>
        {loading ? <LoadingInline /> : filtered.length === 0 ? <EmptyState text="Nenhum registro encontrado. Cadastre o primeiro ou altere a pesquisa." /> :
          <div className="table-scroll"><table><thead><tr>{config.columns.map((column) => <th key={column}>{config.fields.find((field) => field.name === column)?.label ?? (column === 'created_at' ? 'Criado em' : column)}</th>)}<th className="actions-cell">Ações</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}>{config.columns.map((column) => <td key={column}>{column === 'summary' ? <span className="truncate-cell">{displayValue(column, row[column], refs)}</span> : column === 'stock_quantity' && Number(row.stock_quantity) <= Number(row.minimum_stock) ? <span className="stock-warning">{displayValue(column, row[column], refs)} · baixo</span> : displayValue(column, row[column], refs)}</td>)}<td className="actions-cell"><button className="row-action" onClick={() => openEdit(row)} title="Editar"><Pencil size={15} /></button><button className="row-action danger" onClick={() => void remove(row)} title="Excluir"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
      </section>
      <div className="table-footnote"><Database size={14} /> Alterações são gravadas diretamente no PostgreSQL do Supabase.</div>
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><span className="eyebrow">{editing ? 'ATUALIZAÇÃO' : 'NOVO CADASTRO'}</span><h2 id="modal-title">{editing ? 'Editar registro' : `Cadastrar ${config.title.toLowerCase().replace(/s$/, '')}`}</h2></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fechar"><X size={19} /></button></header><form onSubmit={submit}><div className="form-grid">{config.fields.map((field) => <FieldControl key={field.name} field={field} value={form[field.name] ?? ''} refs={refs} onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))} />)}</div>{config.key === 'prescriptions' && <div className="form-hint"><AlertCircle size={15} /> Os campos são apenas demonstrativos. Não use esta área para orientar tratamentos reais.</div>}{error && <div className="alert error"><AlertCircle size={16} />{error}</div>}<footer className="modal-footer"><button type="button" className="button outline" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Salvando...' : <><Check size={16} /> Salvar registro</>}</button></footer></form></section></div>}
    </div>
  );
}

function FieldControl({ field, value, refs, onChange }: { field: ResourceField; value: string | number | boolean; refs: ReferenceMap; onChange: (value: string | number | boolean) => void }) {
  const common = { id: field.name, required: field.required, placeholder: field.placeholder };
  const relationOptions = field.relation ? refs[field.relation.table] ?? [] : [];
  return (
    <label className={`field-control ${field.type === 'textarea' ? 'field-wide' : ''} ${field.type === 'checkbox' ? 'checkbox-field' : ''}`} htmlFor={field.name}>
      {field.type === 'checkbox' ? <><input id={field.name} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.label}</span></> : <><span>{field.label}{field.required && <i> *</i>}</span>
        {field.type === 'textarea' ? <textarea {...common} value={String(value)} onChange={(event) => onChange(event.target.value)} rows={3} />
          : field.type === 'select' ? <select {...common} value={String(value)} onChange={(event) => onChange(event.target.value)}><option value="">Selecione...</option>{field.options?.map((option) => <option key={option} value={option}>{option === 'scheduled' ? 'Agendada' : option === 'completed' ? 'Concluída' : option === 'cancelled' ? 'Cancelada' : option}</option>)}{relationOptions.map((row) => <option key={row.id} value={row.id}>{String(row[field.relation!.labelField] ?? row.id)}</option>)}</select>
            : <input {...common} type={field.type} min={field.min} value={String(value)} onChange={(event) => onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}</>}
    </label>
  );
}

function LoadingInline() { return <div className="loading-inline"><RefreshCw size={17} className="spin" /> Carregando registros...</div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><div><FilePlus2 size={22} /></div><p>{text}</p></div>; }
function LoadingScreen({ label }: { label: string }) { return <main className="full-loading"><RefreshCw size={24} className="spin" /><p>{label}</p></main>; }
function ErrorScreen({ message, onSignOut }: { message: string; onSignOut: () => void }) { return <main className="full-loading"><div className="error-card"><AlertCircle size={26} /><h2>Não foi possível abrir o sistema</h2><p>{message}</p><button className="button outline" onClick={onSignOut}>Voltar ao login</button></div></main>; }

export default App;
