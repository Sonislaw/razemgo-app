import { test, expect } from '@playwright/test';
import { A, B, groupId, state, backend, login } from './trip-fixtures.mjs';

const id = '00000000-0000-4000-8000-000000009701';
function trip() {
  return {id,group_id:groupId(B),adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',status:'published',visibility:'public',
    start_date:'2027-05-21',end_date:'2027-05-24',location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',
    campground_name:'Pod Wydmami',campground_address:'Testowa 12',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i wspólne ognisko.',landscape:'coast',
    interests:['Rowery'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],published_at:'2026-10-24T10:00:00Z'};
}

test('trip contact stays visible, organizer precedes description and contact states still navigate', async ({ page, context }) => {
  const store=state(); store.trips.set(id,trip()); await backend(context,store); await login(page);
  await page.goto('/trip/'+id);
  const bar=page.getByTestId('trip-contact-bar');
  const contact=bar.getByRole('button',{name:'Zaproś do kontaktu',exact:true});
  await expect(contact).toBeEnabled();
  await page.screenshot({path:'.expo/ux-first-three-contact.png'});
  for(const size of [{width:390,height:844},{width:320,height:800},{width:390,height:480}]) {
    await page.setViewportSize(size); await expect(contact).toBeInViewport({ratio:1});
    await page.getByTestId('trip-participants').scrollIntoViewIfNeeded(); await expect(contact).toBeInViewport({ratio:1});
  }
  await page.setViewportSize({width:390,height:844});
  const organizer=await page.getByTestId('trip-organizer').boundingBox();
  const description=await page.getByText('Pomysł na wspólny czas',{exact:true}).boundingBox();
  expect(organizer.y).toBeLessThan(description.y);
  await contact.click(); await page.getByRole('textbox',{name:'Treść zaproszenia',exact:true}).fill('Cześć, chętnie poznamy Was na wspólnym wyjeździe.');
  await page.getByRole('button',{name:'Wyślij zaproszenie',exact:true}).click(); await expect(page).toHaveURL('http://localhost:8085/messages');
  await page.goto('/trip/'+id); await expect(bar.getByRole('button',{name:'Zobacz wysłane zaproszenie',exact:true})).toBeInViewport({ratio:1});
  const invitation=store.invitations[0]; invitation.status='accepted';
  const chat='00000000-0000-4000-8000-000000009702';
  store.conversations.push({id:chat,invitation_id:invitation.id,sender_group_id:groupId(A),recipient_group_id:groupId(B),updated_at:'2026-10-24T12:00:00Z'});
  await page.reload(); await bar.getByRole('button',{name:'Przejdź do rozmowy',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/chat/'+chat);
  store.trips.delete(id); await page.goto('/trip/'+id);
  await expect(page.getByText('Nie znaleźliśmy tego wyjazdu',{exact:true})).toBeVisible(); await expect(bar).toHaveCount(0);
});

test('trip fields focus validation errors and collapsed extras keep values through private publication', async ({ page, context }) => {
  const store=state(); await backend(context,store); await login(page); await page.goto('/trip-editor');
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await expect(page.getByTestId('trip-field-dates').getByRole('alert')).toContainText('datę');
  await expect(page.getByRole('button',{name:'Wybierz zakres dat',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Wybierz zakres dat',exact:true}).click();
  await page.getByLabel(/^25 października 2026/).click(); await page.getByLabel(/^28 października 2026/).click();
  await page.getByRole('button',{name:'Wybierz daty',exact:true}).click(); await page.getByRole('button',{name:'Dalej',exact:true}).click();
  const location=page.getByRole('textbox',{name:'Miasto lub wieś',exact:true});
  const description=page.getByRole('textbox',{name:'Opis wyjazdu',exact:true});
  await expect(page.getByTestId('trip-editor-preview')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Dodatkowe informacje',exact:true})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(location).toBeFocused(); await expect(location).toHaveAttribute('aria-invalid','true');
  await location.fill('Chłapowo pomorskie'); await page.getByRole('button',{name:/^Wybierz lokalizację: Chłapowo,/}).first().click();
  console.log('Collapsed second step:', await page.getByTestId('trip-editor-form').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight})));
  await page.screenshot({path:'.expo/ux-first-three-form.png'});
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(description).toBeFocused(); await expect(description).toHaveAttribute('aria-describedby','trip-error-description');
  await page.screenshot({path:'.expo/ux-first-three-validation.png'});
  await description.fill('Wyjazd nad morze, wspólne rowery i spokojne wieczory przy ognisku.');
  await page.getByRole('button',{name:'Mniej: Dzieci na wyjeździe',exact:true}).click(); await page.getByRole('button',{name:'Więcej: Dzieci na wyjeździe',exact:true}).click();
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(page.getByTestId('trip-field-participants')).toBeFocused();
  await expect(page.getByTestId('trip-field-participants').getByRole('alert')).toContainText('Wybierz przedziały');
  await page.getByRole('button',{name:'Wiek dzieci na wyjeździe: 7–9 lat',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Nazwa kempingu',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Szczegóły kempingu',exact:true}).click();
  await page.getByRole('textbox',{name:'Nazwa kempingu',exact:true}).fill('Kemping Testowy'); await page.getByRole('textbox',{name:'Adres kempingu',exact:true}).fill('Wczasowa 10');
  await page.getByRole('button',{name:'Szczegóły kempingu',exact:true}).click();
  await page.getByRole('button',{name:'Dodatkowe informacje',exact:true}).click();
  await page.getByRole('button',{name:'Rowery',exact:true}).click(); await page.getByRole('checkbox',{name:'Zwierzę w ekipie: Pies',exact:true}).click();
  await page.getByRole('button',{name:'Dodatkowe informacje',exact:true}).click();
  await page.getByRole('button',{name:'Podgląd planu',exact:true}).click();
  await expect(page.getByTestId('trip-editor-preview')).toContainText('Kemping Testowy'); await expect(page.getByTestId('trip-editor-preview')).toContainText('Z psem');
  await page.getByRole('button',{name:'Tylko dla nas',exact:true}).click();
  await page.getByRole('button',{name:'Zapisz plan prywatny',exact:true}).click(); await expect(page).toHaveURL('http://localhost:8085/trips');
  const saved=[...store.trips.values()][0]; expect(saved.visibility).toBe('private'); expect(saved.campground_name).toBe('Kemping Testowy');
  expect(saved.campground_address).toBe('Wczasowa 10'); expect(saved.interests).toEqual(['Rowery']); expect(saved.animal_kinds).toEqual(['dog']);
  await page.goto('/trip-editor?id='+saved.id); await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await page.getByRole('button',{name:'Szczegóły kempingu',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Nazwa kempingu',exact:true})).toHaveValue('Kemping Testowy');
});
