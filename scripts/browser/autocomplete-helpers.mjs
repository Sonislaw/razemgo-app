export const suggestionField = (page, label) =>
  page.getByRole('button', { name: 'Otwórz wyszukiwanie: ' + label, exact: true });

export async function openSuggestions(page, label) {
  await suggestionField(page, label).click();
  return page.getByRole('dialog', { name: 'Wyszukiwanie: ' + label, exact: true })
    .getByRole('textbox', { name: label, exact: true });
}
