// App preference is independent of the device theme. A settings screen can
// supply the selected theme here when theme selection is introduced.
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
