import path from 'node:path'

export type AioCommandTarget = 'aio' | 'console' | 'cloudmanager'

export interface AioCommandRuntime {
  target: AioCommandTarget
  args: string[]
  isPackaged: boolean
  appPath: string
  electronExecutable: string
  platform: string
  bundledEntryExists: boolean
}

export interface AioCommandInvocation {
  executable: string
  args: string[]
  shell: boolean
  env?: NodeJS.ProcessEnv
}

export function getBundledCliEntryPath(appPath: string, target: AioCommandTarget) {
  if (target === 'console') {
    return path.join(appPath, 'node_modules', '@adobe', 'aio-cli-plugin-console', 'package.json')
  }
  const packageName = target === 'aio' ? 'aio-cli' : 'aio-cli-plugin-cloudmanager'
  return path.join(appPath, 'node_modules', '@adobe', packageName, 'bin', 'run')
}

export function resolveAioCommand(runtime: AioCommandRuntime): AioCommandInvocation {
  if (!runtime.isPackaged || !runtime.bundledEntryExists) {
    const windows = runtime.platform === 'win32'
    return {
      executable: windows ? 'aio.cmd' : 'aio',
      args: runtime.args,
      shell: windows
    }
  }

  return {
    executable: runtime.electronExecutable,
    args: [getBundledCliEntryPath(runtime.appPath, runtime.target === 'cloudmanager' ? 'cloudmanager' : 'aio'), ...runtime.args],
    shell: false,
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}