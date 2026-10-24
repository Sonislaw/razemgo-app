import { test,expect } from '@playwright/test';
import { backend,state,login } from './trip-fixtures.mjs';

async function captureReports(context) {
  const events=[];
  await context.route('https://monitoring.razemgo.invalid/**',async route=>{
    const request=route.request();
    if(request.method()!=='OPTIONS')for(const line of (request.postData()??'').split('\n')){
      try{const value=JSON.parse(line);if(value.event_id&&value.tags?.operation)events.push(value);}catch{}
    }
    await route.fulfill({status:200,body:'{}',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  });
  return events;
}
test('real SDK reports a handled backend failure with safe context and no account or message payload',async({page,context})=>{
  const store=state();store.failMailbox=true;await backend(context,store);const events=await captureReports(context);
  await login(page);await page.goto('/messages');
  await expect(page.getByText('Nie udało się wczytać skrzynki',{exact:true})).toBeVisible();
  await expect.poll(()=>events.filter(e=>e.tags.operation==='mailbox.load').length).toBeGreaterThan(0);
  const event=events.find(e=>e.tags.operation==='mailbox.load');
  expect(event.tags.code).toBe('HTTP_503');
  expect(event.request).toBeUndefined();expect(event.breadcrumbs).toBeUndefined();expect(event.extra).toBeUndefined();
  expect(event.user?.email).toBeUndefined();expect(JSON.stringify(event)).not.toContain('a@example.com');
  expect(JSON.stringify(event)).not.toContain('refresh-');expect(JSON.stringify(event)).not.toContain('test-signature');
});
test('unhandled errors and the development smoke test use the sanitized Sentry envelope',async({page,context})=>{
  await backend(context,state());const events=await captureReports(context);await login(page);await page.goto('/settings');
  await page.getByRole('button',{name:'Wyślij raport testowy',exact:true}).click();
  await expect.poll(()=>events.some(e=>e.tags.operation==='monitoring.test')).toBe(true);
  const smoke=events.find(e=>e.tags.operation==='monitoring.test');expect(smoke.event_id).toMatch(/^[a-f0-9]{32}$/);
  await page.evaluate(()=>{
    const error=new TypeError('private-error@example.com password=private-password child-7 secret-message');
    error.stack='TypeError: private-password\n    at privateFunction (https://private-host/entry.js?access_token=private-token:12:4)';
    window.dispatchEvent(new ErrorEvent('error',{error,message:error.message}));
  });
  await expect.poll(()=>events.some(e=>e.tags.operation==='app.unhandled')).toBe(true);
  const event=events.find(e=>e.tags.operation==='app.unhandled');
  const value=JSON.stringify(event);
  for(const secret of ['private-error','private-password','child-7','secret-message','private-host','private-token','privateFunction'])expect(value).not.toContain(secret);
  expect(event.tags.screen).toBe('/settings');expect(event.exception.values[0].type).toBe('TypeError');
});
