// Public identifiers only. Preview keeps its original package and callback so
// the APK already installed by testers continues to use the same backend.
const PREVIEW_PROJECT_REF = 'tueqqnbdvuazdxoqtpvk';
const variants = {
  development: {
    name: 'RazemGo Dev',
    package: 'pl.razemgo.app.development',
    scheme: 'razemgo-dev',
    firebaseFile: 'google-services.development.json',
  },
  preview: {
    name: 'RazemGo Preview',
    package: 'pl.razemgo.app.dev',
    scheme: 'razemgo',
    firebaseFile: 'google-services.json',
  },
};

function getAppVariant(env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (profile === 'production') {
    throw new Error(
      'Production is not configured. Choose development or preview.',
    );
  }
  const profileVariant = profile === 'performance' ? 'development' : profile;
  const variant = env.APP_VARIANT || profileVariant || 'development';
  if (!Object.hasOwn(variants, variant))
    throw new Error('Unknown APP_VARIANT. Choose development or preview.');
  if (profileVariant && profileVariant !== variant)
    throw new Error('APP_VARIANT must match the EAS build profile.');
  return variant;
}

function assertBackendIsolation(variant, url) {
  if (!url?.trim()) return; // The welcome screen also works before configuration.
  let host;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    throw new Error('Invalid Supabase URL.');
  }
  const isPreview = host === PREVIEW_PROJECT_REF + '.supabase.co';
  if (variant === 'development' && isPreview) {
    throw new Error(
      'Dev cannot use the Preview database. Configure a separate Supabase in .env.local.',
    );
  }
  if (variant === 'preview' && !isPreview) {
    throw new Error(
      'Preview must use its own Supabase project. Check the preview environment.',
    );
  }
}

module.exports = {
  variants,
  getAppVariant,
  assertBackendIsolation,
  PREVIEW_PROJECT_REF,
};
