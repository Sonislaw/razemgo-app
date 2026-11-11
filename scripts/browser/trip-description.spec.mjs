import {test,expect} from '@playwright/test';
import {state,backend,login} from './trip-fixtures.mjs';
import {openSuggestions} from './autocomplete-helpers.mjs';

async function editor(page,mode='planned'){
 await page.goto('/trip-editor');
 await page.getByRole('radio',{name:mode==='flexible'?'Szukam pomysłu':'Mam plan',exact:true}).click();
 await page.getByRole('button',{name:'Wybierz zakres dat',exact:true}).click();
 await page.getByLabel(/^25 października 2026/).click();await page.getByLabel(/^28 października 2026/).click();
 await page.getByRole('button',{name:'Wybierz daty',exact:true}).click();await page.getByRole('button',{name:'Dalej',exact:true}).click();
 await (await openSuggestions(page,mode==='flexible'?'Jaki obszar Was interesuje?':'Dokąd jedziecie?')).fill('Chłapowo pomorskie');
 await page.getByRole('button',{name:/^Wybierz miejsce: Chłapowo,/}).first().click();
}

for(const width of [320,390])test(`description assistant: choose, preview, edit and publish at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:844});const store=state();await backend(context,store);await login(page);await editor(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const field=page.getByTestId('trip-field-description');await expect(field.getByRole('button',{name:'Pomóż mi napisać opis',exact:true})).toBeVisible();
 await field.getByRole('button',{name:'Pomóż mi napisać opis',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Pomóż mi napisać opis',exact:true}),generate=dialog.getByRole('button',{name:'Utwórz propozycję opisu',exact:true});
 await expect(generate).toBeDisabled();await dialog.getByRole('radio',{name:'Rodzina z dziećmi',exact:true}).click();
 await dialog.getByRole('radio',{name:'Spokojnie, na luzie',exact:true}).click();
 await dialog.getByRole('checkbox',{name:'Gry planszowe',exact:true}).click();
 await expect(generate).toBeEnabled();await generate.click();
 const proposal=dialog.getByRole('textbox',{name:'Propozycja opisu',exact:true});const first=await proposal.inputValue();
 expect(first).toContain('Chłapowo');expect(first).toContain('rodziny z dziećmi');expect(first).toContain('planszówki');
 expect(store.trips.size).toBe(0);await dialog.getByRole('button',{name:'Zaproponuj inaczej',exact:true}).click();await expect(proposal).not.toHaveValue(first);
 const text=await proposal.inputValue()+' Zabieramy swoją ulubioną grę.';await proposal.fill(text);
 await dialog.getByRole('button',{name:'Wstaw opis',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Opis wyjazdu',exact:true})).toHaveValue(text);
 await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/trips');
 const saved=[...store.trips.values()][0];expect(saved.description).toBe(text);expect(saved.matching_group_kinds).toEqual([]);expect(saved.matching_child_age_bands).toEqual([]);
 expect(saved.interests).not.toContain('Gry planszowe');expect(errors).toEqual([]);
});

test('flexible descriptions preserve existing text on close, retain answers on back and require confirmation before replacing',async({page,context})=>{
 const store=state();await backend(context,store);await login(page);await editor(page,'flexible');
 const input=page.getByRole('textbox',{name:'Opis wyjazdu',exact:true}),original='Mój własny opis, którego nie chcę przypadkowo stracić.';await input.fill(original);
 const open=()=>page.getByRole('button',{name:'Pomóż mi napisać opis',exact:true}).click();await open();
 const dialog=page.getByRole('dialog',{name:'Pomóż mi napisać opis',exact:true});
 await dialog.getByRole('radio',{name:'Dowolna ekipa',exact:true}).click();await dialog.getByRole('radio',{name:'Trochę ruchu, trochę odpoczynku',exact:true}).click();
 await dialog.getByRole('button',{name:'Utwórz propozycję opisu',exact:true}).click();
 const proposal=dialog.getByRole('textbox',{name:'Propozycja opisu',exact:true});expect(await proposal.inputValue()).toContain('Konkretne miejsce chcemy wybrać razem');
 await proposal.fill('Krótki');await expect(dialog.getByRole('button',{name:'Wstaw opis',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Zmień odpowiedzi',exact:true}).click();await expect(dialog.getByRole('radio',{name:'Dowolna ekipa',exact:true})).toBeChecked();
 await dialog.getByRole('button',{name:'Utwórz propozycję opisu',exact:true}).click();await dialog.getByRole('button',{name:'Wstaw opis',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Zastąpić dotychczasowy opis?',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();
 await expect(input).toHaveValue(original);
 await open();await dialog.getByRole('radio',{name:'Para',exact:true}).click();await dialog.getByRole('radio',{name:'Aktywnie, dużo odkrywania',exact:true}).click();
 await dialog.getByRole('button',{name:'Utwórz propozycję opisu',exact:true}).click();const chosen=await proposal.inputValue();
 await dialog.getByRole('button',{name:'Wstaw opis',exact:true}).click();await dialog.getByRole('button',{name:'Wróć do propozycji',exact:true}).click();await expect(proposal).toHaveValue(chosen);
 await dialog.getByRole('button',{name:'Wstaw opis',exact:true}).click();await dialog.getByRole('button',{name:'Zastąp opis',exact:true}).click();
 await expect(input).toHaveValue(chosen);await input.fill(chosen+' A szczegóły ustalimy wspólnie.');
 await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/trips');
 const saved=[...store.trips.values()][0];expect(saved.mode).toBe('flexible');expect(saved.description).toContain('wspólnie');expect(saved.matching_group_kinds).toEqual([]);
});

test('descriptions use the full Google name after a partial search and after reloading; unavailable names never quote the partial query',async({page,context})=>{
 const store=state();await backend(context,store);await login(page);await editor(page);
 await (await openSuggestions(page,'Dokąd jedziecie?')).fill('Camp');
 await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
 const open=async()=>{
  await page.getByRole('button',{name:'Pomóż mi napisać opis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Pomóż mi napisać opis',exact:true});
  await dialog.getByRole('radio',{name:'Dowolna ekipa',exact:true}).click();await dialog.getByRole('radio',{name:'Spokojnie, na luzie',exact:true}).click();
  await dialog.getByRole('button',{name:'Utwórz propozycję opisu',exact:true}).click();return dialog;
 };
 let dialog=await open();let proposal=dialog.getByRole('textbox',{name:'Propozycja opisu',exact:true});
 await expect(proposal).toHaveValue(/„Camping Morski”/);await expect(proposal).not.toHaveValue(/„Camp”/);
 await dialog.getByRole('button',{name:'Zaproponuj inaczej',exact:true}).click();await expect(proposal).toHaveValue(/„Camping Morski”/);
 await dialog.getByRole('button',{name:'Wstaw opis',exact:true}).click();await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
 await expect(page).toHaveURL('http://localhost:8085/trips');const saved=[...store.trips.values()][0];
 expect(saved.place_data.name).toBe('Camp');expect(saved.description).toContain('„Camping Morski”');
 await page.goto('/trip-editor?id='+saved.id);await page.getByRole('button',{name:'Dalej',exact:true}).click();
 dialog=await open();proposal=dialog.getByRole('textbox',{name:'Propozycja opisu',exact:true});
 await expect(proposal).toHaveValue(/„Camping Morski”/);await expect(proposal).not.toHaveValue(/„Camp”/);
 await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();
 store.failPlaces=true;dialog=await open();proposal=dialog.getByRole('textbox',{name:'Propozycja opisu',exact:true});
 await expect(proposal).toBeVisible();await expect(proposal).not.toHaveValue(/„Camp”/);
 await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Opis wyjazdu',exact:true})).toHaveValue(saved.description);
});
