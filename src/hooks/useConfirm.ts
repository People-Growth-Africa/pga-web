import { useContext } from 'react';
import { ConfirmContext, type ConfirmFunction } from '../context/ConfirmContext';

export function useConfirm(): ConfirmFunction {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.');
  return confirm;
}
