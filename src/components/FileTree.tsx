import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Cloud, Plus, Edit, Trash2, Lock, Unlock, FolderPlus, FilePlus, X, AlertTriangle, Check, AlertCircle } from 'lucide-react';
import { getFiles, FileData, moveFile, getAppDir, renameEntry, deleteEntry, createFolder, createFile, checkExists } from '@/lib/fileSystem';
import { useFileStore } from '@/store/useFileStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Modal } from '@/components/Modal';
import { useAppTranslation } from '@/lib/appTranslations';

interface FileTreeNodeProps {
    path: string;
    name: string;
    level: number;
    onSelect: (path: string, name: string, isDir: boolean) => void;
    defaultOpen?: boolean;
    title?: string;
    onContextMenu: (e: React.MouseEvent, file: FileData) => void;
    lockedFiles: Set<string>;
}

const FileTreeNode = ({ path, name, level, onSelect, defaultOpen = false, title, onContextMenu, lockedFiles }: FileTreeNodeProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [children, setChildren] = useState<FileData[]>([]);
    const [loading, setLoading] = useState(false);
    const { currentPath, refreshTrigger, triggerRefresh } = useFileStore();
    const [isDragOver, setIsDragOver] = useState(false);
    const { text } = useAppTranslation();

    const loadChildren = async () => {
        setLoading(true);
        const files = await getFiles(path);
        
        // Filter out system JSON files
        const filteredFiles = files.filter(f => {
            const name = f.name.toLowerCase();
            return !['theme.json', 'themes.json', 'mindmap.json', 'references.json', 'plugins.json', 'storyboard.json'].includes(name);
        });

        // Sort: Folders first, then files
        filteredFiles.sort((a, b) => {
            if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
            return a.isDir ? -1 : 1;
        });
        setChildren(filteredFiles);
        setLoading(false);
    };

    useEffect(() => {
        let isMounted = true;
        
        const load = async () => {
            if (!isOpen) return;
            
            const files = await getFiles(path);
            
            // Filter out system JSON files
            const filteredFiles = files.filter(f => {
                const name = f.name.toLowerCase();
                return !['theme.json', 'themes.json', 'mindmap.json', 'references.json', 'plugins.json', 'storyboard.json'].includes(name);
            });

            // Sort: Folders first, then files
            filteredFiles.sort((a, b) => {
                if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
                return a.isDir ? -1 : 1;
            });
            
            if (isMounted) {
                setChildren(prev => {
                    const prevString = JSON.stringify(prev);
                    const newString = JSON.stringify(filteredFiles);
                    return prevString === newString ? prev : filteredFiles;
                });
                setLoading(false);
            }
        };

        load();

        // Poll for changes every 5 seconds if open
        const interval = setInterval(load, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isOpen, refreshTrigger, path]);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
        if (!isOpen) onSelect(path, name, true);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(path, name, true);
    };

    const handleNodeContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, { id: path, name, isDir: true });
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (sourcePath && sourcePath !== path) {
            const fileName = sourcePath.split(/[\\/]/).pop();
            const separator = path.includes('\\') ? '\\' : '/';
            const targetPath = `${path}${separator}${fileName}`;
            
            try {
                await moveFile(sourcePath, targetPath);
                triggerRefresh();
                if (isOpen) loadChildren();
            } catch (error) {
                console.error("Move failed", error);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', path);
        e.stopPropagation();
    };

    const isSelected = currentPath === path;
    const isLocked = lockedFiles.has(path);

    return (
        <div className="select-none" title={title}>
            <div 
                className={clsx(
                    "flex items-center gap-1 py-1 px-2 cursor-pointer transition-colors rounded-md mx-2 relative group",
                    isSelected ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
                    isDragOver && "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={handleClick}
                onContextMenu={handleNodeContextMenu}
                draggable
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <button 
                    onClick={handleToggle}
                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {path === 'root/Cloud Storage' ? (
                    <Cloud size={16} className="text-blue-500" />
                ) : isOpen ? (
                    <FolderOpen size={16} className="text-yellow-500" />
                ) : (
                    <Folder size={16} className="text-yellow-500" />
                )}
                
                <span className="text-sm truncate flex-1">{name}</span>
                
                {isLocked && (
                    <Lock size={12} className="text-amber-500 ml-1" />
                )}
            </div>

            {isOpen && (
                <div>
                    {children.map(child => (
                        child.isDir ? (
                            <FileTreeNode 
                                key={child.id} 
                                path={child.id} 
                                name={child.name} 
                                level={level + 1} 
                                onSelect={onSelect}
                                onContextMenu={onContextMenu}
                                lockedFiles={lockedFiles}
                            />
                        ) : (
                            <div 
                                key={child.id}
                                className="flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md mx-2 relative group"
                                style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', child.id);
                                    e.stopPropagation();
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onContextMenu(e, child);
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(child.id, child.name, !!child.isDir);
                                }}
                            >
                                <FileText size={14} />
                                <span className="text-sm truncate flex-1">{child.name}</span>
                                {lockedFiles.has(child.id) && (
                                    <Lock size={12} className="text-amber-500" />
                                )}
                            </div>
                        )
                    ))}
                    {children.length === 0 && !loading && (
                        <div className="text-xs text-gray-400 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}>
                            {text('This folder is empty')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function FileTree() {
    const { projectPath, setProjectPath, cloudPath, setCloudPath } = useSettingsStore();
    const { setCurrentPath, triggerRefresh } = useFileStore();
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState<FileData | null>(null);

    // Context Menu & Modal State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file?: FileData } | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState<'file' | 'folder' | 'rename' | 'delete' | 'confirm-overwrite'>('folder');
    const [newItemName, setNewItemName] = useState('');
    const [targetFile, setTargetFile] = useState<FileData | null>(null);
    const [lockedFiles, setLockedFiles] = useState<Set<string>>(new Set());
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const { t, text } = useAppTranslation();
    const [pendingOverwriteAction, setPendingOverwriteAction] = useState<(() => Promise<void>) | null>(null);

    useEffect(() => {
        const initPath = async () => {
            const appDir = await getAppDir();
            if (appDir && projectPath !== appDir) {
                console.log("Enforcing Cloud Storage Path:", appDir);
                setProjectPath(appDir);
            }
        };
        initPath();
    }, [projectPath, setProjectPath]);

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
            if (!selectedItem) return;
            openDeleteModal(selectedItem);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItem, showModal]);

    const handleSelect = (path: string, name: string, isDir: boolean) => {
        setCurrentPath(path);
        navigate('/files');
        setSelectedItem({ id: path, name, isDir });
    };

    const handleAddCloud = async () => {
        try {
            // Dynamic import to avoid issues in browser mode
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Cloud Storage Folder (OneDrive/iCloud)'
            });
            
            if (selected && typeof selected === 'string') {
                setCloudPath(selected);
            }
        } catch (e) {
            console.error("Failed to select cloud folder", e);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, file: FileData) => {
        setContextMenu({ x: e.clientX, y: e.clientY, file });
    };

    const handleLockAction = (file: FileData, lock: boolean) => {
        const newLocked = new Set(lockedFiles);
        if (lock) newLocked.add(file.id);
        else newLocked.delete(file.id);
        setLockedFiles(newLocked);
    };

    const openRenameModal = (file: FileData) => {
        if (lockedFiles.has(file.id)) {
            setAlertMessage(`${text('Cannot rename locked item.')} (${file.name})`);
            return;
        }
        setTargetFile(file);
        setNewItemName(file.name);
        setModalType('rename');
        setShowModal(true);
    };

    const openDeleteModal = (file: FileData) => {
        if (lockedFiles.has(file.id)) {
            setAlertMessage(`${text('Cannot delete locked item.')} (${file.name})`);
            return;
        }
        setTargetFile(file);
        setModalType('delete');
        setShowModal(true);
    };

    const openCreateModal = (type: 'file' | 'folder', parentFile?: FileData) => {
        setTargetFile(parentFile || { id: projectPath || '', name: 'root', isDir: true });
        setModalType(type);
        setNewItemName('');
        setShowModal(true);
    };

    const handleModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            if (modalType === 'delete' && targetFile) {
                await deleteEntry(targetFile.id, !!targetFile.isDir);
                setShowModal(false);
                triggerRefresh();
            } else if (modalType === 'confirm-overwrite') {
                if (pendingOverwriteAction) {
                    await pendingOverwriteAction();
                    setPendingOverwriteAction(null);
                }
                setShowModal(false);
                triggerRefresh();
            } else if (modalType === 'rename' && targetFile) {
                const lastSlashIndex = Math.max(targetFile.id.lastIndexOf('/'), targetFile.id.lastIndexOf('\\'));
                const parentPath = lastSlashIndex > -1 ? targetFile.id.substring(0, lastSlashIndex) : '';
                const separator = lastSlashIndex > -1 ? targetFile.id[lastSlashIndex] : '/';
                const newPath = parentPath ? `${parentPath}${separator}${newItemName}` : newItemName;
                
                if (await checkExists(newPath)) {
                    setPendingOverwriteAction(() => async () => {
                        await renameEntry(targetFile.id, newPath);
                    });
                    setModalType('confirm-overwrite');
                    return;
                }

                await renameEntry(targetFile.id, newPath);
                setShowModal(false);
                triggerRefresh();
            } else if (newItemName && targetFile) {
                // Create File/Folder
                const parentPath = targetFile.id;
                const separator = parentPath.includes('\\') ? '\\' : '/';
                
                if (modalType === 'folder') {
                    const fullPath = `${parentPath}${separator}${newItemName}`;
                    if (await checkExists(fullPath)) {
                        setAlertMessage(`${text('Folder already exists.')} (${newItemName})`);
                        return;
                    }
                    await createFolder(parentPath, newItemName);
                } else {
                    let finalName = newItemName;
                    if (!finalName.includes('.')) finalName += '.txt';
                    const fullPath = `${parentPath}${separator}${finalName}`;
                    
                    if (await checkExists(fullPath)) {
                        setPendingOverwriteAction(() => async () => {
                            await createFile(parentPath, finalName);
                        });
                        setModalType('confirm-overwrite');
                        return;
                    }
                    await createFile(parentPath, finalName);
                }
                setShowModal(false);
                triggerRefresh();
            }
        } catch (error) {
            console.error("Operation failed:", error);
            setAlertMessage(`${text('Operation failed.')} ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    if (!projectPath) return null;

    return (
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="px-4 mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('nav.fileExplorer')}
                </span>
                <div className="flex gap-1">
                    <button 
                        onClick={() => openCreateModal('folder', { id: projectPath, name: 'root', isDir: true })}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-blue-500 transition-colors"
                        title={text('New Folder')}
                    >
                        <FolderPlus size={14} />
                    </button>
                    <button 
                        onClick={() => openCreateModal('file', { id: projectPath, name: 'root', isDir: true })}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-blue-500 transition-colors"
                        title={text('New File')}
                    >
                        <FilePlus size={14} />
                    </button>
                </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
                <FileTreeNode 
                    path="root/Cloud Storage" 
                    name={t('nav.cloudStorage')} 
                    level={0} 
                    onSelect={handleSelect}
                    defaultOpen={true}
                    title={t('nav.cloudStorage')}
                    onContextMenu={handleContextMenu}
                    lockedFiles={lockedFiles}
                />
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.file && (
                        <>
                            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1 truncate max-w-[200px]">
                                {contextMenu.file.name}
                            </div>
                            {contextMenu.file.isDir && (
                                <>
                                    <button 
                                        onClick={() => { openCreateModal('folder', contextMenu.file); setContextMenu(null); }}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                                    >
                                        <FolderPlus size={14} /> {text('New Folder')}
                                    </button>
                                    <button 
                                        onClick={() => { openCreateModal('file', contextMenu.file); setContextMenu(null); }}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                                    >
                                        <FilePlus size={14} /> {text('New File')}
                                    </button>
                                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                                </>
                            )}
                            <button 
                                onClick={() => { openRenameModal(contextMenu.file!); setContextMenu(null); }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                            >
                                <Edit size={14} /> {text('Rename')}
                            </button>
                            <button 
                                onClick={() => {
                                    const isLocked = lockedFiles.has(contextMenu.file!.id);
                                    handleLockAction(contextMenu.file!, !isLocked);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                            >
                                {lockedFiles.has(contextMenu.file.id)
                                    ? <><Unlock size={14} /> {text('Unlock')}</> 
                                    : <><Lock size={14} /> {text('Lock')}</>
                                }
                            </button>
                            <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                            <button 
                                onClick={() => { openDeleteModal(contextMenu.file!); setContextMenu(null); }}
                                className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
                            >
                                <Trash2 size={14} /> {text('Delete')}
                            </button>
                        </>
                    )}
                </div>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={modalType === 'delete' ? text('Delete Item') : modalType === 'rename' ? text('Rename Item') : modalType === 'confirm-overwrite' ? text('Confirm') : modalType === 'file' ? text('New File') : text('New Folder')}
                type={modalType === 'delete' ? 'danger' : modalType === 'confirm-overwrite' ? 'warning' : 'default'}
                icon={modalType === 'delete' ? <Trash2 className="text-red-500" size={20} /> : modalType === 'confirm-overwrite' ? <AlertCircle className="text-amber-500" size={20} /> : modalType === 'rename' ? <Edit className="text-blue-500" size={20} /> : <Plus className="text-green-500" size={20} />}
                widthClassName="w-[24rem]"
                footer={
                    <>
                        <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            {text('Cancel')}
                        </button>
                        <button form="file-tree-modal-form" type="submit" className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg shadow-sm flex items-center gap-1 ${modalType === 'delete' ? 'bg-red-600 hover:bg-red-700' : modalType === 'confirm-overwrite' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {modalType === 'delete' ? text('Delete') : text('Confirm')}
                        </button>
                    </>
                }
            >
                <form id="file-tree-modal-form" onSubmit={handleModalSubmit}>
                    {modalType === 'delete' ? (
                        <div className="text-gray-600 dark:text-gray-300 text-sm">
                            <p>{text('Are you sure you want to delete this item?')}</p>
                            <p className="font-bold text-gray-900 dark:text-white mt-2">{targetFile?.name}</p>
                            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                                <AlertTriangle size={12} /> {text('Irreversible action.')}
                            </p>
                        </div>
                    ) : modalType === 'confirm-overwrite' ? (
                        <div className="text-gray-600 dark:text-gray-300 text-sm">
                            <p>{text('Item already exists. Overwrite?')}</p>
                        </div>
                    ) : (
                        <input
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder={modalType === 'rename' ? text('New name...') : text('Name...')}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm text-gray-900 dark:text-white"
                            autoFocus
                        />
                    )}
                </form>
            </Modal>

            <Modal
                isOpen={!!alertMessage}
                onClose={() => setAlertMessage(null)}
                title={text('Action Denied')}
                type="warning"
                icon={<AlertTriangle className="text-amber-500" size={20} />}
                widthClassName="w-[22rem]"
                footer={<button onClick={() => setAlertMessage(null)} className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white">{text('Dismiss')}</button>}
            >
                <p className="text-xs text-gray-600 dark:text-gray-300">{alertMessage}</p>
            </Modal>
        </div>
    );
}