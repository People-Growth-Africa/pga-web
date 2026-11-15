import { createContext } from 'react';

export type RegistrationStatus = 'checking' | 'open' | 'closed' | 'unavailable';

export type RegistrationAvailabilityContextValue = {
  statusFor: (slug: string) => RegistrationStatus;
  refresh: () => Promise<void>;
};

export const RegistrationAvailabilityContext =
  createContext<RegistrationAvailabilityContextValue>({
    statusFor: () => 'checking',
    refresh: async () => {},
  });
