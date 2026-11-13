import { createContext, type ReactNode } from 'react';

export type ConfirmTone = 'danger' | 'warning' | 'success';

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  note?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  requireText?: string;
  onConfirm?: () => void | Promise<void>;
};

export type ConfirmRequest = {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

export type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFunction | null>(null);
