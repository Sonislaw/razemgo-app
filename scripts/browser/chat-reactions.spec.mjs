import {test,expect} from '@playwright/test';
import {A,B,groupId,state,backend,login} from './trip-fixtures.mjs';

const CHAT='00000000-0000-4000-8000-000000000903';
const messageId=n=>'00000000-0000-4000-9000-'+String(n).padStart(12,'0');
function seed(count=120){
  const store=state(),invitation={id:'00000000-0000-4000-8000-000000000902',sender_group_id:groupId(B),recipient_group_id:groupId(A),
    trip_id:null,source_trip_id:null,trip_reference:null,trip_snapshot:null,source_trip_snapshot:null,context_kind:'profile',
    text:'Cześć, porozmawiajmy!',status:'accepted',created_at:'2026-10-27T10:00:00Z'};
  store.invitations.push(invitation);store.conversations.push({id:CHAT,invitation_id:invitation.id,sender_group_id:groupId(B),recipient_group_id:groupId(A),updated_at:invitation.created_at});
  for(let n=1;n<=count;n++)store.messages.push({id:messageId(n),sequence:n,conversation_id:CHAT,sender_group_id:groupId(B),
    text:'Rozmowa o podróży, wiadomość '+n+'.',created_at:invitation.created_at});
  return store;
}
const row=(page,n)=>page.getByTestId('chat-message-'+messageId(n));
const position=locator=>locator.evaluate(el=>el.scrollTop);

test('chat retains older reading through polling and keyboard-size changes, and a send does not move the composer',async({page,context})=>{
  test.setTimeout(90000);const store=seed();await backend(context,store);await login(page);await page.goto('/chat/'+CHAT);
  const list=page.getByTestId('chat-message-list');await expect(row(page,120)).toBeInViewport();
  await list.evaluate(el=>{el.scrollTop=1000;});
  const before=await position(list);expect(before).toBeGreaterThan(0);
  await page.setViewportSize({width:390,height:600});await expect.poll(async()=>Math.abs(await position(list)-before)).toBeLessThan(3);
  await page.setViewportSize({width:390,height:844});await expect.poll(async()=>Math.abs(await position(list)-before)).toBeLessThan(3);
  await page.clock.install();await page.clock.fastForward(21000);
  await expect(page.getByText('Wczytywanie wiadomości…',{exact:true})).toHaveCount(0);
  await expect.poll(async()=>Math.abs(await position(list)-before)).toBeLessThan(3);
  const anchorId=await list.evaluate(el=>{
    const viewport=el.getBoundingClientRect();return [...el.querySelectorAll('[data-testid^="chat-message-"]')]
      .filter(row=>{const box=row.getBoundingClientRect();return box.top>viewport.top+30&&box.bottom<viewport.bottom-30;})[0]?.getAttribute('data-testid');
  });
  expect(anchorId).toBeTruthy();const anchor=page.getByTestId(anchorId),anchorTop=(await anchor.boundingBox()).y;
  store.messages.push({id:messageId(121),sequence:121,conversation_id:CHAT,sender_group_id:groupId(B),text:'Nowa wiadomość podczas czytania historii.',created_at:'2026-10-27T10:01:00Z'});
  await page.clock.fastForward(21000);await expect(row(page,121)).toBeAttached();
  await expect.poll(()=>store.reads.get(CHAT+groupId(A))).toBe(120);
  await expect.poll(async()=>Math.abs((await anchor.boundingBox()).y-anchorTop)).toBeLessThan(3);
  const composer=page.getByRole('textbox',{name:'Treść wiadomości'});const box=await composer.boundingBox();
  await composer.fill('Wysyłanie bez przeskoku pola tekstowego.');
  await page.getByRole('button',{name:'Wyślij wiadomość',exact:true}).click();
  await expect(page.getByText('Wysyłanie chwilowo niedostępne. Spróbuj ponownie za chwilę.',{exact:true})).toHaveCount(0);
  await expect.poll(async()=>Math.abs((await composer.boundingBox()).y-box.y)).toBeLessThan(1);
  await expect(page.getByText('Wysyłanie bez przeskoku pola tekstowego.',{exact:true})).toBeInViewport();
});

test('message reactions persist, change and clear on both accounts without changing bubble geometry or unread counts',async({page,context,browser})=>{
  const store=seed(5);await backend(context,store);await login(page);await page.goto('/chat/'+CHAT);
  const peer=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:320,height:844}});
  try{
    await backend(peer,store);const b=await peer.newPage();await login(b,'b@example.com');await b.goto('/chat/'+CHAT);
    const bubble=row(page,5),box=await bubble.boundingBox(),reads=store.reads.get(CHAT+groupId(A));
    await expect(bubble.getByRole('button',{name:'Zareaguj na wiadomość',exact:true})).toHaveCount(0);
    await expect(bubble.getByText('☺',{exact:true})).toHaveCount(0);
    await bubble.getByText('Rozmowa o podróży, wiadomość 5.',{exact:true}).click();
    await expect(page.getByRole('heading',{name:'Reakcja na wiadomość',exact:true})).toHaveCount(0);
    await bubble.getByText('Rozmowa o podróży, wiadomość 5.',{exact:true}).click({delay:650});
    await page.getByRole('button',{name:'Serce',exact:true}).click();
    await expect(bubble.getByRole('button',{name:'Zmień reakcję: Serce',exact:true})).toBeVisible();
    const reactionBox=await bubble.getByRole('button',{name:'Zmień reakcję: Serce',exact:true}).boundingBox();
    const timeBox=await bubble.getByText(/^\d{1,2}:\d{2}(?: · .*)?$/).boundingBox();
    const outlineBox=await page.getByTestId('chat-bubble-'+messageId(5)).boundingBox();
    expect(reactionBox.y).toBeGreaterThanOrEqual(timeBox.y+timeBox.height);
    expect(reactionBox.y).toBeLessThan(outlineBox.y+outlineBox.height);
    expect(reactionBox.y+reactionBox.height).toBeGreaterThan(outlineBox.y+outlineBox.height);
    await page.screenshot({path:'.expo/chat-reaction-overlap.png'});
    await expect.poll(async()=>Math.abs((await bubble.boundingBox()).height-box.height)).toBeLessThan(1);
    expect(store.messages.length).toBe(5);expect(store.reads.get(CHAT+groupId(A))).toBe(reads);
    await b.clock.install();await b.clock.fastForward(21000);await expect(row(b,5).getByLabel('Reakcja rozmówcy: Serce',{exact:true})).toBeVisible();
    const peerReactionBox=await row(b,5).getByLabel('Reakcja rozmówcy: Serce',{exact:true}).boundingBox();
    const peerTimeBox=await row(b,5).getByText(/^\d{1,2}:\d{2}(?: · .*)?$/).boundingBox();
    const peerOutlineBox=await b.getByTestId('chat-bubble-'+messageId(5)).boundingBox();
    expect(peerReactionBox.y).toBeGreaterThanOrEqual(peerTimeBox.y+peerTimeBox.height);
    expect(peerReactionBox.y).toBeLessThan(peerOutlineBox.y+peerOutlineBox.height);
    expect(peerReactionBox.y+peerReactionBox.height).toBeGreaterThan(peerOutlineBox.y+peerOutlineBox.height);
    await b.screenshot({path:'.expo/chat-reaction-overlap-self.png'});
    await expect(row(b,5).getByRole('button',{name:/reakcję|Zareaguj/})).toHaveCount(0);
    await page.reload();await row(page,5).getByRole('button',{name:'Zmień reak​cję: Serce'.replace('\u200b',''),exact:true}).click({position:{x:17,y:23}});
    await page.getByRole('button',{name:'Haha',exact:true}).click();
    await expect(row(page,5).getByRole('button',{name:'Zmień reakcję: Haha',exact:true})).toBeVisible();
    await row(page,5).getByRole('button',{name:'Zmień reakcję: Haha',exact:true}).click();await page.getByRole('button',{name:'Usuń reakcję',exact:true}).click();
    await expect(row(page,5).getByRole('button',{name:/Zmień reakcję|Zareaguj na wiadomość/})).toHaveCount(0);
    await expect(row(page,5).getByText('☺',{exact:true})).toHaveCount(0);
    await b.reload();await expect(row(b,5).getByLabel('Reakcja rozmówcy: Haha',{exact:true})).toHaveCount(0);
  }finally{await peer.close();}
});

test('failed reaction saves and history loads remain retryable and never discard messages',async({page,context})=>{
  const store=seed(5);await backend(context,store);await login(page);await page.goto('/chat/'+CHAT);
  const bubble=row(page,5);await bubble.getByText('Rozmowa o podróży, wiadomość 5.',{exact:true}).click({delay:650});
  store.failMessageReactionSave=true;await page.getByRole('button',{name:'Super',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać reakcji');expect(store.messageReactions?.get(messageId(5))).toBeUndefined();
  store.failMessageReactionSave='after-commit';await page.getByRole('button',{name:'Ponów zapis reakcji',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać reakcji');expect(store.messageReactions.get(messageId(5))).toBe('like');
  store.failMessageReactionSave=false;await page.getByRole('button',{name:'Ponów zapis reakcji',exact:true}).click();
  await expect(bubble.getByRole('button',{name:'Zmień reakcję: Super',exact:true})).toBeVisible();expect(store.messageReactions.size).toBe(1);
  store.failMessageReactionLoad=true;await page.reload();await expect(row(page,5)).toBeVisible();
  await row(page,5).getByText('Rozmowa o podróży, wiadomość 5.',{exact:true}).click({delay:650});
  await expect(page.getByRole('alert')).toContainText('Nie udało się wczytać reakcji');
  store.failMessageReactionLoad=false;await page.getByRole('button',{name:'Wczytaj reakcje ponownie',exact:true}).click();
  await expect(page.getByRole('button',{name:'Super',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('older pages also support the long-press reaction picker',async({page,context})=>{
  const store=seed(65);await backend(context,store);await login(page);await page.goto('/chat/'+CHAT);
  await expect(row(page,65)).toBeInViewport();
  await page.getByRole('button',{name:'Wczytaj starsze wiadomości',exact:true}).click();
  await row(page,1).getByText('Rozmowa o podróży, wiadomość 1.',{exact:true}).click({delay:400});
  await expect(page.getByRole('heading',{name:'Reakcja na wiadomość',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dzięki',exact:true}).click();
  await expect(row(page,1).getByRole('button',{name:'Zmień reakcję: Dzięki',exact:true})).toBeVisible();
  expect(store.messageReactions.get(messageId(1))).toBe('thanks');expect(store.messages.length).toBe(65);
});
