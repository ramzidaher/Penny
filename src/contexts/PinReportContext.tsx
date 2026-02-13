import React, { createContext, useContext } from 'react';

export type PinReportContextValue = {
  reportPinJustSet: () => void;
} | null;

const PinReportContext = createContext<PinReportContextValue>(null);

export const PinReportProvider = PinReportContext.Provider;

export function usePinReport(): PinReportContextValue {
  return useContext(PinReportContext);
}
