import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewConfigurationErrors as errors } from './preview-config.cjs';

const config={scheme:'razemgo',android:{package:'pl.razemgo.app.dev'},extra:{eas:{projectId:'00000000-0000-4000-8000-000000000001'}}};
const firebase={project_info:{project_number:'123456789'},client:[{client_info:{android_client_info:{package_name:config.android.package}}}]};
const env={EXPO_PUBLIC_SUPABASE_URL:'https://test.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'a'.repeat(25),
  EXPO_PUBLIC_SENTRY_DSN:'https://publickey@monitoring.example.com/123',EXPO_PUBLIC_APP_ENV:'preview',EXPO_PUBLIC_ENABLE_DEMO:'false',EXPO_PUBLIC_MONITORING_IN_DEV:'false'};

test('a complete preview config supports publishable and legacy anon keys',()=>{
  assert.deepEqual(errors(env,config,firebase),[]);
  const key=role=>['header',Buffer.from(JSON.stringify({role})).toString('base64url'),'signature'].join('.');
  assert.deepEqual(errors({...env,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key('anon')},config,firebase),[]);
  for(const secret of ['sb_secret_private-server-credential',key('service_role')]){
    const result=errors({...env,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:secret},config,firebase);
    assert.equal(result.length,1);assert.ok(!JSON.stringify(result).includes(secret));
  }
});
test('missing remote configuration and local-only backend URLs stop a release',()=>{
  assert.ok(errors({},config,firebase).some(error=>error.startsWith('EXPO_PUBLIC_SUPABASE_URL')));
  for(const url of ['http://localhost:54321','https://127.0.0.1','https://user:password@test.supabase.co','https://test.supabase.co?token=private']){
    assert.ok(errors({...env,EXPO_PUBLIC_SUPABASE_URL:url},config,firebase).some(error=>error.startsWith('EXPO_PUBLIC_SUPABASE_URL')));
  }
});
test('Firebase must be mobile configuration for the actual Android package',()=>{
  for(const data of [undefined,{type:'service_account',private_key:'private-key'}, {...firebase,client:[{client_info:{android_client_info:{package_name:'wrong.package'}}}]}]){
    assert.deepEqual(errors(env,config,data),['GOOGLE_SERVICES_JSON must contain the Android app configuration for this package']);
  }
});
test('preview cannot accidentally enable mocks or development diagnostics',()=>{
  for(const name of ['EXPO_PUBLIC_ENABLE_DEMO','EXPO_PUBLIC_MONITORING_IN_DEV'])assert.ok(errors({...env,[name]:'true'},config,firebase).some(error=>error.startsWith(name)));
  assert.ok(errors({...env,EXPO_PUBLIC_APP_ENV:'production'},config,firebase).some(error=>error.startsWith('EXPO_PUBLIC_APP_ENV')));
  assert.ok(errors(env,{...config,scheme:'exp'},firebase).some(error=>error.includes('return scheme')));
  assert.ok(errors(env,{...config,extra:{}},firebase).some(error=>error.includes('EAS project ID')));
});
