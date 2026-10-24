import { test, expect } from '@playwright/test';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const user = (id) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: id === A ? 'a@example.com' : 'b@example.com',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
});
function session(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        aud: 'authenticated',
        role: 'authenticated',
        exp,
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  return {
    access_token: token,
    refresh_token: 'refresh-' + id,
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: user(id),
  };
}
async function backend(context, existingState) {
  const state = existingState ?? {
    profiles: new Map(),
    saveFail: false,
    loadFail: false,
    oauthRedirect: null,
    lastPassword: null,
    deleted: [],
    calls: [],
  };
  await context.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.calls.push(url.pathname);
    const headers = {
      'access-control-allow-origin': 'http://localhost:8085',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'content-type': 'application/json',
      'x-supabase-api-version': '2024-01-01',
      'access-control-expose-headers': 'x-supabase-api-version',
    };
    const respond = (data, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON() ?? {};
    let id = A;
    try {
      id = JSON.parse(
        Buffer.from(
          (request.headers().authorization ?? '').split('.')[1],
          'base64url',
        ).toString(),
      ).sub;
    } catch {
      /* Public Auth endpoint. */
    }
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'password') {
        if (body.password !== 'correct-password')
          return respond(
            {
              code: 'invalid_credentials',
              message: 'Invalid login credentials',
            },
            400,
          );
        return respond(session(body.email === 'b@example.com' ? B : A));
      }
      if (body.auth_code === 'expired')
        return respond(
          { code: 'flow_state_expired', message: 'Expired code' },
          400,
        );
      return respond(session(A));
    }
    if (url.pathname.endsWith('/signup'))
      return respond({ ...user(A), identities: [] });
    if (url.pathname.endsWith('/resend')) return respond({});
    if (url.pathname.endsWith('/verify')) return respond(session(A));
    if (url.pathname.endsWith('/recover')) {
      state.oauthRedirect = url.searchParams.get('redirect_to');
      return respond({});
    }
    if (url.pathname.endsWith('/authorize')) {
      state.oauthRedirect = url.searchParams.get('redirect_to');
      const redirect = new URL(state.oauthRedirect);
      redirect.searchParams.set('code', 'google-code');
      return route.fulfill({
        status: 302,
        headers: { ...headers, location: redirect.toString() },
        body: '',
      });
    }
    if (url.pathname.endsWith('/logout')) return respond({});
    if (url.pathname.endsWith('/user')) {
      if (state.deleted.includes(id))
        return respond(
          { code: 'bad_jwt', message: 'User no longer exists' },
          401,
        );
      if (request.method() === 'PUT') state.lastPassword = body.password;
      return respond(user(id));
    }
    if (url.pathname === '/rest/v1/trip_plans' || url.pathname === '/rest/v1/rpc/list_public_trips') return respond([]);
    if (url.pathname === '/rest/v1/travel_groups') {
      if (state.loadFail)
        return respond({ message: 'Temporarily unavailable' }, 503);
      return respond(
        state.profiles.has(id) ? [state.profiles.get(id).group] : [],
      );
    }
    if (url.pathname === '/rest/v1/group_preferences')
      return respond(state.profiles.get(id).preferences);
    if (url.pathname === '/rest/v1/rpc/save_my_profile') {
      if (state.saveFail)
        return respond({ message: 'Temporarily unavailable' }, 503);
      const { matching, ...group } = body.profile_data;
      const saved = {
        group: { ...group, id: 'group-' + id, owner_user_id: id },
        preferences: { ...matching, group_id: 'group-' + id },
      };
      state.profiles.set(id, saved);
      return respond(saved);
    }
    if (url.pathname === '/functions/v1/delete-account') {
      state.deleted.push(id);
      state.profiles.delete(id);
      return respond({ deleted: true });
    }
    return respond({ message: 'Unhandled test endpoint' }, 400);
  });
  return state;
}
async function login(page, email = 'a@example.com') {
  await page.goto('/auth/sign-in');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
}
async function createProfile(page, name) {
  await expect(
    page.getByRole('heading', { name: 'Poznajmy Twoją ekipę' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Nazwa ekipy', exact: true })
    .fill(name);
  await page
    .getByRole('radio', { name: 'Sposób podróżowania: Kamper', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Zapisz profil i zacznij', exact: true })
    .click();
}

test('guest protection, registration validation and email confirmation', async ({
  page,
  context,
}) => {
  await backend(context);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/profile');
  await expect(
    page.getByRole('button', { name: 'Nowe konto' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nazwa ekipy' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Nowe konto' }).click();
  await page
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('a@example.com');
  await page.getByLabel('Hasło', { exact: true }).fill('short');
  await page.getByLabel('Powtórz hasło', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('10 do 128');
  await page.getByLabel('Hasło', { exact: true }).fill('correct-password');
  await page
    .getByLabel('Powtórz hasło', { exact: true })
    .fill('correct-password');
  await page.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Potwierdź e-mail' }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Kod potwierdzenia' }).fill('123456');
  await page
    .getByRole('button', { name: 'Potwierdź adres', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Poznajmy Twoją ekipę' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('profile persists, failed saves retain the form, reload errors retry and accounts stay isolated', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const state = await backend(context);
  await login(page);
  await createProfile(page, 'Ekipa A');
  await expect(page).toHaveURL('http://localhost:8085/');
  expect(state.profiles.size).toBe(1);
  // Another browser context has no shared session storage, simulating a second device.
  const second = await context
    .browser()
    .newContext({
      baseURL: 'http://localhost:8085',
      viewport: { width: 390, height: 844 },
    });
  try {
    await backend(second, state);
    const otherPage = await second.newPage();
    await login(otherPage);
    await expect(otherPage).toHaveURL('http://localhost:8085/');
    await otherPage.goto('/profile');
    await expect(otherPage.getByText('Ekipa A', { exact: true })).toBeVisible();
  } finally {
    await second.close();
  }
  await page.goto('/profile');
  await expect(page.getByText('Ekipa A', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Edytuj profil', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Nazwa ekipy', exact: true })
    .fill('Ekipa po zmianie');
  state.saveFail = true;
  await page
    .getByRole('button', { name: 'Zapisz zmiany', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(
    page.getByRole('textbox', { name: 'Nazwa ekipy', exact: true }),
  ).toHaveValue('Ekipa po zmianie');
  state.saveFail = false;
  await page
    .getByRole('button', { name: 'Zapisz zmiany', exact: true })
    .click();
  await expect(
    page.getByText('Ekipa po zmianie', { exact: true }),
  ).toBeVisible();
  state.loadFail = true;
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Spróbuj ponownie' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nazwa ekipy' })).toHaveCount(
    0,
  );
  state.loadFail = false;
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(page).toHaveURL('http://localhost:8085/');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Nowe konto' }),
  ).toBeVisible();
  await login(page, 'b@example.com');
  await expect(page.getByRole('textbox', { name: 'Nazwa ekipy' })).toHaveValue(
    '',
  );
  await createProfile(page, 'Ekipa B');
  await page.goto('/profile');
  await expect(page.getByText('Ekipa B', { exact: true })).toBeVisible();
  await expect(page.getByText('Ekipa po zmianie', { exact: true })).toHaveCount(
    0,
  );
  await page.goto('/trip-editor');
  await expect(page.getByRole('heading', { name: 'Jaki masz plan?', exact: true })).toBeVisible();
  expect(state.profiles.size).toBe(2);
});

test('Google PKCE callback, password recovery and confirmed account deletion', async ({
  page,
  context,
}) => {
  const state = await backend(context);
  await page.goto('/auth/sign-in');
  await page.getByRole('button', { name: 'Kontynuuj z Google' }).click();
  await createProfile(page, 'Ekipa Google');
  expect(state.oauthRedirect).toContain('/auth/callback');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
  await page.goto('/auth/forgot-password');
  await page
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('a@example.com');
  await page.getByRole('button', { name: 'Wyślij link', exact: true }).click();
  await expect(page.getByText(/Jeśli konto istnieje/)).toBeVisible();
  const redirect = new URL(state.oauthRedirect);
  redirect.searchParams.set('code', 'recovery-code');
  await page.goto(redirect.toString());
  await expect(
    page.getByRole('heading', { name: 'Ustaw nowe hasło' }),
  ).toBeVisible();
  await page
    .getByLabel('Nowe hasło', { exact: true })
    .fill('another-correct-password');
  await page
    .getByLabel('Powtórz nowe hasło', { exact: true })
    .fill('another-correct-password');
  await page.getByRole('button', { name: 'Zapisz hasło', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/');
  expect(state.lastPassword).toBe('another-correct-password');
  const otherDeviceSession = await page.evaluate(() =>
    Object.entries(window.localStorage),
  );
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Usuń konto', exact: true }).click();
  expect(state.deleted).toEqual([]);
  await page
    .getByRole('button', { name: 'Potwierdzam — usuń konto', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Nowe konto' }),
  ).toBeVisible();
  expect(state.deleted).toEqual([A]);
  expect(state.profiles.size).toBe(0);
  // An already issued token on another device must not reopen onboarding for a deleted user.
  await page.evaluate((entries) => {
    for (const [key, value] of entries) window.localStorage.setItem(key, value);
  }, otherDeviceSession);
  await page.goto('/profile');
  await expect(
    page.getByRole('button', { name: 'Nowe konto' }),
  ).toBeVisible();
});

test('expired recovery link keeps private screens protected and allows a fresh request', async ({
  page,
  context,
}) => {
  const state = await backend(context);
  await page.goto('/auth/forgot-password');
  await page
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('a@example.com');
  await page.getByRole('button', { name: 'Wyślij link', exact: true }).click();
  await expect(page.getByText(/Jeśli konto istnieje/)).toBeVisible();
  const redirect = new URL(state.oauthRedirect);
  redirect.searchParams.set('code', 'expired');
  await page.goto(redirect.toString());
  await expect(page.getByRole('alert')).toContainText('Link wygasł');
  await page.getByRole('button', { name: 'Wyślij nowy link do hasła' }).click();
  await expect(
    page.getByRole('heading', { name: 'Odzyskaj dostęp' }),
  ).toBeVisible();
  await page.goto('/profile');
  await expect(
    page.getByRole('button', { name: 'Nowe konto' }),
  ).toBeVisible();
});
