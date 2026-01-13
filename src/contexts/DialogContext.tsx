import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Dialog, { DialogData, DialogButton } from '../components/Dialog';

interface DialogContextType {
  showDialog: (
    title: string,
    message: string,
    buttons?: DialogButton[]
  ) => Promise<string | undefined>;
  alert: (title: string, message: string, buttonText?: string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogData[]>([]);

  const showDialog = useCallback(
    (
      title: string,
      message: string,
      buttons?: DialogButton[]
    ): Promise<string | undefined> => {
      return new Promise((resolve) => {
        const id = `dialog-${Date.now()}-${Math.random()}`;
        
        const dialogButtons: DialogButton[] = buttons || [{ text: 'OK' }];
        
        // Wrap button onPress to resolve the promise
        // Also ensure button.text is always a string
        const wrappedButtons = dialogButtons.map((button) => {
          // Normalize button.text to always be a string
          let buttonText: string;
          if (typeof button.text === 'string') {
            buttonText = button.text;
          } else if (button.text && typeof button.text === 'object' && 'text' in button.text) {
            buttonText = String(button.text.text);
          } else {
            buttonText = String(button.text || 'OK');
          }
          
          return {
            ...button,
            text: buttonText,
            onPress: () => {
              if (button.onPress) {
                button.onPress();
              }
              resolve(buttonText);
            },
          };
        });

        const newDialog: DialogData = {
          id,
          title,
          message,
          buttons: wrappedButtons,
        };

        setDialogs((prev) => [...prev, newDialog]);
      });
    },
    []
  );

  const alert = useCallback(
    async (title: string, message: string, buttonText: string = 'OK'): Promise<void> => {
      await showDialog(title, message, [{ text: buttonText }]);
    },
    [showDialog]
  );

  const handleDismiss = useCallback((id: string) => {
    setDialogs((prev) => prev.filter((dialog) => dialog.id !== id));
  }, []);

  return (
    <DialogContext.Provider value={{ showDialog, alert }}>
      {children}
      {dialogs.map((dialog) => (
        <Dialog key={dialog.id} dialog={dialog} onDismiss={handleDismiss} />
      ))}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}



