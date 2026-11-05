import assert from 'node:assert/strict'
import test from 'node:test'
import { getBundledCliEntryPath, resolveAioCommand } from './aio-cli-invocation'

test('packaged Cloud Manager and Console commands resolve to their bundled entry points', () => {
  const cloudManager = resolveAioCommand({
    target: 'cloudmanager',
    args: ['cloudmanager:org:list', '--json'],
    isPackaged: true,
    appPath: 'C:\\Program Files\\Cloud Manager Studio\\resources\\app.asar',
    electronExecutable: 'C:\\Program Files\\Cloud Manager Studio\\Cloud Manager Studio.exe',
    platform: 'win32',
    bundledEntryExists: true
  })
  const console = resolveAioCommand({
    target: 'console',
    args: ['console', 'org', 'list', '--json'],
    isPackaged: true,
    appPath: 'C:\\Program Files\\Cloud Manager Studio\\resources\\app.asar',
    electronExecutable: 'C:\\Program Files\\Cloud Manager Studio\\Cloud Manager Studio.exe',
    platform: 'win32',
    bundledEntryExists: true
  })

  assert.equal(cloudManager.executable, 'C:\\Program Files\\Cloud Manager Studio\\Cloud Manager Studio.exe')
  assert.equal(cloudManager.args[0], getBundledCliEntryPath('C:\\Program Files\\Cloud Manager Studio\\resources\\app.asar', 'cloudmanager'))
  assert.deepEqual(cloudManager.args.slice(1), ['cloudmanager:org:list', '--json'])
  assert.equal(cloudManager.shell, false)
  assert.equal(cloudManager.env?.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(console.args[0], getBundledCliEntryPath('C:\\Program Files\\Cloud Manager Studio\\resources\\app.asar', 'aio'))
  assert.deepEqual(console.args.slice(1), ['console', 'org', 'list', '--json'])
})

test('development and missing bundled entries keep the installed AIO CLI fallback', () => {
  const development = resolveAioCommand({
    target: 'cloudmanager',
    args: ['cloudmanager:org:list'],
    isPackaged: false,
    appPath: 'source',
    electronExecutable: 'electron.exe',
    platform: 'win32',
    bundledEntryExists: true
  })
  const repairFallback = resolveAioCommand({
    target: 'aio',
    args: ['console', 'org', 'list'],
    isPackaged: true,
    appPath: 'app.asar',
    electronExecutable: 'app.exe',
    platform: 'win32',
    bundledEntryExists: false
  })

  assert.equal(development.executable, 'aio.cmd')
  assert.equal(development.shell, true)
  assert.equal(repairFallback.executable, 'aio.cmd')
  assert.equal(repairFallback.shell, true)
  assert.deepEqual(repairFallback.args, ['console', 'org', 'list'])

  const missingConsolePlugin = resolveAioCommand({
    target: 'console',
    args: ['console', 'org', 'list'],
    isPackaged: true,
    appPath: 'app.asar',
    electronExecutable: 'app.exe',
    platform: 'win32',
    bundledEntryExists: false
  })

  assert.equal(missingConsolePlugin.executable, 'aio.cmd')
  assert.equal(missingConsolePlugin.shell, true)
})