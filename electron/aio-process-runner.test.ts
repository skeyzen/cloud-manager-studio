import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { AioProcessRunner } from './aio-process-runner'

class KillWithoutCloseChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = { end: (_value?: string) => undefined }
  killed = false

  kill() {
    this.killed = true
    return true
  }
}

test('cancelling a tail settles the request even if the child never emits close', async () => {
  const child = new KillWithoutCloseChild()
  const runner = new AioProcessRunner({
    executable: 'aio.cmd',
    shell: true,
    spawnProcess: (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import('node:child_process').spawn
  })
  const command = runner.run({ requestId: 'tail-1', args: ['cloudmanager:environment:tail-log'], cwd: '.', timeoutMs: null, streamOutput: true })

  assert.equal(runner.cancel('tail-1'), true)
  const timeout = new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('runner cancellation did not settle')), 100))
  const result = await Promise.race([command, timeout])

  assert.equal(result.cancelled, true)
  assert.equal(result.ok, false)
  assert.equal(child.killed, true)
  assert.equal(runner.isActive('tail-1'), false)
  assert.equal(runner.cancel('tail-1'), false)
})

test('a request can run a bundled Node CLI without a shell', async () => {
  const child = new KillWithoutCloseChild()
  let executable = ''
  let shell: boolean | string | undefined
  let runAsNode: string | undefined
  const runner = new AioProcessRunner({
    executable: 'aio.cmd',
    shell: true,
    spawnProcess: ((commandPath: string, _args: string[], options: import('node:child_process').SpawnOptions) => {
      executable = commandPath
      shell = options.shell
      runAsNode = options.env?.ELECTRON_RUN_AS_NODE
      return child as unknown as ChildProcessWithoutNullStreams
    }) as unknown as typeof import('node:child_process').spawn
  })

  const command = runner.run({
    requestId: 'bundled-cli-1',
    executable: 'CloudManagerStudio.exe',
    shell: false,
    env: { ELECTRON_RUN_AS_NODE: '1' },
    args: ['cli.js', '--version'],
    cwd: '.',
    timeoutMs: null
  })
  child.emit('close', 0)
  const result = await command

  assert.equal(executable, 'CloudManagerStudio.exe')
  assert.equal(shell, false)
  assert.equal(runAsNode, '1')
  assert.equal(result.ok, true)
})