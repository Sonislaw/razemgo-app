import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { USE_DEMO_DATA } from '@/constants/app';
import { installMonitoringReporter } from './monitoring-core';
import { createRequestKey } from './request-key';
import { createReportLimiter, monitoringEnvironment, monitoringRoute, sanitizeMonitoringEvent, type ReportContext, type SafeMetadata } from '../../shared/monitoring-policy';

const metadata: SafeMetadata = {
  release:'razemgo@' + (Constants.expoConfig?.version ?? 'unknown'),
  environment: monitoringEnvironment(process.env.EXPO_PUBLIC_APP_ENV),
  platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
  osVersion:String(Platform.Version),
};
let screen='unknown';
let started=false;
const allow=createReportLimiter();
export function setMonitoringScreen(path: string) { screen=monitoringRoute(path); }
export function initializeMonitoring() {
  if (started || USE_DEMO_DATA) return;
  const dsn=process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn || !/^https:\/\/[^/]+@[^/]+\/\d+$/.test(dsn)) return;
  if (__DEV__ && process.env.EXPO_PUBLIC_MONITORING_IN_DEV !== 'true') return;
  started=true;
  try {
    Sentry.init({dsn, debug:false, release:metadata.release, environment:metadata.environment,
      // JS reports work in the currently installed APK. Native reports must not bypass our JS sanitizer.
      enableNative:false, enableNativeCrashHandling:false, enableNativeNagger:false,
      enableAutoSessionTracking:false, enableAutoPerformanceTracing:false,
      enableAppStartTracking:false, enableNativeFramesTracking:false, enableStallTracking:false,
      enableCaptureFailedRequests:false, enableUserInteractionTracing:false,
      sendDefaultPii:false, sendClientReports:false, enableLogs:false, maxBreadcrumbs:0,
      attachScreenshot:false, attachViewHierarchy:false, tracesSampleRate:0,
      beforeBreadcrumb:()=>null, beforeSendTransaction:()=>null, beforeSendLog:()=>null,
      integrations: defaults=>defaults.filter(item=>['ReactNativeErrorHandlers','GlobalHandlers','BrowserApiErrors','InboundFilters','Dedupe','RewriteFrames','DebugMeta'].includes(item.name)),
      beforeSend(event,hint) {
        hint.attachments=[];
        const details=(event.contexts?.monitoring ?? {}) as ReportContext;
        const safe=sanitizeMonitoringEvent(event,metadata,{...details,screen});
        if (!safe || !allow(JSON.stringify(safe.fingerprint))) return null;
        return safe;
      },
    });
    installMonitoringReporter((error,context)=> { Sentry.captureException(error,{contexts:{monitoring:{...context}}}); });
    void identifyInstallation();
  } catch { started=false; }
}
async function identifyInstallation() {
  try {
    const key='razemgo.monitoring.installation';
    const saved=Platform.OS==='web' ? globalThis.localStorage?.getItem(key) : await SecureStore.getItemAsync(key);
    const id=saved && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(saved) ? saved : createRequestKey();
    if (saved!==id) {
      if (Platform.OS==='web') globalThis.localStorage?.setItem(key,id);
      else await SecureStore.setItemAsync(key,id,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    }
    metadata.installationId=id;
  } catch { /* Diagnostics are still usable without an installation identifier. */ }
}
export function reportRenderError(error: Error) {
  try { if (started) Sentry.captureException(error,{contexts:{monitoring:{operation:'app.render'}}}); }
  catch { /* Keep the recovery screen usable if diagnostics fail. */ }
}
export function monitoringEnabled() { return started; }
export async function sendMonitoringTest() {
  if (!__DEV__ || !started) return null;
  const id=Sentry.captureException(new Error('Monitoring test'),{contexts:{monitoring:{operation:'monitoring.test'}}});
  await Sentry.getClient()?.flush(3000);
  return id;
}
