import React from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Check, AlertCircle, Edit, Plus } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppTranslation } from '@/lib/appTranslations';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  type?: 'default' | 'danger' | 'warning' | 'success';
  icon?: React.ReactNode;
  description?: React.ReactNode;
  widthClassName?: string;
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  type = 'default',
  icon,
  description,
  widthClassName = 'w-[28rem]',
  closeOnBackdrop = true,
  hideCloseButton = false,
}: ModalProps) {
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const accentClass = {
    default: isDarkTheme ? 'ring-blue-500/20' : 'ring-blue-500/10',
    danger: isDarkTheme ? 'ring-red-500/20' : 'ring-red-500/10',
    warning: isDarkTheme ? 'ring-amber-500/20' : 'ring-amber-500/10',
    success: isDarkTheme ? 'ring-emerald-500/20' : 'ring-emerald-500/10',
  }[type];

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        className={`${widthClassName} max-w-full overflow-hidden rounded-2xl border shadow-2xl ring-1 ${accentClass} ${isDarkTheme ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${isDarkTheme ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="min-w-0">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isDarkTheme ? 'text-white' : 'text-gray-900'}`}>
              {icon}
              <span className="truncate">{title}</span>
            </h3>
            {description && (
              <div className={`mt-1 text-sm ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>
                {description}
              </div>
            )}
          </div>
          {!hideCloseButton && (
            <button onClick={onClose} className={`rounded-lg p-1.5 transition-colors ${isDarkTheme ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className={`px-6 py-5 ${isDarkTheme ? 'text-gray-300' : 'text-gray-600'}`}>
          {children}
        </div>

        {footer && (
          <div className={`flex flex-wrap justify-end gap-3 border-t px-6 py-4 ${isDarkTheme ? 'border-gray-700 bg-gray-900/20' : 'border-gray-100 bg-gray-50/70'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', isDanger = false }: ConfirmModalProps) {
  const { theme } = useTheme();
  const { t } = useAppTranslation();
  const isDarkTheme = theme === 'dark';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      type={isDanger ? 'danger' : 'default'}
      icon={isDanger ? <Trash2 className="text-red-500" size={24} /> : <AlertCircle className="text-blue-500" size={24} />}
      description={isDanger ? t('modal.dangerDescription') : undefined}
      footer={
        <>
          <button 
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${isDarkTheme ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('modal.cancel')}
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${
              isDanger 
              ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30' 
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
            }`}
          >
            {isDanger ? <Trash2 size={16} /> : <Check size={16} />}
            {confirmLabel === 'Confirm' ? t('modal.confirm') : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6">{message}</p>
    </Modal>
  );
}

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
}

export function InputModal({ isOpen, onClose, onSubmit, title, label, placeholder, initialValue = '', submitLabel = 'Submit' }: InputModalProps) {
  const [value, setValue] = React.useState(initialValue);
  const { theme } = useTheme();
  const { t } = useAppTranslation();
  const isDarkTheme = theme === 'dark';

  React.useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={<Edit className="text-blue-500" size={24} />}
      widthClassName="w-[30rem]"
      footer={
        <>
          <button 
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${isDarkTheme ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('modal.cancel')}
          </button>
          <button 
            onClick={handleSubmit}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 rounded-lg transition-all transform active:scale-95 flex items-center gap-2"
          >
            <Check size={16} />
            {submitLabel === 'Submit' ? t('modal.submit') : submitLabel}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label className={`block text-sm font-medium mb-2 ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
          {label || t('modal.name')}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
          autoFocus
        />
      </form>
    </Modal>
  );
}

interface NodeCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (label: string, categoryId: string) => void;
  categories: { id: string; name: string; color: string }[];
  initialCategory?: string;
  title?: string;
}

export function NodeCreationModal({ isOpen, onClose, onSubmit, categories, initialCategory = 'default', title = 'Create Node' }: NodeCreationModalProps) {
  const [label, setLabel] = React.useState('');
  const [category, setCategory] = React.useState(initialCategory);
  const { theme } = useTheme();
  const { t } = useAppTranslation();
  const isDarkTheme = theme === 'dark';

  React.useEffect(() => {
    if (isOpen) {
      setLabel('');
      setCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (label) {
      onSubmit(label, category);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title === 'Create Node' ? t('modal.createNode') : title}
      icon={<Plus className="text-blue-500" size={24} />}
      widthClassName="w-[34rem]"
      footer={
        <>
          <button 
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${isDarkTheme ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('modal.cancel')}
          </button>
          <button 
            onClick={handleSubmit}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 rounded-lg transition-all transform active:scale-95 flex items-center gap-2"
          >
            <Check size={16} />
            {t('modal.createNodeAction')}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
            {t('modal.nodeLabel')}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('modal.nodeLabelPlaceholder')}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
            autoFocus
          />
        </div>
        
        <div>
          <label className={`block text-sm font-medium mb-2 ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
            {t('modal.category')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`
                  flex items-center gap-2 p-2 rounded-lg border transition-all text-left
                  ${category === cat.id 
                    ? (isDarkTheme ? 'border-blue-500 bg-blue-900/20 ring-1 ring-blue-500' : 'border-blue-500 bg-blue-50 ring-1 ring-blue-500')
                    : (isDarkTheme ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50')}
                `}
              >
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: cat.color }}
                />
                <span className={`text-sm truncate ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
