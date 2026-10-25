import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {ActivityIndicator,AppState,View} from 'react-native';
import {USE_DEMO_DATA} from '@/constants/app';
import {useAuth} from '@/features/auth/auth-context';
import {AuthScreen,AuthNotice} from '@/features/auth/auth-ui';
import {Button} from '@/components/ui/primitives';
import {fetchAccountAccess} from './moderation-repository';
import type {AccountAccess} from './moderation-types';
type AccessState=AccountAccess & {status:'loading'|'ready'|'error';refresh:()=>void};
const AccessContext=createContext<AccessState|null>(null);
const EMPTY:AccountAccess={is_admin:false,suspended:false,hidden_trip_ids:[]};
function AccessProvider({children}:{children:ReactNode}) {
  const {session}=useAuth();
  const [access,setAccess]=useState<AccountAccess>(EMPTY);
  const [status,setStatus]=useState<AccessState['status']>(session && !USE_DEMO_DATA ? 'loading' : 'ready');
  const [attempt,retry]=useState(0);
  const refresh=useCallback(()=>retry(value=>value+1),[]);
  useEffect(()=>{
    if (!session || USE_DEMO_DATA) return;
    let alive=true,pending=false;
    const load=async()=>{
      if (pending) return;
      pending=true;
      try {const next=await fetchAccountAccess();if (alive) {setAccess(next);setStatus('ready');}}
      catch {if (alive) setStatus(previous=>previous==='ready' ? previous : 'error');}
      finally {pending=false;}
    };
    void load();
    const timer=setInterval(()=>void load(),30000);
    const subscription=AppState.addEventListener('change',state=>{if (state==='active') void load();});
    return ()=>{alive=false;clearInterval(timer);subscription.remove();};
  },[session,attempt]);
  return <AccessContext value={{...access,status,refresh}}>{children}</AccessContext>;
}
export function AccountAccessProvider({children}:{children:ReactNode}) {
  const {session}=useAuth();
  return <AccessProvider key={session?.user.id ?? 'guest'}>{children}</AccessProvider>;
}
export function useAccountAccess() {
  const state=useContext(AccessContext);
  if (!state) throw new Error('AccountAccessProvider required');
  return state;
}
export function AccountAccessGate({children}:{children:ReactNode}) {
  const access=useAccountAccess();const auth=useAuth();
  const [signingOut,setSigningOut]=useState(false);
  const [deleting,setDeleting]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[deleteError,setDeleteError]=useState<string|null>(null);
  const leave=async()=>{setSigningOut(true);try {await auth.signOut();}catch {await auth.resetSession();}finally {setSigningOut(false);}};
  const remove=async()=>{setDeleting(true);try {setDeleteError(await auth.deleteAccount());}catch {setDeleteError('Nie udało się usunąć konta. Spróbuj ponownie.');}finally {setDeleting(false);}};
  if (!auth.session || USE_DEMO_DATA) return children;
  if (access.status==='loading') return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><ActivityIndicator accessibilityLabel="Sprawdzanie dostępu do konta" /></View>;
  if (access.status==='error') return <AuthScreen title="Sprawdźmy dostęp do konta"><AuthNotice message="Nie udało się sprawdzić dostępu. Spróbuj ponownie." error />
    <Button label="Spróbuj ponownie" onPress={access.refresh} /><Button label="Wyloguj się" variant="secondary" disabled={signingOut} onPress={()=>void leave()} /></AuthScreen>;
  if (access.suspended) return <AuthScreen title="Konto zostało zablokowane"><AuthNotice message="Możliwość korzystania z RazemGo została wstrzymana przez moderację." />
    <Button label="Sprawdź ponownie" onPress={access.refresh} /><Button label="Wyloguj się" disabled={signingOut || deleting} onPress={()=>void leave()} />
    {confirmDelete ? <><AuthNotice message="Usunięcie konta i profilu jest nieodwracalne." error /><Button label={deleting ? 'Usuwanie…' : 'Potwierdzam — usuń konto'} disabled={deleting} onPress={()=>void remove()} /><Button label="Zachowaj konto" variant="secondary" disabled={deleting} onPress={()=>setConfirmDelete(false)} /></>
      : <Button label="Usuń konto" variant="secondary" onPress={()=>setConfirmDelete(true)} />}
    <AuthNotice message={deleteError} error /></AuthScreen>;
  return children;
}
