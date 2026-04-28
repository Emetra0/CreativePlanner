import React from 'react';
import { AlertCircle, Check, Trash2, Edit3 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useTheme } from 'next-themes';

type AlertOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
};

type PromptOptions = {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
};

type DialogState =
  | { type: 'idle' }
  | { type: 'alert'; options: AlertOptions; resolve: () => void }
  | { type: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

type AppDialogsContextValue = {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const AppDialogsContext = React.createContext<AppDialogsContextValue | null>(null);

function AppDialogPrompt({
  options,
  onCancel,
  onSubmit,
}: {
  options: PromptOptions;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = React.useState(options.initialValue ?? '');
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';

  React.useEffect(() => {
    setValue(options.initialValue ?? '');
  }, [options.initialValue]);

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={options.title}
      description={options.message}
      type={options.isDanger ? 'danger' : 'default'}
      icon={options.isDanger ? <Trash2 className="text-red-500" size={22} /> : <Edit3 className="text-blue-500" size={22} />}
      widthClassName="w-[30rem]"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDarkTheme ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="submit"
            form="app-dialog-prompt-form"
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors inline-flex items-center gap-2 ${options.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            <Check size={16} />
            {options.submitLabel ?? 'Save'}
          </button>
        </>
      }
    >
      <form
        id="app-dialog-prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
        className="space-y-3"
      >
        <label className={`block text-sm font-medium ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
          {options.label ?? 'Value'}
        </label>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={options.placeholder}
          className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
        />
      </form>
    </Modal>
  );
}

export function AppDialogsProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = React.useState<DialogState>({ type: 'idle' });
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';

  const value = React.useMemo<AppDialogsContextValue>(() => ({
    alert: (options) => new Promise<void>((resolve) => setDialog({ type: 'alert', options, resolve })),
    confirm: (options) => new Promise<boolean>((resolve) => setDialog({ type: 'confirm', options, resolve })),
    prompt: (options) => new Promise<string | null>((resolve) => setDialog({ type: 'prompt', options, resolve })),
  }), []);

  const closeAlert = React.useCallback(() => {
    setDialog((current) => {
      if (current.type === 'alert') current.resolve();
      return { type: 'idle' };
    });
  }, []);

  const closeConfirm = React.useCallback((result: boolean) => {
    setDialog((current) => {
      if (current.type === 'confirm') current.resolve(result);
      return { type: 'idle' };
    });
  }, []);

  const closePrompt = React.useCallback((result: string | null) => {
    setDialog((current) => {
      if (current.type === 'prompt') current.resolve(result);
      return { type: 'idle' };
    });
  }, []);

  return (
    <AppDialogsContext.Provider value={value}>
      {children}

      {dialog.type === 'alert' && (
        <Modal
          isOpen
          onClose={closeAlert}
          title={dialog.options.title}
          description={dialog.options.message}
          type={dialog.options.tone ?? 'default'}
          icon={<AlertCircle className="text-blue-500" size={22} />}
          widthClassName="w-[28rem]"
          footer={
            <button
              onClick={closeAlert}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {dialog.options.confirmLabel ?? 'OK'}
            </button>
          }
        >
          <p className="text-sm leading-6">{dialog.options.message}</p>
        </Modal>
      )}

      {dialog.type === 'confirm' && (
        <Modal
          isOpen
          onClose={() => closeConfirm(false)}
          title={dialog.options.title}
          description={dialog.options.isDanger ? 'Please confirm this destructive action.' : undefined}
          type={dialog.options.isDanger ? 'danger' : 'default'}
          icon={dialog.options.isDanger ? <Trash2 className="text-red-500" size={22} /> : <AlertCircle className="text-blue-500" size={22} />}
          widthClassName="w-[28rem]"
          footer={
            <>
              <button
                onClick={() => closeConfirm(false)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDarkTheme ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {dialog.options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${dialog.options.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {dialog.options.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <p className="text-sm leading-6">{dialog.options.message}</p>
        </Modal>
      )}

      {dialog.type === 'prompt' && (
        <AppDialogPrompt
          options={dialog.options}
          onCancel={() => closePrompt(null)}
          onSubmit={(value) => closePrompt(value)}
        />
      )}
    </AppDialogsContext.Provider>
  );
}

export function useAppDialogs() {
  const context = React.useContext(AppDialogsContext);
  if (!context) {
    throw new Error('useAppDialogs must be used within AppDialogsProvider');
  }
  return context;
}