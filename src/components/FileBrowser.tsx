import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFiles, createFolder, createFile, moveFile, renameEntry, deleteEntry, searchFiles, importFile, getAppDir, checkExists, FileData, uploadFile, downloadFile } from '@/lib/fileSystem';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFileStore } from '@/store/useFileStore';
import { useOfficeDocumentStore } from '@/store/useOfficeDocumentStore';
import { useTheme } from 'next-themes';
import { Search, Lock, Unlock, Import, FilePlus, FolderPlus, ArrowLeft, ArrowRight, Trash2, X, Plus, Edit, AlertTriangle, FolderOpen, Check, AlertCircle, FileText, File as FileIcon, MoreVertical, Upload, ChevronRight, Home, Download } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '@/components/Modal';
import { useAppTranslation } from '@/lib/appTranslations';

interface Tab {
    id: string;
    path: string;
    name: string;
    history: string[];
    historyIndex: number;
}

export default function FileBrowser() {
    const navigate = useNavigate();
    const { text } = useAppTranslation();
    const folderLabel = text('Folder');
    const fileLabel = text('File');
  const [files, setFiles] = useState<FileData[]>([]);
  const { projectPath, setProjectPath } = useSettingsStore();
  const { currentPath, setCurrentPath, refreshTrigger, triggerRefresh } = useFileStore();
    const { ensureDocumentForFile } = useOfficeDocumentStore();
  const { theme } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [lockedFiles, setLockedFiles] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // Action State
  const [pendingActionFiles, setPendingActionFiles] = useState<FileData[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // Tab State
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder' | 'rename' | 'delete' | 'confirm-overwrite'>('folder');
  const [newItemName, setNewItemName] = useState('');
  const [targetFile, setTargetFile] = useState<FileData | null>(null);
  const [pendingOverwriteAction, setPendingOverwriteAction] = useState<(() => Promise<void>) | null>(null);
  
  // Alert State
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file?: FileData } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
        const cloudStorageLabel = text('Cloud Storage');

        const getItemTypeLabel = (type: 'file' | 'folder') => (type === 'file' ? fileLabel : folderLabel);

  // Close context menu on click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Delete key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;
      if (showModal) return;
      if (selectedFiles.size === 0) return;
      const filesToDelete = Array.from(selectedFiles)
        .map(id => files.find(f => f.id === id))
        .filter(Boolean) as FileData[];
      if (filesToDelete.length > 0) {
        setPendingActionFiles(filesToDelete);
        setModalType('delete');
        setShowModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, files, showModal]);

  const handleContextMenu = (e: React.MouseEvent, file?: FileData) => {
      e.preventDefault();
      e.stopPropagation();
      
      // If right-clicking a file that isn't selected, select it exclusively
      if (file && !selectedFiles.has(file.id)) {
          setSelectedFiles(new Set([file.id]));
      }
      
      setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  // Initialize Tabs
  useEffect(() => {
    const init = async () => {
        const appDir = await getAppDir();
        let activePath = projectPath;

        // Validation: Check if current projectPath exists
        if (activePath) {
            if (activePath === 'C:\\Users\\User\\Documents\\CreativePlanner') {
                activePath = '';
            } else {
                const exists = await checkExists(activePath);
                if (!exists) {
                    console.log("Saved path does not exist, reverting to default.");
                    activePath = '';
                }
            }
        }

        // If no valid path, use 'root/Cloud Storage'
        if (!activePath) {
            activePath = 'root/Cloud Storage';
            setProjectPath('root/Cloud Storage');
        }

        if (activePath && tabs.length === 0) {
            const initialTab: Tab = {
                id: 'tab-1',
                path: activePath,
                name: cloudStorageLabel,
                history: [activePath],
                historyIndex: 0
            };
            setTabs([initialTab]);
            setActiveTabId('tab-1');
            // Sync with FileStore if empty
            if (!currentPath) setCurrentPath(activePath);
        }
    };
    
    init();
    }, [projectPath, tabs.length, currentPath, setCurrentPath, setProjectPath, cloudStorageLabel]);

    // Derived State
    const activeTab = tabs.find(t => t.id === activeTabId);
        const currentFolder = activeTab?.path || projectPath || cloudStorageLabel;

  // Sync with FileStore (Sidebar selection)
  useEffect(() => {
      if (currentPath && activeTab && currentPath !== activeTab.path) {
          const newHistory = [...activeTab.history.slice(0, activeTab.historyIndex + 1), currentPath];
          let name = currentPath.split(/[\\/]/).pop() || folderLabel;
          
          // Check if we are at project root to display friendly name
          if (projectPath && normalize(currentPath) === normalize(projectPath)) {
              name = cloudStorageLabel;
          }
          
          updateActiveTab({
              path: currentPath,
              name: name,
              history: newHistory,
              historyIndex: newHistory.length - 1
          });
      }
    }, [currentPath, activeTab, projectPath, cloudStorageLabel]);

  // Helper for path normalization to ensure consistent comparisons
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const isAtRoot = projectPath ? normalize(currentFolder) === normalize(projectPath) : false;

  // Breadcrumbs Logic
  const breadcrumbs = useMemo(() => {
      if (!projectPath || !currentFolder) return [];
      
      const normalizedProject = normalize(projectPath);
      const normalizedCurrent = normalize(currentFolder);
      
      // If at root
      if (normalizedCurrent === normalizedProject) {
          return [{ name: cloudStorageLabel, path: projectPath }];
      }
      
      // If current path is not inside project path (shouldn't happen but safe guard)
      if (!normalizedCurrent.startsWith(normalizedProject)) {
          return [{ name: cloudStorageLabel, path: projectPath }];
      }
      
      const relative = normalizedCurrent.slice(normalizedProject.length);
      const segments = relative.split('/').filter(Boolean);
      
    const crumbs = [{ name: cloudStorageLabel, path: projectPath }];
      let currentBuild = projectPath;
      const separator = projectPath.includes('\\') ? '\\' : '/';

      segments.forEach(segment => {
          // Reconstruct path using original separator if possible, or just /
          // Actually, we should try to match the segment from the original string if we want to be perfect,
          // but appending is usually fine if we stick to one separator.
          // Let's use the separator detected from projectPath.
          
          // Handle potential double separators if projectPath ends with one
          const prefix = currentBuild.endsWith(separator) ? currentBuild : `${currentBuild}${separator}`;
          currentBuild = `${prefix}${segment}`;
          
          crumbs.push({ name: segment, path: currentBuild });
      });
      
      return crumbs;
    }, [currentFolder, projectPath, cloudStorageLabel]);

  const handleBreadcrumbDrop = async (e: React.DragEvent, targetPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTargetId(null);

      // Don't drop if target is current folder
      if (normalize(targetPath) === normalize(currentFolder)) return;

      try {
          const data = e.dataTransfer.getData('application/json');
          if (!data) return;
          
          const sourceFile = JSON.parse(data) as FileData;
          
          // Prevent dropping into itself or same folder
          // (Already checked targetPath !== currentFolder, but check source parent)
          // Actually, if I drag a file from FolderA to Breadcrumb FolderA, it's a no-op.
          
          const separator = targetPath.includes('\\') ? '\\' : '/';
          const newPath = `${targetPath}${separator}${sourceFile.name}`;
          
          if (newPath === sourceFile.id) return;

          await moveFile(sourceFile.id, newPath);
          loadFiles();
          triggerRefresh();
      } catch (error) {
          console.error("Breadcrumb drop failed:", error);
          setAlertMessage(text('Failed to move item via breadcrumb.'));
      }
  };

  const handleDragOverBreadcrumb = (e: React.DragEvent, path: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Don't allow drop on current folder crumb
      if (normalize(path) === normalize(currentFolder)) {
          e.dataTransfer.dropEffect = 'none';
          return;
      }

      setDragTargetId(path);
      e.dataTransfer.dropEffect = 'move';
  };

  // Determine if the parent of the current folder is the root
  const pathSeparator = currentFolder.includes('\\') ? '\\' : '/';
  const pathClean = currentFolder.endsWith(pathSeparator) ? currentFolder.slice(0, -1) : currentFolder;
  const pathLastIndex = pathClean.lastIndexOf(pathSeparator);
  const calculatedParentPath = pathLastIndex !== -1 ? pathClean.substring(0, pathLastIndex) : null;
  const isParentRoot = calculatedParentPath && projectPath ? normalize(calculatedParentPath) === normalize(projectPath) : false;

  const loadFiles = async () => {
    if (currentFolder === 'root' && !projectPath) return;
    
    if (searchTerm) {
        const root = projectPath || 'root';
        const data = await searchFiles(searchTerm, root);
        setFiles(data);
    } else {
        const data = await getFiles(currentFolder);
        
        // Filter out system JSON files
        const filteredData = data.filter(f => {
            const name = f.name.toLowerCase();
            return !['themes.json', 'mindmap.json', 'references.json', 'plugins.json'].includes(name);
        });

        // Sort: Folders first
        filteredData.sort((a, b) => {
            if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
            return a.isDir ? -1 : 1;
        });
        setFiles(filteredData);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [currentFolder, projectPath, searchTerm, refreshTrigger]);

  // Helper to update active tab
  const updateActiveTab = (updates: Partial<Tab>) => {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  // Filter files based on search term and apply lock visual
  const filteredFiles = useMemo(() => {
    return files.map(f => {
        if (lockedFiles.has(f.id)) {
            return { ...f, isLocked: true };
        }
        return f;
    });
  }, [files, lockedFiles]);

  // Unified Action Handlers
  const openDeleteModal = (filesToDelete: FileData[]) => {
      if (!filesToDelete || filesToDelete.length === 0) return;
      setPendingActionFiles(filesToDelete);
      setModalType('delete');
      setShowModal(true);
  };

  const openRenameModal = (fileToRename: FileData) => {
      if (!fileToRename) return;
      
      if (lockedFiles.has(fileToRename.id)) {
                setAlertMessage(`${text('Cannot rename')} "${fileToRename.name}" ${text('because it is locked.')}`);
        return;
      }

      setPendingActionFiles([fileToRename]);
      setTargetFile(fileToRename);
      setNewItemName(fileToRename.name);
      setModalType('rename');
      setShowModal(true);
  };

  const handleLockAction = (filesToProcess: FileData[], lock: boolean) => {
      if (!filesToProcess || filesToProcess.length === 0) return;

      const newLocked = new Set(lockedFiles);
      filesToProcess.forEach(f => {
          if (lock) newLocked.add(f.id);
          else newLocked.delete(f.id);
      });
      setLockedFiles(newLocked);
  };

  // Helper to get current selection as FileData objects
  const getSelectedFileData = (): FileData[] => {
      return Array.from(selectedFiles).map(id => files.find(f => f.id === id)).filter(Boolean) as FileData[];
  };

  // Navigation Handler
  const handleGoBack = () => {
    if (activeTab && activeTab.historyIndex > 0) {
        const newIndex = activeTab.historyIndex - 1;
        const newPath = activeTab.history[newIndex];
        
        if (projectPath && !normalize(newPath).startsWith(normalize(projectPath))) return;

        updateActiveTab({
            path: newPath,
            historyIndex: newIndex,
            name: newPath === projectPath ? cloudStorageLabel : '...' 
        });
        setCurrentPath(newPath);
    }
  };

  const handleGoForward = () => {
    if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
        const newIndex = activeTab.historyIndex + 1;
        const newPath = activeTab.history[newIndex];
        updateActiveTab({
            path: newPath,
            historyIndex: newIndex,
            name: '...' 
        });
        setCurrentPath(newPath);
    }
  };

  // Custom Toolbar Handlers
  const openCreateModal = (type: 'file' | 'folder') => {
    setModalType(type);
    setNewItemName('');
    setShowModal(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
        if (modalType === 'delete') {
            const filesToDelete = pendingActionFiles.length > 0 ? pendingActionFiles : files.filter(f => selectedFiles.has(f.id));
            
            for (const file of filesToDelete) {
                if (lockedFiles.has(file.id)) {
                    setAlertMessage(`${text('Cannot delete')} "${file.name}" ${text('because it is locked.')}`);
                    continue;
                }
                await deleteEntry(file.id, !!file.isDir);
            }
            
            const newSelection = new Set(selectedFiles);
            filesToDelete.forEach(f => newSelection.delete(f.id));
            setSelectedFiles(newSelection);
            setPendingActionFiles([]);
            setShowModal(false);
            loadFiles();
            triggerRefresh();
            
        } else if (modalType === 'confirm-overwrite') {
            if (pendingOverwriteAction) {
                await pendingOverwriteAction();
                setPendingOverwriteAction(null);
            }
            setShowModal(false);
            loadFiles();
            triggerRefresh();

        } else if (modalType === 'rename') {
            const file = pendingActionFiles[0] || targetFile;
            if (file && newItemName) {
                const lastSlashIndex = Math.max(file.id.lastIndexOf('/'), file.id.lastIndexOf('\\'));
                const parentPath = lastSlashIndex > -1 ? file.id.substring(0, lastSlashIndex) : '';
                const separator = lastSlashIndex > -1 ? file.id[lastSlashIndex] : '/';
                
                const newPath = parentPath ? `${parentPath}${separator}${newItemName}` : newItemName;
                
                if (await checkExists(newPath)) {
                    setPendingOverwriteAction(() => async () => {
                        await renameEntry(file.id, newPath);
                        setTargetFile(null);
                        setPendingActionFiles([]);
                    });
                    setModalType('confirm-overwrite');
                    return;
                }

                await renameEntry(file.id, newPath);
                setTargetFile(null);
                setPendingActionFiles([]);
                setShowModal(false);
                loadFiles();
                triggerRefresh();
            }
        } else if (newItemName) {
            if (modalType === 'folder') {
                const separator = projectPath?.includes('\\') ? '\\' : '/';
                const fullPath = `${currentFolder}${separator}${newItemName}`;
                
                if (await checkExists(fullPath)) {
                    setAlertMessage(`${folderLabel} "${newItemName}" ${text('already exists.')}`);
                    return;
                }

                await createFolder(currentFolder, newItemName);
            } else {
                let finalName = newItemName;
                if (!finalName.includes('.')) {
                    finalName += '.txt';
                }
                
                const separator = projectPath?.includes('\\') ? '\\' : '/';
                const fullPath = `${currentFolder}${separator}${finalName}`;

                if (await checkExists(fullPath)) {
                     setPendingOverwriteAction(() => async () => {
                        await createFile(currentFolder, finalName);
                     });
                     setModalType('confirm-overwrite');
                     return;
                }

                await createFile(currentFolder, finalName);
            }
            setShowModal(false);
            loadFiles();
            triggerRefresh();
        }
    } catch (error) {
        console.error("Operation failed:", error);
        setAlertMessage(`${text('Operation failed:')} ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Tab Management
  const closeTab = (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      if (tabs.length === 1) return; 
      
      const newTabs = tabs.filter(t => t.id !== tabId);
      setTabs(newTabs);
      
      if (activeTabId === tabId) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
      }
  };

  const addNewTab = () => {
      const newId = `tab-${Date.now()}`;
      const newTab: Tab = {
          id: newId,
          path: projectPath || 'root',
          name: cloudStorageLabel,
          history: [projectPath || 'root'],
          historyIndex: 0
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newId);
  };

  // File Interaction
  const handleFileClick = (e: React.MouseEvent, file: FileData) => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
          const newSelection = new Set(selectedFiles);
          if (newSelection.has(file.id)) {
              newSelection.delete(file.id);
          } else {
              newSelection.add(file.id);
          }
          setSelectedFiles(newSelection);
      } else {
          setSelectedFiles(new Set([file.id]));
      }
  };

    const handleFileDoubleClick = async (file: FileData) => {
      if (file.isDir) {
          if (activeTab) {
            const newHistory = activeTab.history.slice(0, activeTab.historyIndex + 1);
            newHistory.push(file.id);
            updateActiveTab({
                path: file.id,
                name: file.name,
                history: newHistory,
                historyIndex: newHistory.length - 1
            });
            setSearchTerm('');
            setCurrentPath(file.id);
        }
      } else {
                    const documentId = await ensureDocumentForFile(file.id);
                    if (documentId) {
                        navigate(`/office/editor?id=${documentId}`);
                        return;
                    }

                    console.log("Opening file:", file.name);
      }
  };

  const handleBackgroundClick = () => {
      setSelectedFiles(new Set());
  };

  const handleImportClick = () => {
      if (fileInputRef.current) {
          fileInputRef.current.click();
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
          try {
              for (let i = 0; i < files.length; i++) {
                  await uploadFile(files[i], currentFolder);
              }
              loadFiles();
              triggerRefresh();
          } catch (error) {
              console.error("Import failed:", error);
              setAlertMessage(text('Failed to import file(s).'));
          }
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, file: FileData) => {
      e.dataTransfer.setData('application/json', JSON.stringify(file));
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetFile: FileData) => {
      e.preventDefault();
      e.stopPropagation();
      if (targetFile.isDir) {
          setDragTargetId(targetFile.id);
          e.dataTransfer.dropEffect = 'move';
      } else {
          setDragTargetId(null);
          e.dataTransfer.dropEffect = 'none';
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFile: FileData) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTargetId(null);

      if (!targetFile.isDir) return;

      try {
          const data = e.dataTransfer.getData('application/json');
          if (!data) return;
          
          const sourceFile = JSON.parse(data) as FileData;
          
          // Prevent dropping into itself or same folder (simplified check)
          if (sourceFile.id === targetFile.id) return;
          
          // Construct new path
          // Assuming IDs are full paths
          const separator = targetFile.id.includes('\\') ? '\\' : '/';
          const newPath = `${targetFile.id}${separator}${sourceFile.name}`;
          
          await moveFile(sourceFile.id, newPath);
          loadFiles();
          triggerRefresh();
      } catch (error) {
          console.error("Drop failed:", error);
          setAlertMessage(text('Failed to move item.'));
      }
  };

  const handleDragOverParent = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Calculate parent path to check if it is root
      const separator = currentFolder.includes('\\') ? '\\' : '/';
      const cleanPath = currentFolder.endsWith(separator) ? currentFolder.slice(0, -1) : currentFolder;
      const lastIndex = cleanPath.lastIndexOf(separator);
      
      if (lastIndex !== -1) {
          const parentPath = cleanPath.substring(0, lastIndex);
          // If parent is root, prevent drop
          if (projectPath && normalize(parentPath) === normalize(projectPath)) {
               e.dataTransfer.dropEffect = 'none';
               setDragTargetId(null);
               return;
          }
      }

      setDragTargetId('parent');
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDropToParent = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTargetId(null);

      try {
          const data = e.dataTransfer.getData('application/json');
          if (!data) return;
          
          const sourceFile = JSON.parse(data) as FileData;
          
          // Calculate parent path
          const separator = currentFolder.includes('\\') ? '\\' : '/';
          const cleanPath = currentFolder.endsWith(separator) ? currentFolder.slice(0, -1) : currentFolder;
          const lastIndex = cleanPath.lastIndexOf(separator);
          
          if (lastIndex === -1) return;
          
          const parentPath = cleanPath.substring(0, lastIndex);
          
          // Security check: don't go above project path
          if (projectPath && !parentPath.startsWith(projectPath)) return;

          // Prevent dropping to root
          if (projectPath && normalize(parentPath) === normalize(projectPath)) return;

          const newPath = `${parentPath}${separator}${sourceFile.name}`;
          
          if (newPath === sourceFile.id) return;

          await moveFile(sourceFile.id, newPath);
          loadFiles();
          triggerRefresh();
      } catch (error) {
          console.error("Drop to parent failed:", error);
          setAlertMessage(text('Failed to move item to parent folder.'));
      }
  };

  const handleGoUp = () => {
      const separator = currentFolder.includes('\\') ? '\\' : '/';
      const cleanPath = currentFolder.endsWith(separator) ? currentFolder.slice(0, -1) : currentFolder;
      const lastIndex = cleanPath.lastIndexOf(separator);
      
      if (lastIndex !== -1) {
          const parentPath = cleanPath.substring(0, lastIndex);
          if (projectPath && !normalize(parentPath).startsWith(normalize(projectPath))) return;
          
          setCurrentPath(parentPath);
      }
  };

  return (
    <div 
        className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 relative"
        onClick={handleBackgroundClick}
        onContextMenu={(e) => handleContextMenu(e)}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange} 
        multiple 
      />
      {/* Tab Bar */}
      <div className="flex items-center bg-gray-200 dark:bg-gray-800 pt-2 px-2 gap-1 overflow-x-auto">
          {tabs.map(tab => (
              <div 
                key={tab.id}
                onClick={(e) => { e.stopPropagation(); setActiveTabId(tab.id); }}
                title={tab.path}
                className={`
                    group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium cursor-pointer select-none min-w-[120px] max-w-[200px]
                    ${activeTabId === tab.id 
                        ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                        : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}
                `}
              >
                  <span className="truncate flex-1">{tab.name}</span>
                  {tabs.length > 1 && (
                      <button 
                        onClick={(e) => closeTab(e, tab.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full text-gray-500 hover:text-red-500 transition-all"
                      >
                          <X size={14} />
                      </button>
                  )}
              </div>
          ))}
          <button 
            onClick={(e) => { e.stopPropagation(); addNewTab(); }}
            className="p-2 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                        title={text('New Tab')}
          >
              <Plus size={18} />
          </button>
      </div>

      {/* Custom Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4 shadow-sm z-10" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center gap-2 flex-1">
            {/* Navigation Buttons */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button 
                    onClick={handleGoBack} 
                    disabled={!activeTab || activeTab.historyIndex <= 0 || isAtRoot}
                    className={`p-1.5 rounded-md transition-colors ${
                        !activeTab || activeTab.historyIndex <= 0 || isAtRoot
                        ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                        : 'hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 shadow-sm'
                    }`} 
                    title={text('Go Back')}
                >
                    <ArrowLeft size={18} />
                </button>
                <button 
                    onClick={handleGoForward} 
                    disabled={!activeTab || activeTab.historyIndex >= activeTab.history.length - 1}
                    className={`p-1.5 rounded-md transition-colors ${
                        !activeTab || activeTab.historyIndex >= activeTab.history.length - 1
                        ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                        : 'hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 shadow-sm'
                    }`} 
                    title={text('Go Forward')}
                >
                    <ArrowRight size={18} />
                </button>
            </div>

            {/* Search Bar */}
            <div className={`relative transition-all duration-300 ease-in-out ${isSearchOpen ? 'w-64' : 'w-10'}`}>
                {!isSearchOpen ? (
                    <button 
                        onClick={() => setIsSearchOpen(true)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300"
                        title={text('Search')}
                    >
                        <Search size={20} />
                    </button>
                ) : (
                    <div className="relative h-full flex items-center">
                        <Search className="absolute left-3 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder={text('Search...')} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                            onBlur={() => !searchTerm && setIsSearchOpen(false)}
                            className="w-full pl-9 pr-8 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                        />
                        <button 
                            onClick={() => { setSearchTerm(''); setIsSearchOpen(false); }}
                            className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-lg flex-1 mx-2 scrollbar-hide border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                {breadcrumbs.map((crumb, index) => (
                    <div key={crumb.path} className="flex items-center shrink-0">
                        {index > 0 && <ChevronRight size={14} className="text-gray-400 mx-1" />}
                        <div 
                            className={clsx(
                                "flex items-center gap-1 px-2 py-0.5 rounded-md text-sm cursor-pointer transition-colors select-none",
                                dragTargetId === crumb.path 
                                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 ring-2 ring-blue-500/50" 
                                    : "hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300",
                                index === breadcrumbs.length - 1 && "font-semibold text-gray-900 dark:text-white"
                            )}
                            onClick={() => {
                                if (crumb.path !== currentFolder) {
                                    setCurrentPath(crumb.path);
                                    // Update history logic if needed, but setCurrentPath triggers the effect
                                }
                            }}
                            onDragOver={(e) => handleDragOverBreadcrumb(e, crumb.path)}
                            onDrop={(e) => handleBreadcrumbDrop(e, crumb.path)}
                            onDragLeave={handleDragLeave}
                        >
                            {index === 0 ? <Home size={14} /> : null}
                            <span>{crumb.name}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Action Buttons */}
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
            
            <button onClick={() => openCreateModal('folder')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300" title={text('New Folder')}>
                <FolderPlus size={20} />
            </button>
            <button onClick={() => openCreateModal('file')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300" title={text('New File')}>
                <FilePlus size={20} />
            </button>
            
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
            <button onClick={handleImportClick} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300" title={text('Import Files')}>
                <Upload size={20} />
            </button>
            
            {/* Selection Actions */}
            {selectedFiles.size > 0 && (
                <>
                    <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
                    
                    {selectedFiles.size === 1 && (
                        <button 
                            onClick={() => {
                                const selected = getSelectedFileData();
                                if (selected.length === 1) openRenameModal(selected[0]);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300" 
                            title={text('Rename Selected')}
                        >
                            <Edit size={20} />
                        </button>
                    )}

                    <button 
                        onClick={() => {
                            const selected = getSelectedFileData();
                            const allLocked = selected.every(f => lockedFiles.has(f.id));
                            handleLockAction(selected, !allLocked);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                            Array.from(selectedFiles).every(id => lockedFiles.has(id))
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                        title={Array.from(selectedFiles).every(id => lockedFiles.has(id)) ? text('Unlock Selected') : text('Lock Selected')}
                    >
                        {Array.from(selectedFiles).every(id => lockedFiles.has(id)) ? <Lock size={20} /> : <Unlock size={20} />}
                    </button>
                    <button 
                        onClick={() => openDeleteModal(getSelectedFileData())}
                        className="p-2 hover:bg-red-50 text-red-500 hover:text-red-600 dark:hover:bg-red-900/20 rounded-lg transition-colors" 
                        title={text('Delete Selected')}
                    >
                        <Trash2 size={20} />
                    </button>
                </>
            )}
        </div>
      </div>

      {/* File Grid View */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFiles.length === 0 && isAtRoot ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <FolderOpen size={48} className="mb-4 opacity-50" />
                <p>{text('This folder is empty')}</p>
            </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {filteredFiles.map((file) => {
                    const isSelected = selectedFiles.has(file.id);
                    const isLocked = lockedFiles.has(file.id);
                    
                    return (
                        <div
                            key={file.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, file)}
                            onDragOver={(e) => handleDragOver(e, file)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, file)}
                            onClick={(e) => handleFileClick(e, file)}
                            onDoubleClick={() => handleFileDoubleClick(file)}
                            onContextMenu={(e) => handleContextMenu(e, file)}
                            className={clsx(
                                "group relative flex flex-col items-center p-4 rounded-xl transition-all duration-200 border cursor-pointer select-none",
                                isSelected 
                                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm" 
                                    : "bg-white dark:bg-gray-800 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:border-gray-200 dark:hover:border-gray-700",
                                dragTargetId === file.id && "ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900/40"
                            )}
                        >
                            <div className="mb-3 relative">
                                {file.isDir ? (
                                    <FolderOpen size={48} className="text-yellow-400 drop-shadow-sm" />
                                ) : (
                                    <FileText size={48} className="text-gray-400 dark:text-gray-500 drop-shadow-sm" />
                                )}
                                {isLocked && (
                                    <div className="absolute -top-1 -right-1 bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 rounded-full p-1 shadow-sm">
                                        <Lock size={12} />
                                    </div>
                                )}
                            </div>
                            <span className="text-sm text-center font-medium text-gray-700 dark:text-gray-300 truncate w-full px-2">
                                {file.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
        >
            {contextMenu.file ? (
                <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1">
                        {contextMenu.file.name}
                    </div>
                    <button 
                        onClick={() => { 
                            if (contextMenu.file) openRenameModal(contextMenu.file);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                        <Edit size={16} /> {text('Rename')}
                    </button>
                    {!contextMenu.file.isDir && (
                        <button 
                            onClick={() => { 
                                if (contextMenu.file) downloadFile(contextMenu.file.id);
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                        >
                            <Download size={16} /> {text('Download')}
                        </button>
                    )}
                    <button 
                        onClick={() => {
                            if (contextMenu.file) {
                                const isLocked = lockedFiles.has(contextMenu.file.id);
                                handleLockAction([contextMenu.file], !isLocked);
                            }
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                        {contextMenu.file && lockedFiles.has(contextMenu.file.id)
                            ? <><Unlock size={16} /> {text('Unlock')}</> 
                            : <><Lock size={16} /> {text('Lock')}</>
                        }
                    </button>
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                    <button 
                        onClick={() => { 
                            if (contextMenu.file) openDeleteModal([contextMenu.file]); 
                            setContextMenu(null); 
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
                    >
                        <Trash2 size={16} /> {text('Delete')}
                    </button>
                </>
            ) : (
                <>
                    <button 
                        onClick={() => { openCreateModal('folder'); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                        <FolderPlus size={16} /> {text('New Folder')}
                    </button>
                    <button 
                        onClick={() => { openCreateModal('file'); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                        <FilePlus size={16} /> {text('New File')}
                    </button>
                </>
            )}
        </div>
      )}

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalType === 'delete' ? text('Delete Items') : modalType === 'rename' ? text('Rename Item') : modalType === 'confirm-overwrite' ? text('Confirm Overwrite') : `${text('Create New')} ${getItemTypeLabel(modalType)}`}
                type={modalType === 'delete' ? 'danger' : modalType === 'confirm-overwrite' ? 'warning' : 'default'}
                icon={modalType === 'delete' ? <Trash2 className="text-red-500" size={24} /> : modalType === 'confirm-overwrite' ? <AlertCircle className="text-amber-500" size={24} /> : modalType === 'rename' ? <Edit className="text-blue-500" size={24} /> : <Plus className="text-green-500" size={24} />}
                widthClassName="w-[28rem]"
                footer={
                    <>
                        <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            {text('Cancel')}
                        </button>
                        <button form="file-browser-modal-form" type="submit" className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${modalType === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30' : modalType === 'confirm-overwrite' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'}`}>
                            {modalType === 'delete' && <Trash2 size={16} />}
                            {(modalType === 'confirm-overwrite' || modalType === 'file' || modalType === 'folder' || modalType === 'rename') && <Check size={16} />}
                            {modalType === 'delete' ? text('Delete') : modalType === 'rename' ? text('Rename') : modalType === 'confirm-overwrite' ? text('Overwrite') : text('Create')}
                        </button>
                    </>
                }
            >
                <form id="file-browser-modal-form" onSubmit={handleModalSubmit}>
                    {modalType === 'delete' ? (
                        <div className="text-gray-600 dark:text-gray-300">
                            <p className="text-lg">{text('Are you sure you want to delete')} <span className="font-bold text-gray-900 dark:text-white">{pendingActionFiles.length > 0 ? pendingActionFiles.length : selectedFiles.size}</span> {text('item(s)?')}</p>
                            <p className="text-sm text-red-500 mt-3 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                                <AlertTriangle size={16} />
                                {text('This action cannot be undone.')}
                            </p>
                        </div>
                    ) : modalType === 'confirm-overwrite' ? (
                        <div className="text-gray-600 dark:text-gray-300">
                            <p className="text-lg">{text('An item with this name already exists.')}</p>
                            <p className="mt-2">{text('Do you want to replace it?')}</p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{text('Name')}</label>
                            <input
                                type="text"
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                placeholder={modalType === 'rename' ? text('Enter new name...') : `${text('Enter')} ${getItemTypeLabel(modalType).toLowerCase()} ${text('name...')}`}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white placeholder-gray-400 transition-all"
                                autoFocus
                            />
                        </div>
                    )}
                </form>
            </Modal>

            <Modal
                isOpen={!!alertMessage}
                onClose={() => setAlertMessage(null)}
                title={text('Action Denied')}
                type="warning"
                icon={<AlertTriangle className="text-amber-500" size={24} />}
                widthClassName="w-[28rem]"
                footer={
                    <button onClick={() => setAlertMessage(null)} className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 rounded-lg transition-colors">
                        {text('Dismiss')}
                    </button>
                }
            >
                <p className="text-gray-600 dark:text-gray-300">{alertMessage}</p>
            </Modal>
    </div>
  );
}
