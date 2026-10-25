import {backendRequest} from '@/lib/backend-request';
import {getSupabase} from '@/lib/supabase';
import type {ModerationAction,ReportFilter,ReportSummary} from './moderation-types';
export async function fetchAccountAccess() {
  const {data,error}=await backendRequest(signal=>getSupabase().rpc('get_my_account_access').abortSignal(signal),'account.access');
  if (error) throw error;
  if (!data || typeof data.is_admin!=='boolean' || typeof data.suspended!=='boolean' || !Array.isArray(data.hidden_trip_ids)) throw new Error('Missing account access');
  return data;
}
export async function fetchReports(filter:ReportFilter,search:string,cursor?:ReportSummary) {
  const {data,error}=await backendRequest(signal=>getSupabase().rpc('admin_list_reports',{status_filter:filter,search_text:search.trim(),
    before_at:cursor?.created_at ?? null,before_id:cursor?.id ?? null}).abortSignal(signal),'moderation.list');
  if (error) throw error;
  if (!data) throw new Error('Missing reports');
  return data;
}
export async function fetchReport(id:string) {
  const {data,error}=await backendRequest(signal=>getSupabase().rpc('admin_report_detail',{report_id:id}).abortSignal(signal),'moderation.detail');
  if (error) throw error;
  if (!data) throw new Error('Missing report');
  return data;
}
export async function applyModeration(id:string,action:ModerationAction,note:string,key:string,updatedAt:string) {
  const {data,error}=await backendRequest(signal=>getSupabase().rpc('admin_apply_action',{report_id:id,moderation_action:action,action_note:note.trim(),request_key:key,
    expected_updated_at:updatedAt}).abortSignal(signal),'moderation.action');
  if (error) throw error;
  if (!data) throw new Error('Missing moderation result');
  return data;
}
export function moderationError(error:unknown) {
  const code=(error as {code?:string})?.code;
  if (code==='42501') return 'Brak uprawnień do tej operacji. Odśwież dostęp do konta.';
  if (code==='40001') return 'Zgłoszenie zmieniło się w innym oknie. Odśwież szczegóły przed kolejnym działaniem.';
  if (code==='P0002') return 'Zgłoszenie lub jego treść nie są już dostępne.';
  if (code==='22023') return 'Sprawdź uzasadnienie i odśwież szczegóły zgłoszenia.';
  return 'Nie udało się połączyć. Spróbuj ponownie; wykonana wcześniej operacja nie zostanie powielona.';
}
