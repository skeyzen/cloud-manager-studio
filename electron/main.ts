import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { commandDefinitions, type CommandId, type CommandParams } from '../shared/command-catalog'
import { setupActionOptions } from '../shared/setup-actions'
import { getBundledCliEntryPath, resolveAioCommand, type AioCommandTarget } from './aio-cli-invocation'
import { AioProcessRunner, type AioProcessResult } from './aio-process-runner'
import { buildPowerShellSetupScript, getMissingBundledComponents, isMissingCliDependency, type CliToolbox } from './setup-actions'

type AppLogLevel = 'info' | 'warn' | 'error'

interface AppLog {
  id: number
  timestamp: string
  level: AppLogLevel
  message: string
}

const aioExecutable = process.platform === 'win32' ? 'aio.cmd' : 'aio'
const commandById = new Map(commandDefinitions.map((definition) => [definition.id, definition]))
const appLogs: AppLog[] = []
let nextLogId = 1

interface CloudManagerOrganization {
  id: string
  name: string
  code?: string
}

function sanitize(value: string) {
  return value.replace(/(token|secret|password|api[_-]?key|access[_-]?token)(\s*[:=]\s*)[^\s,}]+/gi, '$1$2[REDACTED]')
}

function isValidOrganizationId(value: string) {
  return /^[A-Za-z0-9._:-]+(?:@[A-Za-z0-9.-]+)?$/.test(value)
}

function invalidCharacters(value: string) {
  return [...new Set(value.match(/[^A-Za-z0-9._:@-]/g) ?? [])]
    .map((character) => `U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`)
    .join(', ') || 'nessuno'
}

function writeLog(level: AppLogLevel, message: string) {
  const entry: AppLog = {
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level,
    message: sanitize(message)
  }
  appLogs.push(entry)
  if (appLogs.length > 250) appLogs.shift()
  const output = `[cloud-manager-studio/${level}] ${entry.message}`
  if (level === 'error') console.error(output)
  else if (level === 'warn') console.warn(output)
  else console.log(output)
  if (app.isReady()) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('app:log', entry)
    }
  }
}

writeLog('info', 'Main process avviato.')

const aioRunner = new AioProcessRunner({
  executable: aioExecutable,
  shell: process.platform === 'win32',
  onLog: writeLog,
  onOutput: (requestId, stream, chunk) => {
    const output = sanitize(chunk)
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('aio:command-output', { requestId, stream, chunk: output })
  },
  terminateProcess: (child: ChildProcessWithoutNullStreams) => {
    if (process.platform !== 'win32' || !child.pid) return
    const termination = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    termination.on('error', (error) => writeLog('warn', `taskkill non riuscito per PID ${child.pid}: ${error.message}`))
    termination.unref()
  }
})

function runAio(args: string[], timeoutMs: number | null = 45_000, stdinInput = '', requestId: string = crypto.randomUUID(), streamOutput = false, target: AioCommandTarget = 'aio'): Promise<AioProcessResult> {
  const appPath = app.getAppPath()
  const invocation = resolveAioCommand({
    target,
    args,
    isPackaged: app.isPackaged,
    appPath,
    electronExecutable: process.execPath,
    platform: process.platform,
    bundledEntryExists: existsSync(getBundledCliEntryPath(appPath, target))
  })
  return aioRunner.run({
    ...invocation,
    timeoutMs,
    stdinInput,
    requestId,
    streamOutput,
    cwd: app.isPackaged ? app.getPath('home') : appPath
  })
}

function getSetupFailure(toolbox: CliToolbox, result: AioProcessResult) {
  if (!isMissingCliDependency(result)) return { setupRequired: false, missingComponents: [] as string[] }
  const missingComponents = getMissingBundledComponents(app.getAppPath(), app.isPackaged, toolbox)
  const affected = missingComponents.length
    ? missingComponents
    : toolbox === 'cloudmanager'
      ? ['Adobe I/O CLI o plugin Cloud Manager nel PATH']
      : ['Adobe I/O CLI o plugin Console nel PATH']
  const detail = sanitize(`Prerequisiti mancanti (${affected.join(', ')}). ${result.stderr || result.stdout || 'Verifica l’installazione della CLI.'}`)
  return { setupRequired: true, missingComponents: affected, detail }
}

function parseJson<T>(value: string): T | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const firstJson = Math.min(...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0))
    if (!Number.isFinite(firstJson)) return undefined
    try {
      return JSON.parse(trimmed.slice(firstJson)) as T
    } catch {
      return undefined
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function parseOrganizations(payload: unknown): CloudManagerOrganization[] {
  const root = asRecord(payload)
  const candidates: unknown[] = Array.isArray(payload) ? payload : []
  if (root) {
    for (const key of ['organizations', 'results', 'items', 'data']) {
      const value = root[key]
      if (Array.isArray(value)) candidates.push(...value)
      const nested = asRecord(value)
      if (nested) {
        for (const nestedKey of ['organizations', 'results', 'items']) {
          if (Array.isArray(nested[nestedKey])) candidates.push(...nested[nestedKey] as unknown[])
        }
      }
    }
    if (!candidates.length && readString(root, ['id', 'orgId', 'imsOrgId', 'code'])) candidates.push(root)
  }

  const organizations = candidates.flatMap((candidate) => {
    const record = asRecord(candidate)
    if (!record) return []
    const id = readString(record, ['id', 'orgId', 'imsOrgId', 'organizationId', 'code'])
    if (!id) return []
    const name = readString(record, ['name', 'orgName', 'organizationName', 'companyName', 'displayName']) || id
    const code = readString(record, ['code', 'orgCode']) || undefined
    return [{ id, name, code }]
  })

  return [...new Map(organizations.map((organization) => [organization.id, organization])).values()]
}

function parseConsoleResources(payload: unknown, collectionKeys: string[], idKeys: string[], nameKeys: string[]) {
  const candidates: unknown[] = []
  const collect = (candidate: unknown, depth: number) => {
    if (Array.isArray(candidate)) {
      candidates.push(...candidate)
      return
    }
    if (depth > 3 || typeof candidate !== 'object' || candidate === null) return
    const record = candidate as Record<string, unknown>
    for (const key of collectionKeys) collect(record[key], depth + 1)
  }
  collect(payload, 0)
  if (!candidates.length && typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    if (readString(record, idKeys)) candidates.push(record)
  }

  const resources = candidates.flatMap((candidate) => {
    const record = asRecord(candidate)
    if (!record) return []
    const id = readString(record, idKeys)
    if (!id) return []
    return [{ id, name: readString(record, nameKeys) || id }]
  })
  return [...new Map(resources.map((resource) => [resource.id, resource])).values()]
}

function createWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const preloadPath = path.join(__dirname, 'preload.js')
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#101823',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: Boolean(devServerUrl)
    }
  })

  const showWindow = () => {
    if (!window.isDestroyed() && !window.isVisible()) window.show()
  }
  const loadErrorPage = (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    writeLog('error', `Impossibile caricare il renderer: ${detail}`)
    const fallback = `<html><body style="margin:0;background:#101823;color:#e6edf5;font-family:Tahoma,sans-serif;padding:32px"><h1>Cloud Manager Studio</h1><p>Impossibile caricare l'interfaccia.</p><pre style="white-space:pre-wrap;color:#f3aaaa">${detail.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)}</pre></body></html>`
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallback)}`).then(showWindow).catch(showWindow)
  }

  window.once('ready-to-show', showWindow)
  window.webContents.on('did-finish-load', () => {
    writeLog('info', 'Renderer caricato.')
    showWindow()
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog('error', `Renderer load failure ${errorCode} su ${validatedURL}: ${errorDescription}`)
    showWindow()
  })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeLog('error', `Preload fallito (${preloadPath}): ${error.message}`)
  })
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) writeLog('error', `Console renderer ${sourceId}:${line}: ${message}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog('error', `Renderer terminato: ${details.reason}`)
    showWindow()
  })
  const loadPromise = devServerUrl
    ? window.loadURL(devServerUrl)
    : window.loadFile(path.join(__dirname, '../../dist/index.html'))
  void loadPromise.then(showWindow).catch(loadErrorPage)
}

ipcMain.handle('app:logs', () => appLogs)

ipcMain.handle('app:welcome-info', () => ({
  languages: app.getPreferredSystemLanguages(),
  username: process.env.USERNAME ?? process.env.USER ?? ''
}))

ipcMain.handle('setup:open-powershell', (_event, actionId: unknown) => {
  if (process.platform !== 'win32') return { ok: false, detail: 'La riparazione PowerShell è disponibile solo su Windows.' }
  const script = buildPowerShellSetupScript(actionId)
  if (!script) return { ok: false, detail: 'Azione di riparazione non riconosciuta.' }
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const shell = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encodedScript], {
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    })
    shell.once('error', (error) => {
      writeLog('error', `Avvio PowerShell non riuscito: ${error.message}`)
      resolve({ ok: false, detail: `Impossibile aprire PowerShell: ${error.message}` })
    })
    shell.once('spawn', () => {
      shell.unref()
      writeLog('info', `Aperta la riparazione PowerShell: ${String(actionId)}.`)
      resolve({ ok: true, detail: 'PowerShell aperto. Conferma il comando nella finestra per procedere.' })
    })
  })
})

ipcMain.on('app:set-native-icon', (event, pngDataUrl: unknown) => {
  if (typeof pngDataUrl !== 'string' || pngDataUrl.length > 1_500_000 || !pngDataUrl.startsWith('data:image/png;base64,')) return
  const icon = nativeImage.createFromDataURL(pngDataUrl)
  if (icon.isEmpty()) {
    writeLog('warn', 'Icona nativa ignorata: PNG non valido.')
    return
  }
  BrowserWindow.fromWebContents(event.sender)?.setIcon(icon)
  if (process.platform === 'darwin') app.dock?.setIcon(icon)
})

ipcMain.handle('aio:status', async () => {
  writeLog('info', 'Controllo sessione Cloud Manager.')
  const aioRuntime = await runAio(['--version'], 15_000)
  const aioSetupFailure = getSetupFailure('cloudmanager', aioRuntime)
  if (aioSetupFailure.setupRequired) {
    return { authenticated: false, organizations: [], ...aioSetupFailure }
  }
  const result = await runAio(['cloudmanager:org:list', '--json'], 30_000, '', crypto.randomUUID(), false, 'cloudmanager')
  const setupFailure = getSetupFailure('cloudmanager', result)
  return {
    authenticated: result.ok,
    organizations: result.ok ? parseOrganizations(parseJson<unknown>(result.stdout)) : [],
    ...setupFailure,
    detail: setupFailure.setupRequired ? setupFailure.detail : sanitize(result.ok ? 'Sessione Cloud Manager attiva.' : result.stderr || result.stdout || 'Sessione non disponibile.')
  }
})

ipcMain.handle('aio:developer-console-status', async () => {
  writeLog('info', 'Controllo sessione Developer Console per App Builder.')
  const result = await runAio(['console', 'org', 'list', '--json'], 30_000, '', crypto.randomUUID(), false, 'console')
  const setupFailure = getSetupFailure('appbuilder', result)
  return {
    authenticated: result.ok,
    organizations: result.ok ? parseOrganizations(parseJson<unknown>(result.stdout)) : [],
    ...setupFailure,
    detail: setupFailure.setupRequired ? setupFailure.detail : sanitize(result.ok ? 'Sessione Developer Console attiva.' : result.stderr || result.stdout || 'Sessione Developer Console non disponibile.')
  }
})

ipcMain.handle('aio:developer-console-projects', async (_event, organizationId: unknown) => {
  const normalizedId = typeof organizationId === 'string' ? organizationId.trim() : ''
  if (!isValidOrganizationId(normalizedId)) return { ok: false, resources: [], detail: 'Organization ID non valido.' }
  const result = await runAio(['console', 'project', 'list', '--orgId', normalizedId, '--json'], 30_000, '', crypto.randomUUID(), false, 'console')
  return {
    ok: result.ok,
    resources: result.ok ? parseConsoleResources(parseJson<unknown>(result.stdout), ['projects', 'projectList', 'results', 'items', 'data'], ['id', 'projectId', 'project_id'], ['name', 'projectName', 'title']) : [],
    detail: sanitize(result.ok ? 'Progetti Developer Console caricati.' : result.stderr || result.stdout || 'Impossibile caricare i progetti Developer Console.')
  }
})

ipcMain.handle('aio:developer-console-workspaces', async (_event, selection: unknown) => {
  const request = asRecord(selection)
  const organizationId = typeof request?.organizationId === 'string' ? request.organizationId.trim() : ''
  const projectId = typeof request?.projectId === 'string' ? request.projectId.trim() : ''
  if (!isValidOrganizationId(organizationId) || !/^[A-Za-z0-9._:-]{1,256}$/.test(projectId)) {
    return { ok: false, resources: [], detail: 'Organization ID o Project ID non valido.' }
  }
  const result = await runAio(['console', 'workspace', 'list', '--orgId', organizationId, '--projectId', projectId, '--json'], 30_000, '', crypto.randomUUID(), false, 'console')
  return {
    ok: result.ok,
    resources: result.ok ? parseConsoleResources(parseJson<unknown>(result.stdout), ['workspaces', 'workspaceList', 'results', 'items', 'data'], ['id', 'workspaceId', 'workspace_id'], ['name', 'workspaceName', 'title']) : [],
    detail: sanitize(result.ok ? 'Workspace Developer Console caricati.' : result.stderr || result.stdout || 'Impossibile caricare i Workspace Developer Console.')
  }
})

ipcMain.handle('aio:login', async () => {
  writeLog('info', 'Avvio login Adobe IMS.')
  const result = await runAio(['login'], 180_000)
  return {
    ok: result.ok,
    detail: sanitize(result.ok ? 'Login completato.' : result.stderr || result.stdout || 'Login non completato.')
  }
})

ipcMain.handle('aio:logout', async () => {
  writeLog('info', 'Avvio logout Adobe IMS.')
  const result = await runAio(['auth', 'logout', '--force'], 30_000)
  return {
    ok: result.ok,
    detail: sanitize(result.ok ? 'Logout completato.' : result.stderr || result.stdout || 'Logout non completato.')
  }
})

async function selectOrganization(organizationId: string) {
  const normalizedId = organizationId.trim()
  writeLog('info', `Validazione Organization ID: lunghezza ${normalizedId.length}, caratteri non ammessi ${invalidCharacters(normalizedId)}.`)
  if (!isValidOrganizationId(normalizedId)) {
    writeLog('error', `Organization ID rifiutato dalla validazione locale (lunghezza ${normalizedId.length}).`)
    return { ok: false, detail: 'Organization ID non valido. Sono ammessi lettere, numeri, . _ : - e un suffisso Adobe nel formato @AdobeOrg.' }
  }
  writeLog('info', `Selezione organization ${normalizedId}.`)
  const organizationResult = await runAio(['cloudmanager:org:select', normalizedId], 45_000, '', crypto.randomUUID(), false, 'cloudmanager')
  if (!organizationResult.ok) {
    const detail = sanitize(organizationResult.stderr || organizationResult.stdout || `aio cloudmanager:org:select è terminato con exit ${organizationResult.code ?? 'null'}.`).slice(0, 1000)
    writeLog('error', `cloudmanager:org:select fallito per Organization ID ${normalizedId}: ${detail}`)
    return { ok: false, detail }
  }
  const configResult = await runAio(['config', 'set', 'cloudmanager_orgid', normalizedId, '--local'])
  if (!configResult.ok) {
    const detail = sanitize(configResult.stderr || configResult.stdout || `aio config set è terminato con exit ${configResult.code ?? 'null'}.`).slice(0, 1000)
    writeLog('error', `Salvataggio cloudmanager_orgid fallito: ${detail}`)
    return { ok: false, detail }
  }
  return {
    ok: true,
    detail: 'Organization selezionata.'
  }
}

ipcMain.handle('aio:select-organization', async (_event, organizationId: string) => selectOrganization(organizationId))

ipcMain.handle('aio:config', async () => {
  writeLog('info', 'Lettura configurazione CLI locale.')
  const result = await runAio(['config', 'list', '--json'])
  if (!result.ok) {
    return { organizationId: '', programId: '', environmentId: '', detail: sanitize(result.stderr || result.stdout) }
  }
  const config = parseJson<Record<string, unknown>>(result.stdout) ?? {}
  return {
    organizationId: String(config.cloudmanager_orgid ?? config.cloudmanagerOrgId ?? ''),
    programId: String(config.cloudmanager_programid ?? config.cloudmanagerProgramId ?? ''),
    environmentId: String(config.cloudmanager_environmentid ?? config.cloudmanagerEnvironmentId ?? ''),
    detail: 'Configurazione locale caricata.'
  }
})

ipcMain.handle('aio:cancel-command', (_event, requestId: string) => {
  return aioRunner.cancel(requestId)
})

ipcMain.handle('aio:set-context', async (_event, params: { organizationId: string; programId: string; environmentId: string }) => {
  writeLog('info', `Salvataggio contesto org ${params.organizationId}, program ${params.programId}, environment ${params.environmentId}.`)
  const organizationId = params.organizationId.trim()
  const programId = params.programId.trim()
  const environmentId = params.environmentId.trim()
  if (!isValidOrganizationId(organizationId)) {
    return { ok: false, detail: 'Organization ID non valido. Sono ammessi lettere, numeri, . _ : - e un suffisso Adobe nel formato @AdobeOrg.' }
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(programId) || !/^[A-Za-z0-9._:-]+$/.test(environmentId)) {
    return { ok: false, detail: 'Program ID ed Environment ID contengono caratteri non validi.' }
  }
  const organizationSelection = await selectOrganization(organizationId)
  if (!organizationSelection.ok) return organizationSelection
  const programResult = await runAio(['config', 'set', 'cloudmanager_programid', programId, '--local'])
  if (!programResult.ok) {
    return { ok: false, detail: sanitize(programResult.stderr || programResult.stdout) }
  }
  const environmentResult = await runAio(['config', 'set', 'cloudmanager_environmentid', environmentId, '--local'])
  return {
    ok: environmentResult.ok,
    detail: sanitize(environmentResult.ok ? 'Contesto salvato nella configurazione locale.' : environmentResult.stderr || environmentResult.stdout)
  }
})

ipcMain.handle('aio:command', async (_event, request: { id: CommandId; params: CommandParams; requestId: string; stdinInput?: string }) => {
  writeLog('info', `Richiesto comando applicativo: ${request.id}.`)
  const definition = commandById.get(request.id)
  if (!definition) return { ok: false, code: null, stdout: '', stderr: 'Comando non riconosciuto.' }
  try {
    const args = definition.buildArgs(request.params)
    if (definition.stdinParam) {
      if (!request.stdinInput) return { ok: false, code: 3, stdout: '', stderr: 'Il comando richiede un payload JSON in input.' }
      const parsedInput = JSON.parse(request.stdinInput) as unknown
      if (!Array.isArray(parsedInput)) return { ok: false, code: 3, stdout: '', stderr: 'Il payload variabili deve essere un array JSON.' }
    }
    const result = await runAio(args, definition.longRunning ? null : 45_000, request.stdinInput ?? '', request.requestId, definition.longRunning, 'cloudmanager')
    return {
      ...result,
      stdout: sanitize(result.stdout),
      stderr: sanitize(result.stderr),
      command: `aio ${args.join(' ')}`
    }
  } catch (error) {
    return { ok: false, code: null, stdout: '', stderr: error instanceof Error ? error.message : 'Parametri non validi.' }
  }
})

app.whenReady().then(() => {
  writeLog('info', 'Electron pronto, creazione finestra.')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
