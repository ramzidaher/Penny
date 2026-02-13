/**
 * Tracks when the app is in a transient UI flow (e.g. image picker).
 * Prevents the app lock screen from showing when returning from that flow on Android/iOS.
 */

let transientUIActive = false;

export const setTransientUIActive = (active: boolean): void => {
  transientUIActive = active;
};

export const getTransientUIActive = (): boolean => {
  return transientUIActive;
};
