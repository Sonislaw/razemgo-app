// Only the trusted database CLI can grant/revoke administrator membership.
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const [action,emailInput]=process.argv.slice(2),email=emailInput?.trim().toLowerCase();
if (!['grant','revoke'].includes(action) || !email || email.length>254 || !/^[^\s'";$\\]+@[^\s'";$\\]+\.[^\s'";$\\]+$/.test(email)) throw new Error('Usage: node scripts/manage-admin.mjs grant|revoke VERIFIED_ACCOUNT_EMAIL');
const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
const appUrl=readFileSync('.env.local','utf8').match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
if (!/^[a-z0-9]+$/.test(ref) || !appUrl || new URL(appUrl).hostname!==ref+'.supabase.co') throw new Error('Linked project and app must match');
mkdirSync('.expo',{recursive:true});const path='.expo/manage-admin.sql';
try {
  writeFileSync(path,`begin;
    do $$ declare target uuid;matches integer;begin
      select count(*),(array_agg(id))[1] into matches,target from auth.users where lower(email)='${email}' and email_confirmed_at is not null;
      if matches<>1 then raise exception 'Exactly one verified account required';end if;
      perform pg_advisory_xact_lock(hashtextextended(target::text,741));
      if '${action}'='grant' then
        if exists(select 1 from moderation_private.suspended_accounts where user_id=target) then raise exception 'Suspended account';end if;
        insert into moderation_private.administrators(user_id) values(target) on conflict do nothing;
      else delete from moderation_private.administrators where user_id=target;end if;
      insert into moderation_private.audit_log(action,note,target_id) values('${action==='grant' ? 'grant_admin' : 'revoke_admin'}','Zmiana uprawnień w konfiguracji serwerowej.',target);
    end $$;
    commit;
    select true as administrator_membership_updated;`,{mode:0o600});
  const command='npx --yes supabase@latest db query --linked --file '+path;
  const args=process.platform==='win32'?['/d','/s','/c',command]:['--yes','supabase@latest','db','query','--linked','--file',path];
  const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:60000});
  if (result.status!==0) throw new Error('Administrator update failed. Verify the linked project, migrations and confirmed account. Raw output suppressed.');
  console.log('Administrator membership updated for the single verified account; action recorded in server audit.');
} finally {try {unlinkSync(path);} catch {}}
