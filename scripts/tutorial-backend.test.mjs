import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase } from './support/database.mjs';

test('tutorial decisions are private, idempotent, account-scoped and require a live session', async () => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const call = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const get = () => call('get_my_tutorial_state');
  const finish = status => call('finish_my_tutorial', [status]);
  try {
    for (const user of users) await db.query('insert into auth.users values($1)', [user]);
    await asUser(db, users[2]); await assert.rejects(get(), e => e.code === '42501');
    for (let i = 0; i < 2; i++) { await asUser(db, users[i]); await call('save_my_profile', [JSON.stringify(profile('Tutorial ' + i))]); }
    await asUser(db, users[0]); assert.deepEqual(await get(), { version: 1, status: null });
    for (const invalid of [null, '', 'seen']) await assert.rejects(finish(invalid), e => e.code === '22023');
    assert.deepEqual(await finish('skipped'), { version: 1, status: 'skipped' });
    await finish('skipped');
    await asUser(db, users[1]); assert.equal((await get()).status, null);
    await assert.rejects(db.query('select * from onboarding_private.tutorial_states'));
    await asUser(db, users[0]); await finish('completed'); await finish('skipped');
    assert.equal((await get()).status, 'completed');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from onboarding_private.tutorial_states')).rows[0].n, 1);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1", [users[0]]);
    await asUser(db, users[0]); await assert.rejects(get(), e => e.code === '42501'); await assert.rejects(finish('completed'), e => e.code === '42501');
    await db.exec('reset role'); await db.query('update auth.sessions set not_after=null where user_id=$1', [users[0]]);
    await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[0]]);
    await asUser(db, users[0]); await assert.rejects(get(), e => e.code === '42501');
    await db.exec('reset role; set role anon'); await assert.rejects(get()); await assert.rejects(finish('skipped'));
    await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[0]]);
    assert.equal((await db.query('select count(*)::int n from onboarding_private.tutorial_states')).rows[0].n, 0);
  } finally { await db.close(); }
});
