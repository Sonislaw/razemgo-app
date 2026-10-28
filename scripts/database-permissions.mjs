import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { testDatabase } from './support/database.mjs';

export async function permissionCatalog(db) {
  return (
    await db.query(`select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as definer,coalesce(p.proconfig,'{}') as settings,
    array(select role from unnest(array['anon','authenticated','service_role']) role where has_function_privilege(role,p.oid,'execute')) as roles
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' or n.nspname like '%\\_private' escape '\\'
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)
  ).rows;
}
export async function checkPermissions(db) {
  const expected = JSON.parse(
    await readFile(new URL('./rpc-permissions.json', import.meta.url), 'utf8'),
  );
  const actual = await permissionCatalog(db);
  assert.deepEqual(
    actual,
    expected,
    'RPC role changes require an explicit permission review',
  );
  for (const row of actual) {
    if (row.definer)
      assert.ok(
        row.settings.includes('search_path=""'),
        row.schema + '.' + row.name + ' needs an empty fixed search_path',
      );
    // The API exposes public only. A small, explicit set of private helpers
    // needs authenticated EXECUTE for RLS policies; those roles are snapshotted.
    if (row.schema !== 'public')
      assert.ok(
        !row.roles.includes('anon'),
        'Private helper exposed to anon: ' + row.name,
      );
    if (row.name.startsWith('admin_'))
      assert.ok(
        !row.roles.includes('anon'),
        'Administrative RPC exposed to anon',
      );
  }
  const tables = (
    await db.query(`select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'select') as anonymous_read
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)
  ).rows;
  for (const row of tables) {
    assert.ok(row.relrowsecurity, 'RLS disabled: ' + row.relname);
    assert.equal(
      row.anonymous_read,
      false,
      'Anonymous table read: ' + row.relname,
    );
  }
  return { functions: actual.length, tables: tables.length };
}
if (process.argv[1]?.endsWith('database-permissions.mjs')) {
  const db = await testDatabase();
  try {
    if (process.argv.includes('--write')) {
      await writeFile(
        new URL('./rpc-permissions.json', import.meta.url),
        JSON.stringify(await permissionCatalog(db), null, 2) + '\n',
      );
      console.log('Wrote explicit application RPC permissions.');
    }
    console.log(await checkPermissions(db));
  } finally {
    await db.close();
  }
}
