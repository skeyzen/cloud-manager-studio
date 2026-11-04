import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface AioProcessResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  cancelled?: boolean
}

export interface AioProcessRequest {
  requestId: string
  args: string[]
  cwd: string
  stdinInput?: string
  timeoutMs?: number | null
  streamOutput?: boolean
}

export interface AioProcessRunnerOptions {
  executable: string
  shell: boolean
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
  onOutput?: (requestId: string, stream: 'stdout' | 'stderr', chunk: string) => void
  spawnProcess?: typeof spawn
  terminateProcess?: (child: ChildProcessWithoutNullStreams) => void
}

interface ActiveProcess {
  child: ChildProcessWithoutNullStreams
  cancel: () => boolean
}

export class AioProcessRunner {
  private readonly active = new Map<string, ActiveProcess>()
  private readonly spawnProcess: typeof spawn

  constructor(private readonly options: AioProcessRunnerOptions) {
    this.spawnProcess = options.spawnProcess ?? spawn
  }

  run(request: AioProcessRequest): Promise<AioProcessResult> {
    const timeoutMs = request.timeoutMs === undefined ? 45_000 : request.timeoutMs
    return new Promise((resolve) => {
      const commandText = `${this.options.executable} ${request.args.join(' ')}`
      this.options.onLog?.('info', `Avvio comando: ${commandText}`)
      const child = this.spawnProcess(this.options.executable, request.args, {
        cwd: request.cwd,
        shell: this.options.shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let timer: NodeJS.Timeout | undefined

      const finish = (result: AioProcessResult) => {
        if (settled) return false
        settled = true
        if (timer) clearTimeout(timer)
        this.active.delete(request.requestId)
        resolve(result)
        return true
      }

      const cancel = (result: AioProcessResult) => {
        if (settled) return false
        try {
          this.options.terminateProcess?.(child)
          child.kill()
        } finally {
          finish(result)
        }
        return true
      }

      this.active.set(request.requestId, {
        child,
        cancel: () => cancel({ ok: false, code: null, stdout, stderr: `${stderr}\nInterrotto dall’utente.`, cancelled: true })
      })
      if (timeoutMs !== null) {
        timer = setTimeout(() => {
          this.options.onLog?.('warn', `Timeout comando dopo ${timeoutMs} ms: ${commandText}`)
          cancel({ ok: false, code: null, stdout, stderr: `${stderr}\nTimeout dopo ${timeoutMs} ms` })
        }, timeoutMs)
      }

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stdout += text
        if (request.streamOutput) this.options.onOutput?.(request.requestId, 'stdout', text)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderr += text
        if (request.streamOutput) this.options.onOutput?.(request.requestId, 'stderr', text)
      })
      child.stdin.end(request.stdinInput ?? '')
      child.on('error', (error) => {
        this.options.onLog?.('error', `Errore comando ${commandText}: ${error.message}`)
        finish({ ok: false, code: null, stdout, stderr: error.message })
      })
      child.on('close', (code) => {
        if (!settled) this.options.onLog?.(code === 0 ? 'info' : 'error', `Comando terminato con exit ${code ?? 'null'}: ${commandText}`)
        finish({ ok: code === 0, code, stdout, stderr })
      })
    })
  }

  cancel(requestId: string) {
    const active = this.active.get(requestId)
    if (!active) return false
    this.options.onLog?.('warn', `Richiesta interruzione comando ${requestId}.`)
    return active.cancel()
  }

  isActive(requestId: string) {
    return this.active.has(requestId)
  }
}