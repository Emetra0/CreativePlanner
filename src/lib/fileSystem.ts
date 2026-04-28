import type { FileData } from 'chonky';

export type { FileData };

// Check if running in Tauri
export const isTauri = () => typeof window !== 'undefined' && (
    '__TAURI__' in window || 
    '__TAURI_INTERNALS__' in window
);

// --- Browser Native File System (Web Mode) ---
let rootDirectoryHandle: FileSystemDirectoryHandle | null = null;
let syncDirectoryHandle: FileSystemDirectoryHandle | null = null;
const LOCAL_SYNC_FILE_NAME = 'creative-planner-sync.json';

// Helper to get handle from path
const getHandleFromPath = async (path: string): Promise<FileSystemHandle | null> => {
    if (!rootDirectoryHandle) return null;
    if (path === 'root' || path === rootDirectoryHandle.name) return rootDirectoryHandle;
    
    let relativePath = path;
    if (path.startsWith(rootDirectoryHandle.name + '/')) {
        relativePath = path.slice(rootDirectoryHandle.name.length + 1);
    } else if (path.startsWith('root/')) {
        relativePath = path.slice(5);
    }
    
    const parts = relativePath.split('/').filter(p => p);
    let current: FileSystemDirectoryHandle = rootDirectoryHandle;
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
            try {
                return await current.getDirectoryHandle(part);
            } catch {
                try {
                    return await current.getFileHandle(part);
                } catch {
                    return null;
                }
            }
        } else {
            try {
                current = await current.getDirectoryHandle(part);
            } catch {
                return null;
            }
        }
    }
    return current;
};

// --- Virtual File System (LocalStorage Fallback) ---
let FS_PREFIX = 'cp_fs:';

export const setFileSystemUserId = (userId: string | null) => {
    if (userId) {
        FS_PREFIX = `cp_fs:${userId}:`;
    } else {
        FS_PREFIX = 'cp_fs:';
    }
};

const normalizePath = (path: string): string => {
    if (!path || path === 'root') return 'root';
    return path.replace(/\\/g, '/').replace(/\/+$/, '');
};

const getVirtualPath = (path: string, name?: string) => {
    const norm = normalizePath(path);
    if (name) return `${norm}/${name}`;
    return norm;
};

// --- Public API ---

export const setRootDirectory = async (): Promise<string | null> => {
    if (isTauri()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
            directory: true,
            multiple: false,
        });
        return typeof selected === 'string' ? selected : null;
    } else {
        try {
            // @ts-ignore
            rootDirectoryHandle = await window.showDirectoryPicker();
            return rootDirectoryHandle ? rootDirectoryHandle.name : null;
        } catch (e) {
            console.error("Failed to open directory:", e);
            return null;
        }
    }
};

export const selectLocalSyncDirectory = async (): Promise<string | null> => {
    if (isTauri()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Local Sync Folder',
        });
        return typeof selected === 'string' ? selected : null;
    }

    try {
        // @ts-ignore
        syncDirectoryHandle = await window.showDirectoryPicker();
        return syncDirectoryHandle ? syncDirectoryHandle.name : null;
    } catch (error) {
        console.error('Failed to open local sync directory:', error);
        return null;
    }
};

export const writeLocalSyncData = async (targetPath: string, content: string): Promise<boolean> => {
    if (!targetPath) return false;

    if (isTauri()) {
        try {
            const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
            const { join } = await import('@tauri-apps/api/path');
            await mkdir(targetPath, { recursive: true });
            await writeTextFile(await join(targetPath, LOCAL_SYNC_FILE_NAME), content);
            return true;
        } catch (error) {
            console.error('Failed to write local sync data:', error);
            return false;
        }
    }

    if (!syncDirectoryHandle) return false;

    try {
        const fileHandle = await syncDirectoryHandle.getFileHandle(LOCAL_SYNC_FILE_NAME, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Failed to write browser sync data:', error);
        return false;
    }
};

export const readLocalSyncData = async (targetPath: string | null | undefined): Promise<string | null> => {
    if (isTauri()) {
        if (!targetPath) return null;

        try {
            const { readTextFile } = await import('@tauri-apps/plugin-fs');
            const { join } = await import('@tauri-apps/api/path');
            return await readTextFile(await join(targetPath, LOCAL_SYNC_FILE_NAME));
        } catch {
            return null;
        }
    }

    if (!syncDirectoryHandle) return null;

    try {
        const fileHandle = await syncDirectoryHandle.getFileHandle(LOCAL_SYNC_FILE_NAME);
        const file = await fileHandle.getFile();
        return await file.text();
    } catch {
        return null;
    }
};

export const getFiles = async (path: string): Promise<FileData[]> => {
  if (isTauri()) {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      
      const entries = await readDir(path);
      
      const files: FileData[] = await Promise.all(entries
        .filter(entry => entry.name !== '.keep') // Filter out .keep files
        .map(async (entry) => {
        return {
          id: await join(path, entry.name),
          name: entry.name,
          isDir: entry.isDirectory,
        };
      }));
      
      return files;
    } catch (e) {
      console.error('Tauri FS error:', e);
      return [];
    }
  } else if (rootDirectoryHandle) {
      try {
          const handle = await getHandleFromPath(path);
          if (!handle || handle.kind !== 'directory') return [];
          
          const dirHandle = handle as FileSystemDirectoryHandle;
          const results: FileData[] = [];
          
          // @ts-ignore
          for await (const [name, entry] of dirHandle.entries()) {
              if (name === '.keep') continue; // Filter out .keep files

              const entryPath = path === 'root' || path === rootDirectoryHandle.name 
                  ? `${rootDirectoryHandle.name}/${name}` 
                  : `${path}/${name}`;
                  
              results.push({
                  id: entryPath,
                  name: name,
                  isDir: entry.kind === 'directory'
              });
          }
          return results;
      } catch (e) {
          console.error("Native FS Error:", e);
          return [];
      }
  } else {
    // Virtual FS (LocalStorage)
    const normPath = normalizePath(path);
    const results: FileData[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(FS_PREFIX)) {
            const fsPath = key.slice(FS_PREFIX.length);
            if (fsPath.startsWith(normPath + '/')) {
                const relative = fsPath.slice(normPath.length + 1);
                const parts = relative.split('/');
                const name = parts[0];
                
                if (name === '.keep') continue; // Filter out .keep files

                if (!seen.has(name)) {
                    seen.add(name);
                    results.push({
                        id: `${normPath}/${name}`,
                        name: name,
                        isDir: parts.length > 1 // If it has more parts, it's a folder implicitly
                    });
                }
            }
        }
    }
    return results;
  }
};

export const createFolder = async (path: string, name: string): Promise<void> => {
  if (isTauri()) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const fullPath = await join(path, name);
    await mkdir(fullPath);
  } else if (rootDirectoryHandle) {
      const handle = await getHandleFromPath(path);
      if (handle && handle.kind === 'directory') {
          await (handle as FileSystemDirectoryHandle).getDirectoryHandle(name, { create: true });
      }
  } else {
    // Virtual FS: Folders are implicit, but we can create a marker file
    const fullPath = getVirtualPath(path, name);
    localStorage.setItem(`${FS_PREFIX}${fullPath}/.keep`, '');
  }
};

export const createFile = async (path: string, name: string, content: string = ''): Promise<void> => {
  if (isTauri()) {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const fullPath = await join(path, name);
    await writeTextFile(fullPath, content);
  } else if (rootDirectoryHandle) {
      const handle = await getHandleFromPath(path);
      if (handle && handle.kind === 'directory') {
          const fileHandle = await (handle as FileSystemDirectoryHandle).getFileHandle(name, { create: true });
          const writable = await (fileHandle as any).createWritable();
          await writable.write(content);
          await writable.close();
      }
  } else {
    const fullPath = getVirtualPath(path, name);
    localStorage.setItem(`${FS_PREFIX}${fullPath}`, content);
  }
};

export const readFile = async (path: string): Promise<string | null> => {
  if (isTauri()) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      return await readTextFile(path);
    } catch (e) {
      return null;
    }
  } else if (rootDirectoryHandle) {
      try {
          const handle = await getHandleFromPath(path);
          if (handle && handle.kind === 'file') {
              const file = await (handle as FileSystemFileHandle).getFile();
              return await file.text();
          }
          return null;
      } catch (e) {
          return null;
      }
  } else {
    const normPath = normalizePath(path);
    return localStorage.getItem(`${FS_PREFIX}${normPath}`);
  }
};

// Helper for Virtual FS Binary Support
const arrayBufferToBase64 = (buffer: Uint8Array): string => {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return window.btoa(binary);
};

const base64ToArrayBuffer = (base64: string): Uint8Array => {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
};

export const readBinaryFile = async (path: string): Promise<Uint8Array | null> => {
  if (isTauri()) {
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(path);
    } catch (e) {
      return null;
    }
  } else if (rootDirectoryHandle) {
      try {
          const handle = await getHandleFromPath(path);
          if (handle && handle.kind === 'file') {
              const file = await (handle as FileSystemFileHandle).getFile();
              const buffer = await file.arrayBuffer();
              return new Uint8Array(buffer);
          }
          return null;
      } catch (e) {
          return null;
      }
  } else {
    // Virtual FS (LocalStorage) - Base64 support
    const normPath = normalizePath(path);
    const content = localStorage.getItem(`${FS_PREFIX}${normPath}`);
    if (content && content.startsWith('base64:')) {
        try {
            return base64ToArrayBuffer(content.slice(7));
        } catch (e) {
            console.error("Failed to decode base64 file", e);
            return null;
        }
    }
    return null; 
  }
};

export const writeBinaryFile = async (path: string, content: Uint8Array): Promise<void> => {
  if (isTauri()) {
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, content);
  } else if (rootDirectoryHandle) {
      const name = path.split('/').pop() || 'file';
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const handle = await getHandleFromPath(parentPath);
      if (handle && handle.kind === 'directory') {
          const fileHandle = await (handle as FileSystemDirectoryHandle).getFileHandle(name, { create: true });
          const writable = await (fileHandle as any).createWritable();
          await writable.write(content);
          await writable.close();
      }
  } else {
     // Virtual FS (LocalStorage) - Base64 support
     const normPath = normalizePath(path);
     const base64 = arrayBufferToBase64(content);
     localStorage.setItem(`${FS_PREFIX}${normPath}`, `base64:${base64}`);
  }
};

export const renameEntry = async (oldPath: string, newPath: string): Promise<void> => {
  if (isTauri()) {
    const { rename } = await import('@tauri-apps/plugin-fs');
    await rename(oldPath, newPath);
  } else if (rootDirectoryHandle) {
      const sourceHandle = await getHandleFromPath(oldPath);
      if (sourceHandle && (sourceHandle as any).move) {
          const newName = newPath.split('/').pop() || newPath;
          await (sourceHandle as any).move(newName);
      }
  } else {
    // Virtual FS Rename
    const oldNorm = normalizePath(oldPath);
    const newNorm = normalizePath(newPath);
    const content = localStorage.getItem(`${FS_PREFIX}${oldNorm}`);
    if (content !== null) {
        localStorage.setItem(`${FS_PREFIX}${newNorm}`, content);
        localStorage.removeItem(`${FS_PREFIX}${oldNorm}`);
    }
  }
};

export const deleteEntry = async (path: string, isDir: boolean): Promise<void> => {
  if (isTauri()) {
    const { remove, exists } = await import('@tauri-apps/plugin-fs');
    if (await exists(path)) {
        await remove(path, { recursive: isDir });
    }
  } else if (rootDirectoryHandle) {
      // ... (Native FS delete)
  } else {
    const normPath = normalizePath(path);
    localStorage.removeItem(`${FS_PREFIX}${normPath}`);
    // If dir, remove all children
    if (isDir) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(`${FS_PREFIX}${normPath}/`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }
};

export const searchFiles = async (query: string, rootPath: string): Promise<FileData[]> => {
  if (!query) return [];
  if (isTauri()) {
      // ... (Tauri search)
      return [];
  } else {
    // Virtual FS Search
    const results: FileData[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(FS_PREFIX)) {
            const path = key.slice(FS_PREFIX.length);
            const name = path.split('/').pop() || '';
            if (name.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    id: path,
                    name: name,
                    isDir: false // Simplified
                });
            }
        }
    }
    return results;
  }
};

export const checkExists = async (path: string): Promise<boolean> => {
  if (isTauri()) {
      try {
        const { exists } = await import('@tauri-apps/plugin-fs');
        return await exists(path);
      } catch (e) {
        return false;
      }
  } else {
    const normPath = normalizePath(path);
    // Check exact match (file)
    if (localStorage.getItem(`${FS_PREFIX}${normPath}`) !== null) return true;
    
    // Check if it's a folder (has .keep file)
    if (localStorage.getItem(`${FS_PREFIX}${normPath}/.keep`) !== null) return true;

    // Check for any children (slower fallback)
    const prefix = `${FS_PREFIX}${normPath}/`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) return true;
    }
    
    return false;
  }
};

export const getAppDir = async (): Promise<string> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_app_dir');
    } catch (e) {
      return '';
    }
  }
  return 'root/Cloud Storage';
};

export const ensureUserDirectories = async (): Promise<void> => {
    const appDir = await getAppDir();
    const isDesktop = isTauri();
    const sep = isDesktop && appDir.includes('\\') ? '\\' : '/';

    const resolve = (path: string) => {
        if (!isDesktop) return path;
        let local = path.replace(/\\/g, '/');
        if (local === 'root') return appDir;
        if (local.startsWith('root/Cloud Storage/')) {
            return local.replace('root/Cloud Storage/', `${appDir.replace(/\\/g, '/')}/`).replace(/\//g, sep);
        }
        if (local.startsWith('root/System/')) {
            return local.replace('root/System/', `${appDir.replace(/\\/g, '/')}/System/`).replace(/\//g, sep);
        }
        if (local.startsWith('root/')) {
             return local.replace('root/', `${appDir.replace(/\\/g, '/')}/`).replace(/\//g, sep);
        }
        return path;
    };

    // Phase 4 Structure
    const mindmapRoot = resolve('root/mindmap');
    
    // 1. Ensure new structure exists
    const rootParent = isDesktop ? appDir : 'root';

    if (!(await checkExists(mindmapRoot))) await createFolder(rootParent, 'mindmap');
    if (!(await checkExists(resolve('root/Translations')))) await createFolder(rootParent, 'Translations');

    // 2. Migration Logic
    const migrations = [
        // Phase 3 -> Phase 4
        { src: 'root/System/themes.json', dest: 'root/theme.json', isFile: true },
        { src: 'root/System/mindmap.json', dest: 'root/mindmap/mindmap.json', isFile: true },
        { src: 'root/System/references.json', dest: 'root/references.json', isFile: true },
        { src: 'root/System/plugins.json', dest: 'root/plugins.json', isFile: true },

        // Phase 2 -> Phase 4 (Direct or Legacy)
        { src: 'root/Cloud Storage/themes.json', dest: 'root/theme.json', isFile: true },
        { src: 'root/Cloud Storage/mindmap.json', dest: 'root/mindmap/mindmap.json', isFile: true },
        { src: 'root/Cloud Storage/references.json', dest: 'root/references.json', isFile: true },
        { src: 'root/Cloud Storage/plugins.json', dest: 'root/plugins.json', isFile: true },
        
        // Legacy Folder cleanups
        { src: 'root/Brainstorming', dest: 'root/mindmap' }, 
        { src: 'root/Mindmaps', dest: 'root/mindmap' },
    ];

    for (const m of migrations) {
        const srcPath = resolve(m.src);
        const destPath = resolve(m.dest);
        
        if (await checkExists(srcPath)) {
            // Avoid moving if paths are identical
            if (normalizePath(srcPath) === normalizePath(destPath)) continue;

            console.log(`Migrating ${srcPath} to ${destPath}`);
            
            if (m.isFile) {
                 const content = await readFile(srcPath);
                 if (content) {
                     const fileName = destPath.split(sep).pop() || '';
                     const dir = destPath.substring(0, destPath.lastIndexOf(sep));
                     
                     await createFile(dir, fileName, content);
                     await deleteEntry(srcPath, false);
                 }
            } else {
                const files = await getFiles(srcPath);
                for (const file of files) {
                    if (!file.isDir) {
                        const fileDest = `${destPath}${sep}${file.name}`;
                        await moveFile(file.id, fileDest);
                    }
                }
                await deleteEntry(srcPath, true);
            }
        }
    }

    // 3. Cleanup unwanted folders
    const toRemove = [
        'root/System',
        'root/Cloud Storage/Calendar',
        'root/Cloud Storage/Plugins',
        'root/Calendar',
        'root/Plugins',
        'root/Cloud Storage/User Docs',
        'root/Cloud Storage/User Storage',
        'root/User Docs',
        'root/User Storage'
    ];
    
    for (const path of toRemove) {
        const resolvedPath = resolve(path);
        if (await checkExists(resolvedPath)) {
            try {
                const files = await getFiles(resolvedPath);
                if (files.length === 0 || path.includes('System')) {
                    console.log("Cleaning up old directory:", resolvedPath);
                    await deleteEntry(resolvedPath, true);
                }
            } catch(e) { console.error("Cleanup failed:", e); }
        }
    }
};

export const moveFile = async (sourcePath: string, targetPath: string): Promise<void> => {
  if (isTauri()) {
    const { rename } = await import('@tauri-apps/plugin-fs');
    await rename(sourcePath, targetPath);
  } else if (rootDirectoryHandle) {
      console.warn("Move not fully supported in browser native FS yet");
  } else {
    await renameEntry(sourcePath, targetPath);
  }
};

export const importFile = async (sourcePath: string, targetFolder: string): Promise<void> => {
  if (isTauri()) {
    const { copyFile } = await import('@tauri-apps/plugin-fs');
    const { join, basename } = await import('@tauri-apps/api/path');
    const fileName = await basename(sourcePath);
    const targetPath = await join(targetFolder, fileName);
    await copyFile(sourcePath, targetPath);
  } else {
    // Web import (Virtual) - sourcePath is just a name or mock path
    const name = sourcePath.split(/[\\/]/).pop() || 'Imported File';
    const parentPath = normalizePath(targetFolder);
    const newPath = parentPath === 'root' ? `root/${name}` : `${parentPath}/${name}`;
    // We don't have content here, so just create empty or placeholder
    localStorage.setItem(`${FS_PREFIX}${newPath}`, '');
  }
};

export const uploadFile = async (file: File, targetFolder: string): Promise<void> => {
    if (isTauri()) {
        // Tauri upload usually involves a dialog or drag-drop which gives a path, 
        // but if we have a File object (from input type=file), we need to read it.
        const buffer = await file.arrayBuffer();
        const { join } = await import('@tauri-apps/api/path');
        const fullPath = await join(targetFolder, file.name);
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(fullPath, new Uint8Array(buffer));
    } else {
        const buffer = await file.arrayBuffer();
        await writeBinaryFile(`${targetFolder}/${file.name}`, new Uint8Array(buffer));
    }
};

export const downloadFile = async (path: string): Promise<void> => {
    if (isTauri()) {
        // In Tauri, files are already on disk, so "download" might mean "Save As" to another location
        // or just opening the file location.
        // For now, we'll assume the user wants to copy it to a user-selected location.
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const { copyFile } = await import('@tauri-apps/plugin-fs');
            const { basename } = await import('@tauri-apps/api/path');
            
            const fileName = await basename(path);
            const savePath = await save({
                defaultPath: fileName,
            });
            
            if (savePath) {
                await copyFile(path, savePath);
            }
        } catch (e) {
            console.error("Download failed in Tauri", e);
        }
    } else {
        // Web Mode: Trigger browser download
        const content = await readBinaryFile(path);
        if (!content) return;
        
        const blob = new Blob([content as any], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split(/[\\/]/).pop() || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
