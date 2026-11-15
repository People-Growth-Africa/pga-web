import { useContext } from 'react';
import { RegistrationAvailabilityContext } from '../context/registrationAvailability';

export function useRegistrationAvailability(slug: string | null) {
  const context = useContext(RegistrationAvailabilityContext);
  return {
    status: slug ? context.statusFor(slug) : 'checking',
    refresh: context.refresh,
  } as const;
}
