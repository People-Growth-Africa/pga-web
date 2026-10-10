import { useEffect, useState } from 'react';
import { checkFormsAvailability, type FormsAvailability } from '../lib/formsAvailability';

/**
 * The public forms' availability as a render state.
 *
 * It starts as 'checking' so a form is not flashed and then withdrawn: the
 * notice replaces the fields only once the server has been asked and answered.
 * The request itself is shared between every form on the page (see
 * `checkFormsAvailability`), so mounting four of them costs one call.
 */
export function useFormsAvailability(): FormsAvailability {
  const [state, setState] = useState<FormsAvailability>('checking');

  useEffect(() => {
    let active = true;
    void checkFormsAvailability().then((available) => {
      if (!active) return;
      setState(available ? 'available' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
