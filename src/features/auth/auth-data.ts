export const MIN_PASSWORD_LENGTH = 10;

export function authRedirectUrl(scheme: string, webOrigin?: string, recovery = false) {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) throw new Error('Invalid application scheme.');
  const base = webOrigin ? `${new URL(webOrigin).origin}/auth/callback` : `${scheme}://auth/callback`;
  return base + (recovery ? '?flow=recovery' : '');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(
  email: string,
  password?: string,
): string[] {
  const errors: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)))
    errors.push('Wpisz poprawny adres e-mail.');
  if (
    password !== undefined &&
    (password.length < MIN_PASSWORD_LENGTH || password.length > 128)
  )
    errors.push('Hasło powinno mieć od 10 do 128 znaków.');
  return errors;
}

export function authErrorMessage(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    status?: number;
  } | null;
  switch (value?.code) {
    case 'invalid_credentials':
      return 'Niepoprawny e-mail lub hasło. Spróbuj ponownie.';
    case 'email_not_confirmed':
      return 'Potwierdź adres e-mail, aby się zalogować.';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
    case 'pkce_code_verifier_not_found':
    case 'bad_oauth_state':
      return 'Link wygasł lub został już użyty. Poproś o nowy link albo zaloguj się ponownie.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
    case 'weak_password':
      return 'Wybierz silniejsze hasło, zawierające co najmniej 10 znaków.';
    case 'same_password':
      return 'Nowe hasło musi różnić się od poprzedniego.';
    case 'user_banned':
      return 'To konto jest niedostępne.';
    case 'provider_disabled':
      return 'Ta metoda logowania jest chwilowo niedostępna.';
    case 'email_address_not_authorized':
      return 'Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj później.';
  }
  if (value?.status === 429)
    return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  if (
    error instanceof TypeError ||
    /fetch|network|offline/i.test(value?.message ?? '')
  )
    return 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.';
  return 'Nie udało się wykonać operacji. Spróbuj ponownie.';
}

export function parseAuthCallback(url: string, redirectUrl: string) {
  const incoming = new URL(url);
  const expected = new URL(redirectUrl);
  if (
    incoming.protocol !== expected.protocol ||
    incoming.host !== expected.host ||
    incoming.pathname !== expected.pathname
  )
    throw new Error('Nieprawidłowy adres powrotu.');
  const code = incoming.searchParams.get('code');
  const error =
    incoming.searchParams.get('error_code') ??
    incoming.searchParams.get('error');
  const flowId = incoming.searchParams.get('sb_flow_id');
  if (flowId && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))
    throw new Error('Nieprawidłowy identyfikator logowania.');
  return {
    code,
    error,
    flowId,
    recovery: incoming.searchParams.get('flow') === 'recovery',
  };
}
