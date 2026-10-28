/* eslint-disable @typescript-eslint/no-require-imports -- Literal, deferred Metro modules keep demo fixtures out of live initialization. */
// Explicit boundary for the separate developer preview. Live account providers
// start empty; loading fixture collections is deferred until demo is requested.
export function demoMailbox(): typeof import('./mocks/messaging').DEMO_MAILBOX {
  return require('./mocks/messaging').DEMO_MAILBOX;
}
export function demoOwnTrips(): typeof import('./mocks/owned-trips').DEMO_OWN_TRIPS {
  return require('./mocks/owned-trips').DEMO_OWN_TRIPS;
}
export function demoProfile(): typeof import('./mocks/profile').DEMO_PROFILE {
  return require('./mocks/profile').DEMO_PROFILE;
}
export function demoProposals(): typeof import('./mocks/travel').DEMO_PROPOSALS {
  return require('./mocks/travel').DEMO_PROPOSALS;
}
