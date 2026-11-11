export const suggestionField = (page, label) =>
  page.getByRole('button', { name: 'Otwórz wyszukiwanie: ' + label, exact: true });

export async function openSuggestions(page, label) {
  await suggestionField(page, label).click();
  return page.getByRole('dialog', { name: 'Wyszukiwanie: ' + label, exact: true })
    .getByRole('textbox', { name: label, exact: true });
}

export async function manualDestination(page,name,address,region='pomorskie',country='Polska') {
  await plannedArea(page);
  const input=await openSuggestions(page,'Konkretne miejsce');
  await input.waitFor({state:'visible'});
  if(await page.getByTestId('manual-place-form').count()===0)
    await page.getByRole('button',{name:'Nie ma tego miejsca? Dodaj ręcznie',exact:true}).click();
  await page.getByRole('textbox',{name:'Nazwa miejsca',exact:true}).fill(name);
  await page.getByRole('button',{name:'Kemping',exact:true}).click();
  await page.getByRole('textbox',{name:'Adres miejsca',exact:true}).fill(address);
  await page.getByRole('textbox',{name:'Region',exact:true}).fill(region);
  await page.getByRole('textbox',{name:'Kraj',exact:true}).fill(country);
  await page.getByRole('button',{name:'Użyj tego miejsca',exact:true}).click();
  await page.getByTestId('manual-place-form').waitFor({state:'hidden'});
}

export async function plannedArea(page,name='Ustka') {
  if(await suggestionField(page,'Konkretne miejsce').count())return;
  await (await openSuggestions(page,'Miejscowość / wieś')).fill(name);
  await page.getByRole('button',{name:new RegExp('^Wybierz miejsce: '+name+',')}).first().click();
}
export async function plannedDestination(page) {
  await plannedArea(page);
  await (await openSuggestions(page,'Konkretne miejsce')).fill('Camp');
  await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
}
