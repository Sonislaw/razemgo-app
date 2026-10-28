import { test } from 'node:test';
import { testDatabase } from './support/database.mjs';
import { checkPermissions } from './database-permissions.mjs';
test('all application tables keep RLS and RPCs keep their reviewed roles', async () => {
  const db = await testDatabase();
  try {
    await checkPermissions(db);
  } finally {
    await db.close();
  }
});
