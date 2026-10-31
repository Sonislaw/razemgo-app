import { recommendCrew, recommendTrip } from './trip-fixtures.mjs';
import {test,expect} from '@playwright/test';
import {A,B,groupId,profile,state,backend,login} from './trip-fixtures.mjs';

test.use({timezoneId:'Europe/Warsaw'});
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function plan(n,owner,start,end,status='published'){
  return{id:uuid(n),group_id:groupId(owner),adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',status,visibility:'public',start_date:start,end_date:end,
    location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
    travel_mode:'Przyczepa',description:'Plaża, rowery i dużo czasu na wspólny odpoczynek.',landscape:'coast',interests:['Rowery'],animal_kinds:['dog'],
    matching_group_kinds:[],matching_child_age_bands:[],published_at:'2026-10-26T10:00:00Z'};
}
async function date(page,iso){await page.clock.setFixedTime(new Date(iso));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}

test('one timeline is shared by Start, discovery, crew listings, own plans, detail pages and chat, with a local-date refresh',async({page,context})=>{
  test.setTimeout(120000);const store=state();
  const upcoming=plan(8601,B,'2027-05-07','2027-05-10'),active=plan(8602,B,'2026-10-25','2026-10-30');
  const own=plan(8603,A,'2027-05-07','2027-05-10'),past=plan(8604,A,'2026-10-01','2026-10-10','completed');
  const cancelled=plan(8605,A,'2026-11-01','2026-11-04','cancelled'),draft=plan(8606,A,null,null,'draft');
  upcoming.published_at='2026-10-26T11:00:00Z';
  for(const p of [upcoming,active,own,past,cancelled,draft])store.trips.set(p.id,p);
  const invitation=uuid(8611),conversation=uuid(8612);
  store.invitations.push({id:invitation,sender_group_id:groupId(A),recipient_group_id:groupId(B),context_kind:'trip',
    trip_id:upcoming.id,trip_reference:upcoming.id,source_trip_id:null,trip_snapshot:upcoming,source_trip_snapshot:null,
    text:'Do zobaczenia na wyjeździe!',status:'accepted',created_at:'2026-10-26T10:00:00Z'});
  store.conversations.push({id:conversation,invitation_id:invitation,sender_group_id:groupId(A),recipient_group_id:groupId(B),updated_at:'2026-10-26T10:00:00Z'});
  await backend(context,store);
  await page.route('**/rest/v1/rpc/get_public_group_v2',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    return route.fulfill({json:{crew:profile(B).group,recommendation:recommendCrew(profile(B).group),about:'Czas na wspólne przygody.',active_trip_count:1,trips:[{trip:upcoming,crew:profile(B).group,recommendation:recommendTrip(upcoming,profile(B).group,store)}],has_more:false,cursor:null},
      headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await login(page);await date(page,'2026-10-26T12:00:00Z');
  const home=page.getByTestId('home-latest-listing');
  await expect(home.getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await expect(home.getByTestId('trip-timeline')).toHaveAttribute('aria-label',/Dziś 26 października 2026/);
  await date(page,'2026-10-26T23:01:00Z');await expect(home.getByTestId('trip-timeline')).toContainText('Za 192 dni');
  await date(page,'2026-10-26T12:00:00Z');
  await page.goto('/explore');
  const card=page.getByTestId('discovery-trip-'+upcoming.id);
  await expect(card.getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await expect(page.getByTestId('discovery-trip-'+active.id).getByTestId('trip-timeline')).toContainText('Trwa · jeszcze 4 dni');
  await page.getByTestId('discovery-trip-'+active.id).getByTestId('trip-timeline').screenshot({path:'.expo/trip-timeline-ongoing.png'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await card.scrollIntoViewIfNeeded();
    await card.screenshot({path:'.expo/trip-timeline-card-'+width+'.png'});
    expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(2);
  }
  await card.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
  const detailTimeline=page.locator('[data-testid="trip-timeline"]:visible').last();
  await expect(detailTimeline).toContainText('Za 193 dni');
  await detailTimeline.screenshot({path:'.expo/trip-timeline-detail-320.png'});
  await page.getByRole('button',{name:'Zobacz profil ekipy',exact:true}).click();
  await expect(page.getByTestId('discovery-trip-'+upcoming.id).last().getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await page.goto('/trips');
  const ownCard=page.getByTestId('own-trip-'+own.id);
  await expect(ownCard.getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await expect(ownCard).not.toContainText('Szukam towarzystwa');
  await expect(ownCard.getByRole('button',{name:'Znajdź towarzystwo',exact:true})).toBeEnabled();
  await date(page,'2027-05-10T12:00:00Z');
  await expect(ownCard).toContainText('Zakończony');
  await expect(ownCard.getByRole('button',{name:'Znajdź towarzystwo',exact:true})).toBeDisabled();
  await date(page,'2026-10-26T12:00:00Z');
  await expect(ownCard).not.toContainText('Zakończony');
  await expect(ownCard.getByRole('button',{name:'Znajdź towarzystwo',exact:true})).toBeEnabled();
  await expect(page.getByTestId('own-trip-'+draft.id).getByTestId('trip-timeline')).toHaveCount(0);
  await page.goto('/trips/'+own.id);await expect(page.getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await page.goto('/trips/'+past.id);await expect(page.getByTestId('trip-timeline')).toContainText('Zakończony 16 dni temu');
  await page.getByTestId('trip-timeline').screenshot({path:'.expo/trip-timeline-past.png'});
  await page.goto('/trips/'+cancelled.id);await expect(page.getByTestId('trip-timeline')).toContainText('Wyjazd anulowany');
  await page.goto('/chat/'+conversation);await expect(page.getByTestId('trip-timeline')).toContainText('Za 193 dni');
  await page.getByTestId('chat-screen').screenshot({path:'.expo/trip-timeline-chat-320.png'});
});

test('the welcome example also has a timeline and stays within a narrow screen',async({page,context})=>{
  await backend(context,state());await page.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
  await page.setViewportSize({width:320,height:844});await page.goto('/welcome');
  const card=page.getByTestId('welcome-featured-listing');
  await expect(card.getByTestId('trip-timeline')).toBeVisible();await expect(card.getByTestId('trip-timeline-today')).toHaveCount(1);
  expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(2);
  await card.screenshot({path:'.expo/trip-timeline-welcome-320.png'});
});
