import { supabase } from '../lib/supabase';

export interface SimulacaoListRow {
  id: number;
  nome_lote: string;
  dias_confinamento: number;
  peso_entrada_kg: number;
  gmd_projetado: number;
  cms_projetado: number;
  custo_diaria: number;
  data_simulacao: string;
  tem_params?: number;
}

export interface SimulacaoDetailRow extends SimulacaoListRow {
  params_json: string | null;
}

/** Mantido para compatibilidade — não é mais necessário com Supabase. */
export function configureApiAuth(_fn: () => Promise<string | null>) {}

export async function listSimulacoes(): Promise<SimulacaoListRow[]> {
  const { data, error } = await supabase
    .from('simulacoes_confinamento')
    .select('id, nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, data_simulacao, params_json')
    .order('data_simulacao', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    id: row.id,
    nome_lote: row.nome_lote,
    dias_confinamento: row.dias_confinamento,
    peso_entrada_kg: row.peso_entrada_kg,
    gmd_projetado: row.gmd_projetado,
    cms_projetado: row.cms_projetado,
    custo_diaria: row.custo_diaria,
    data_simulacao: row.data_simulacao,
    tem_params: row.params_json != null ? 1 : 0,
  }));
}

export async function getSimulacao(id: number): Promise<SimulacaoDetailRow> {
  const { data, error } = await supabase
    .from('simulacoes_confinamento')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Simulação não encontrada');
  return data as SimulacaoDetailRow;
}

export async function saveSimulacao(body: {
  nome_lote: string;
  dias_confinamento: number;
  peso_entrada_kg: number;
  gmd_projetado: number;
  cms_projetado: number;
  custo_diaria: number;
  params_json: string;
}): Promise<{ id: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('simulacoes_confinamento')
    .insert({ ...body, user_id: user.id })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function deleteSimulacao(id: number): Promise<void> {
  const { error } = await supabase
    .from('simulacoes_confinamento')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
