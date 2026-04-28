import FileBrowser from '@/components/FileBrowser';

export default function FilesPage() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <FileBrowser />
          </div>
        </div>
      </div>
    </div>
  );
}
