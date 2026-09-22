import { createContext, useContext } from "react";

type ToastContextValue = (message: string, tone?: "success" | "error") => void;

export const ToastContext = createContext<ToastContextValue>(() => {});

/** Read the toast dispatcher (throwing-free no-op outside the provider). */
export function useToast() {
  return useContext(ToastContext);
}
