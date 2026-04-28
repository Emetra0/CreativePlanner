import { useThemeStore } from '@/store/useThemeStore';
import { useIdeaStore } from '@/store/useIdeaStore';
import { useStore } from '@/store/useStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useOfficeDocumentStore } from '@/store/useOfficeDocumentStore';

// Configuration
const WORKER_URL_KEY = 'creative_planner_worker_url';
const USER_ID_KEY = 'creative_planner_user_id';

// Production Cloudflare worker fallback.
const DEFAULT_WORKER_URL = 'https://creative-planner-sync.emetraproduction.workers.dev';
const DEV_WORKER_URL = 'http://127.0.0.1:8787';

export const getWorkerUrl = () => {
    if (typeof window !== 'undefined') {
        const storedUrl = localStorage.getItem(WORKER_URL_KEY)?.trim();
        if (storedUrl) return storedUrl;
    }
    const configuredUrl = import.meta.env.VITE_WORKER_URL?.trim();
    if (configuredUrl) return configuredUrl;
    return import.meta.env.DEV ? DEV_WORKER_URL : DEFAULT_WORKER_URL;
};

export const setWorkerUrl = (url: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKER_URL_KEY, url);
};

export const getUserId = () => {
    if (typeof window === 'undefined') return '';
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
        userId = 'user-' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
};

export const setUserId = (id: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_ID_KEY, id);
};

// Data Aggregation
export const getAllAppData = async () => {
    const store = useStore.getState();
    const mindmaps = await useMindmapStore.getState().exportDocumentsForSync();
    const officeDocuments = await useOfficeDocumentStore.getState().exportDocumentsForSync();
    return {
        themes: useThemeStore.getState().themes,
        ideas: useIdeaStore.getState().ideas,
        nodes: store.nodes,
        edges: store.edges,
        categories: store.categories,
        mindMapTheme: store.mindMapTheme,
        references: useReferenceStore.getState().references,
        calendarEvents: useCalendarStore.getState().events,
        mindmaps,
        officeDocuments,
    };
};

export const setAllAppData = async (data: any) => {
    if (!data) return;
    
    if (data.themes) useThemeStore.getState().setThemes(data.themes);
    if (data.ideas) useIdeaStore.getState().setIdeas(data.ideas);
    
    const store = useStore.getState();
    
    // Restore MindMap state
    if (data.nodes || data.edges || data.categories) {
        store.setMindMapState(
            data.nodes || [], 
            data.edges || [], 
            data.categories || []
        );
    }
    
    if (data.mindMapTheme) {
        store.setMindMapTheme(data.mindMapTheme);
    }

    if (data.references) useReferenceStore.getState().setReferences(data.references);
    if (data.calendarEvents) useCalendarStore.getState().setEvents(data.calendarEvents);
    if (data.mindmaps) {
        await useMindmapStore.getState().importDocumentsFromSync(data.mindmaps, { preferIncoming: true });
    }
    if (data.officeDocuments) {
        await useOfficeDocumentStore.getState().importDocumentsFromSync(data.officeDocuments, { preferIncoming: true });
    }
};

// Cloud Operations
export const saveToCloud = async (token: string, data: any) => {
    const url = getWorkerUrl();
    if (!url) return false;

    try {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data })
        });
        return response.ok;
    } catch (error) {
        console.error('Cloud save failed:', error);
        return false;
    }
};

export const loadFromCloud = async (token: string) => {
    const url = getWorkerUrl();
    if (!url) return null;

    try {
        const response = await fetch(`${url}/load`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const json = await response.json();
            return json.data;
        }
        return null;
    } catch (error) {
        console.error('Cloud load failed:', error);
        return null;
    }
};
