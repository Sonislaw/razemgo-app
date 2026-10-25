export type ReportStatus='new'|'in_progress'|'closed';
export type ReportFilter=ReportStatus|'open'|'all';
export type ModerationAction='in_progress'|'close'|'reopen'|'hide_trip'|'restore_trip'|'suspend_account'|'restore_account';
export type AccountAccess={is_admin:boolean;suspended:boolean;hidden_trip_ids:string[]};
export type ReportSummary={id:string;target_kind:'trip'|'conversation';reason:string;status:ReportStatus;created_at:string;updated_at:string;reported_name:string;reporter_name:string;reported_group_id:string|null;reporter_group_id:string|null};
export type ReportsPage={items:ReportSummary[];has_more:boolean;counts:Record<ReportStatus,number>};
export type ReportDetail={report:ReportSummary;trip_id:string|null;trip_hidden:boolean;account_suspended:boolean;can_suspend:boolean;
  evidence:{trip?:{description?:string;location_name?:string;location_region?:string;campground_name?:string;start_date?:string;end_date?:string}|null;
    messages?:{id:string;sender_group_id:string;text:string;created_at:string}[]};
  history:{id:string;action:ModerationAction;note:string;created_at:string;actor_name:string}[]};
export const STATUS_LABELS:Record<ReportStatus,string>={new:'Nowe',in_progress:'W trakcie',closed:'Zamknięte'};
export const ACTION_LABELS:Record<ModerationAction,string>={in_progress:'Rozpocznij obsługę',close:'Zamknij zgłoszenie',reopen:'Otwórz ponownie',
  hide_trip:'Ukryj ogłoszenie',restore_trip:'Przywróć ogłoszenie',suspend_account:'Zablokuj konto',restore_account:'Odblokuj konto'};
export function validateModerationNote(note:string) {
  return note.trim().length<8 ? 'Podaj uzasadnienie — co najmniej 8 znaków.' : note.trim().length>500 ? 'Uzasadnienie może mieć maksymalnie 500 znaków.' : null;
}
