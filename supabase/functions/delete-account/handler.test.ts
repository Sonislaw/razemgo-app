import { handleDeleteAccount } from './handler.ts';

Deno.test(
  'deletion validates the JWT, ignores body targets and never returns credentials',
  async () => {
    const variables = [
      'SUPABASE_URL',
      'APP_SUPABASE_PUBLISHABLE_KEY',
      'APP_SUPABASE_SECRET_KEY',
      'ALLOWED_WEB_ORIGINS',
    ];
    const saved = variables.map((key) => Deno.env.get(key));
    Deno.env.set('SUPABASE_URL', 'https://backend.razemgo.invalid');
    Deno.env.set('APP_SUPABASE_PUBLISHABLE_KEY', 'test-public');
    Deno.env.set('APP_SUPABASE_SECRET_KEY', 'test-server');
    Deno.env.set('ALLOWED_WEB_ORIGINS', 'https://app.razemgo.invalid');
    const original = globalThis.fetch;
    const deleted: string[] = [];
    const user = '00000000-0000-4000-8000-000000000001';
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user'))
        return Response.json({
          id: user,
          email: 'not-returned@example.invalid',
        });
      if (
        url.endsWith('/auth/v1/admin/users/' + user) &&
        init?.method === 'DELETE'
      ) {
        deleted.push(user);
        return Response.json({});
      }
      throw new Error('Unexpected transport');
    };
    const invoke = (headers: Record<string, string> = {}) =>
      handleDeleteAccount(
        new Request('https://edge.razemgo.invalid/delete-account', {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_id: 'foreign', secret: 'private' }),
        }),
      );
    const assert = (value: unknown) => {
      if (!value) throw new Error('Deletion boundary failed');
    };
    try {
      assert((await invoke()).status === 401);
      assert(
        (
          await invoke({
            origin: 'https://hostile.invalid',
            authorization: 'Bearer token',
          })
        ).status === 403,
      );
      const result = await invoke({ authorization: 'Bearer token' });
      assert(result.status === 200);
      assert(deleted.length === 1 && deleted[0] === user);
      assert((await result.text()) === '{"deleted":true}');
    } finally {
      globalThis.fetch = original;
      variables.forEach((key, i) =>
        saved[i] === undefined
          ? Deno.env.delete(key)
          : Deno.env.set(key, saved[i]!),
      );
    }
  },
);
