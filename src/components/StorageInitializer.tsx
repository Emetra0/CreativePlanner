import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStore } from '@/store/useStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { getAppDir, ensureUserDirectories } from '@/lib/fileSystem';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useTodoStore } from '@/store/useTodoStore';

export default function StorageInitializer() {
  const setProjectPath = useSettingsStore(state => state.setProjectPath);
  const projectPath = useSettingsStore(state => state.projectPath);
  const loadDocuments = useMindmapStore(state => state.loadDocuments);
  
  const initialized = useRef(false);

  // Initialize Auto-save
  useAutoSave(10000); // Check every 10 seconds

  useEffect(() => {
    if (initialized.current) return;
    
    const initStorage = async () => {
      initialized.current = true;
      try {
        // Small delay to allow UI to paint
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await ensureUserDirectories();
        await loadDocuments();
        useTodoStore.getState().rolloverTodos();

        const appDir = await getAppDir();
        // If projectPath is not set or invalid, default to 'root/Cloud Storage'
        if (!projectPath || projectPath === 'root' || projectPath === 'User Storage' || projectPath === 'root/User Storage') {
             setProjectPath('root/Cloud Storage');
        }
      } catch (error) {
        console.error("Failed to initialize storage:", error);
      }
    };

    initStorage();
  }, [setProjectPath, projectPath, loadDocuments]);

  return null;
}
