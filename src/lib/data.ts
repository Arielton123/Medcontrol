import { getSupabase } from './supabase';

export type ResourceName =
  | 'patients'
  | 'doctors'
  | 'appointments'
  | 'medical_records'
  | 'medications'
  | 'prescriptions';

export type DataRow = { id: string } & Record<string, unknown>;

export async function fetchRows(table: ResourceName): Promise<DataRow[]> {
  const { data, error } = await getSupabase()
    .from(table)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as DataRow[];
}

export async function saveRow(
  table: ResourceName,
  id: string | null,
  values: Record<string, unknown>,
): Promise<void> {
  const client = getSupabase();
  const result = id
    ? await client.from(table).update(values).eq('id', id)
    : await client.from(table).insert(values);

  if (result.error) throw result.error;
}

export async function deleteRow(table: ResourceName, id: string): Promise<void> {
  const { error } = await getSupabase().from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function checkAppointmentConflict(
  doctorId: string,
  startsAt: string,
  currentId: string | null,
): Promise<boolean> {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error('Informe uma data e um horário válidos.');
  if (start.getTime() < Date.now()) throw new Error('Não é possível agendar uma consulta em uma data passada.');

  const { data: doctor, error: doctorError } = await getSupabase()
    .from('doctors')
    .select('active')
    .eq('id', doctorId)
    .single();
  if (doctorError) throw doctorError;
  if (!doctor?.active) throw new Error('O médico selecionado está inativo. Escolha um profissional ativo.');

  const windowStart = new Date(start.getTime() - 30 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  let query = getSupabase()
    .from('appointments')
    .select('id, scheduled_at')
    .eq('doctor_id', doctorId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', end.toISOString());

  if (currentId) query = query.neq('id', currentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
