import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LibraryImage {
  id: string;
  name: string;
  dataUrl: string; // base64 data URL
  uploadedAt: number;
  width?: number;
  height?: number;
}

interface ImageLibraryState {
  images: LibraryImage[];
  addImage: (img: Omit<LibraryImage, 'id' | 'uploadedAt'>) => string;
  removeImage: (id: string) => void;
  clearAll: () => void;
}

export const useImageLibraryStore = create<ImageLibraryState>()(
  persist(
    (set) => ({
      images: [],

      addImage: (img) => {
        const id = `lib-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const entry: LibraryImage = { ...img, id, uploadedAt: Date.now() };
        set((s) => ({ images: [...s.images, entry] }));
        return id;
      },

      removeImage: (id) => {
        set((s) => ({ images: s.images.filter((i) => i.id !== id) }));
      },

      clearAll: () => set({ images: [] }),
    }),
    {
      name: 'creative-planner-image-library',
    },
  ),
);

/** Read a File as a base64 data URL */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Get natural dimensions of an image data URL */
export function getImageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}
