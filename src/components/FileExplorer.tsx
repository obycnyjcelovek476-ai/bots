import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, FolderTree, Terminal } from 'lucide-react';
import { BotFileEntry } from '../utils/botFiles';
import { EnvConfig, generateBashInstaller } from '../utils/simulatorLogic';

interface FileExplorerProps {
  files: BotFileEntry[];
  envConfig: EnvConfig;
  onUpdateFile: (path: string, newContent: string) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  envConfig,
  onUpdateFile,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>('main.py');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const filteredFiles = files.filter(
    (f) =>
      f.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
      f.description.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleCopyContent = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedPath(label);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleDownloadSingleFile = (file: BotFileEntry) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.replace('/', '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadInstaller = () => {
    const script = generateBashInstaller(files, envConfig);
    const blob = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assemble_exenta_bot.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickStructureCmd = `mkdir -p exenta_bot/handlers exenta_bot/services
cd exenta_bot
touch handlers/__init__.py services/__init__.py
touch main.py config.py logger.py database.py exenta_client.py utils.py
touch handlers/start.py handlers/payment.py handlers/admin.py
touch services/tracker.py services/webhook_server.py
touch requirements.txt .env.example .gitignore README.md`;

  const copyQuickCmd = () => {
    navigator.clipboard?.writeText(quickStructureCmd).catch(() => {});
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Top command banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Директория /exenta_bot создана в проекте</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{files.length} файлов</span>
            <span aria-hidden="true">·</span>
            <span>Python 3.11+ / aiogram 3.x</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Финальная сборка файлов exenta_bot по папкам
          </h2>
          <p className="text-sm text-slate-600 max-w-3xl">
            Все файлы уже разложены в рабочей папке <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">/exenta_bot</code> с учётом всех финальных патчей (удалён дубликат в <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">database.py</code>, добавлен комментарий <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">CRITICAL</code> в <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">handlers/payment.py</code> и секция возвратов в <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">README.md</code>).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={copyQuickCmd}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            {copiedCommand ? 'Команда mkdir скопирована' : 'Команда mkdir/touch'}
          </button>
          <button
            type="button"
            onClick={handleDownloadInstaller}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Скачать автосборщик (.sh)
          </button>
        </div>
      </div>

      {/* Main 2-column explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: File tree */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FolderTree className="w-4 h-4 text-slate-500" />
                <span>exenta_bot/</span>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {filteredFiles.length} из {files.length}
              </span>
            </div>
            <div>
              <label htmlFor="file-search-input" className="sr-only">
                Поиск по файлам проекта
              </label>
              <input
                id="file-search-input"
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Фильтр по имени или назначению..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {filteredFiles.map((file) => {
              const isSelected = file.path === activeFile.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-4 py-2.5 transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-950'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileCode
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="font-mono text-xs font-medium truncate">
                        {file.path}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      {file.sourceNote}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {file.content.length === 0
                      ? '0 строк'
                      : `${file.content.split('\n').length} стр.`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: Code viewer & editor */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/60">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-slate-900 font-semibold">
                  exenta_bot/{activeFile.path}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeFile.sourceNote}</span>
              </div>
              <p className="text-xs text-slate-600">{activeFile.description}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopyContent(activeFile.content, activeFile.path)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedPath === activeFile.path ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копировать код</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleFile(activeFile)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать файл</span>
              </button>
            </div>
          </div>

          <div className="p-0 bg-slate-950 text-slate-100">
            {activeFile.content.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                Пустой файл пакета Python ({activeFile.path}) — необходим для корректных импортов модулей.
              </div>
            ) : (
              <div>
                <label htmlFor="code-editor-textarea" className="sr-only">
                  Код файла {activeFile.path}
                </label>
                <textarea
                  id="code-editor-textarea"
                  value={activeFile.content}
                  onChange={(e) => onUpdateFile(activeFile.path, e.target.value)}
                  spellCheck={false}
                  className="w-full h-[500px] p-4 font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 focus:outline-none resize-y"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
