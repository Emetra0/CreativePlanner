import { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { useIdeaStore } from '@/store/useIdeaStore';
import { useStore } from '@/store/useStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { getAllAppData, saveToCloud, saveToLocalSync, getWorkerUrl } from '@/lib/cloudSync';

export const useAutoSave = (interval = 5000) => {
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Refs to track if we have unsaved changes
    const hasChanges = useRef(false);
    
    // Subscribe to stores to detect changes
    useEffect(() => {
        const unsubTheme = useThemeStore.subscribe(() => { hasChanges.current = true; });
        const unsubIdea = useIdeaStore.subscribe(() => { hasChanges.current = true; });
        const unsubStore = useStore.subscribe(() => { hasChanges.current = true; });
        const unsubRef = useReferenceStore.subscribe(() => { hasChanges.current = true; });
        const unsubMindmap = useMindmapStore.subscribe(() => { hasChanges.current = true; });
        
        return () => {
            unsubTheme();
            unsubIdea();
            unsubStore();
            unsubRef();
            unsubMindmap();
        };
    }, []);

    useEffect(() => {
        const timer = setInterval(async () => {
            const { autoSave } = useSettingsStore.getState();
            if (!autoSave) return;

            const { token } = useAuthStore.getState();
            const { cloudPath } = useSettingsStore.getState();
            const workerUrl = getWorkerUrl();
            
            if ((!token && !cloudPath) || !hasChanges.current || isSaving) return;
            
            setIsSaving(true);
            setError(null);
            
            try {
                const data = await getAllAppData();
                const cloudSuccess = token && workerUrl ? await saveToCloud(token, data) : false;
                const localSuccess = cloudPath ? await saveToLocalSync(data) : false;
                
                if (cloudSuccess || localSuccess) {
                    setLastSaved(new Date());
                    hasChanges.current = false;
                } else {
                    setError('Failed to save to cloud or local sync');
                }
            } catch (err) {
                setError('Error saving data');
                console.error(err);
            } finally {
                setIsSaving(false);
            }
        }, interval);

        return () => clearInterval(timer);
    }, [interval, isSaving]);

    return { isSaving, lastSaved, error };
};
