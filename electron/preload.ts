import { contextBridge, ipcRenderer } from 'electron'
import type { CommandId, CommandParams } from '../shared/command-catalog'
import type { AioCommandOutput } from '../src/types'

contextBridge.exposeInMainWorld('aio', {
  getWelcomeInfo: () => ipcRenderer.invoke('app:welcome-info'),
  getStatus: () => ipcRenderer.invoke('aio:status'),
  getDeveloperConsoleStatus: () => ipcRenderer.invoke('aio:developer-console-status'),
  openPowerShellSetup: (actionId: import('../shared/setup-actions').SetupActionId) => ipcRenderer.invoke('setup:open-powershell', actionId),
  getConsoleProjects: (organizationId: string) => ipcRenderer.invoke('aio:developer-console-projects', organizationId),
  getConsoleWorkspaces: (organizationId: string, projectId: string) => ipcRenderer.invoke('aio:developer-console-workspaces', { organizationId, projectId }),
  login: () => ipcRenderer.invoke('aio:login'),
  logout: () => ipcRenderer.invoke('aio:logout'),
  selectOrganization: (organizationId: string) => ipcRenderer.invoke('aio:select-organization', organizationId),
  getConfig: () => ipcRenderer.invoke('aio:config'),
  setContext: (params: { organizationId: string; programId: string; environmentId: string }) => ipcRenderer.invoke('aio:set-context', params),
  getLogs: () => ipcRenderer.invoke('app:logs'),
  setNativeIcon: (pngDataUrl: string) => ipcRenderer.send('app:set-native-icon', pngDataUrl),
  onLog: (listener: (entry: { id: number; timestamp: string; level: 'info' | 'warn' | 'error'; message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: { id: number; timestamp: string; level: 'info' | 'warn' | 'error'; message: string }) => listener(entry)
    ipcRenderer.on('app:log', handler)
    return () => ipcRenderer.removeListener('app:log', handler)
  },
  runCommand: (id: CommandId, params: CommandParams, requestId: string, stdinInput?: string) => ipcRenderer.invoke('aio:command', { id, params, requestId, stdinInput }),
  cancelCommand: (requestId: string) => ipcRenderer.invoke('aio:cancel-command', requestId),
  onCommandOutput: (listener: (output: AioCommandOutput) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, output: AioCommandOutput) => listener(output)
    ipcRenderer.on('aio:command-output', handler)
    return () => ipcRenderer.removeListener('aio:command-output', handler)
  }
})
