import type { CommandId, CommandParams } from '../shared/command-catalog'
import type { SetupActionId } from '../shared/setup-actions'

export interface AioStatus {
  authenticated: boolean
  setupRequired: boolean
  missingComponents: string[]
  detail: string
  organizations: AioOrganization[]
}

export interface DeveloperConsoleStatus {
  authenticated: boolean
  setupRequired: boolean
  missingComponents: string[]
  detail: string
  organizations: AioOrganization[]
}

export interface ConsoleListResult {
  ok: boolean
  detail: string
  resources: CloudManagerResource[]
}

export interface AppWelcomeInfo {
  languages: string[]
  username: string
}

export interface AioOrganization {
  id: string
  name: string
  code?: string
}

export interface CloudManagerResource {
  id: string
  name: string
  description?: string
  type?: string
  status?: string
}
export type AppLogLevel = 'info' | 'warn' | 'error'

export interface AppLog {
  id: number
  timestamp: string
  level: AppLogLevel
  message: string
}

export interface AioCommandOutput {
  requestId: string
  stream: 'stdout' | 'stderr'
  chunk: string
}

export interface AioConfig {
  organizationId: string
  programId: string
  environmentId: string
  detail: string
}

export interface AioCommandResult {
  ok: boolean
  cancelled?: boolean
  code: number | null
  stdout: string
  stderr: string
  command?: string
}

declare global {
  interface Window {
    aio: {
      getWelcomeInfo: () => Promise<AppWelcomeInfo>
      getStatus: () => Promise<AioStatus>
      getDeveloperConsoleStatus: () => Promise<DeveloperConsoleStatus>
      openPowerShellSetup: (actionId: SetupActionId) => Promise<{ ok: boolean; detail: string }>
      getConsoleProjects: (organizationId: string) => Promise<ConsoleListResult>
      getConsoleWorkspaces: (organizationId: string, projectId: string) => Promise<ConsoleListResult>
      login: () => Promise<{ ok: boolean; detail: string }>
      logout: () => Promise<{ ok: boolean; detail: string }>
      selectOrganization: (organizationId: string) => Promise<{ ok: boolean; detail: string }>
      getConfig: () => Promise<AioConfig>
      setContext: (params: { organizationId: string; programId: string; environmentId: string }) => Promise<{ ok: boolean; detail: string }>
      getLogs: () => Promise<AppLog[]>
      onLog: (listener: (entry: AppLog) => void) => () => void
      setNativeIcon: (pngDataUrl: string) => void
      runCommand: (id: CommandId, params: CommandParams, requestId: string, stdinInput?: string) => Promise<AioCommandResult>
      cancelCommand: (requestId: string) => Promise<boolean>
      onCommandOutput: (listener: (output: AioCommandOutput) => void) => () => void
    }
  }
}

export {}
