import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import {
  commandDefinitions,
  commandGroups,
  type CommandDefinition,
  type CommandGroup,
  type CommandId,
  type CommandField,
  type CommandParams,
  type HttpMethod
} from '../shared/command-catalog'
import type { AioCommandResult, AioConfig, AioOrganization, AppLog, AppLogLevel, AppWelcomeInfo, CloudManagerResource } from './types'
import { createLocalAppLog } from './app-log'
import { isOrganizationSelectLocked, needsCloudManagerContextEdit } from './cloud-manager-context'
import { searchOutput, type SearchMatch } from './output-search'
import { getWelcomeMessages } from './welcome-messages'
import alienSvgSource from './assets/alien-svgrepo-com.svg?raw'

type BootState = 'checking' | 'authenticated' | 'unauthenticated' | 'error'
type ToolboxId = 'cloudmanager' | 'appbuilder'
type AppScreen = 'welcome' | ToolboxId
type AppBuilderContext = { organizationId: string; projectId: string; workspaceId: string }
type MethodFilter = HttpMethod | 'ALL'
type PaletteId = 'classic' | 'graphite' | 'forest' | 'garnet'

const appBuilderContextStorageKey = 'cloud-manager-studio.appbuilder-context'
const emptyAppBuilderContext: AppBuilderContext = { organizationId: '', projectId: '', workspaceId: '' }

function readAppBuilderContext(): AppBuilderContext {
  try {
    const saved = JSON.parse(window.localStorage.getItem(appBuilderContextStorageKey) ?? '{}') as Partial<AppBuilderContext>
    return {
      organizationId: typeof saved.organizationId === 'string' ? saved.organizationId : '',
      projectId: typeof saved.projectId === 'string' ? saved.projectId : '',
      workspaceId: typeof saved.workspaceId === 'string' ? saved.workspaceId : ''
    }
  } catch {
    return emptyAppBuilderContext
  }
}

const paletteOptions: { id: PaletteId; label: string }[] = [
  { id: 'classic', label: 'Blu classico' },
  { id: 'graphite', label: 'Grafite / Teal' },
  { id: 'forest', label: 'Foresta / Menta' },
  { id: 'garnet', label: 'Granata / Rosa' }
]

const paletteAccents: Record<PaletteId, string> = {
  classic: '#73b3ec',
  graphite: '#83c9c2',
  forest: '#91c6a0',
  garnet: '#d392a4'
}

function getSavedPalette(): PaletteId {
  try {
    const saved = window.localStorage.getItem('adobe-aio-ui.palette')
    return paletteOptions.some((palette) => palette.id === saved) ? saved as PaletteId : 'classic'
  } catch {
    return 'classic'
  }
}

type ResponseState = {
  title: string
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  requestId?: string
  result?: AioCommandResult
  note?: string
}

const responsePlaceholder: ResponseState = {
  title: 'Nessuna risposta',
  status: 'idle',
  note: 'Esegui un comando per vedere qui output, codice di ritorno e diagnostica.'
}

const watermarkText = atob('QWRvYmUgSS9PIEludGVyZmFjZSBwcm92aWRlZCBieSBHZW5uYXJvIFNlY29uZHVsZm8=')

function formatOutput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return trimmed
  }
}

function methodLabel(method: HttpMethod) {
  return method === 'DELETE' ? 'DEL' : method
}

function readResourceValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function parseResourceList(value: string, collectionKeys: string[], idKeys: string[], nameKeys: string[], typeKeys: string[]) {
  let payload: unknown
  try {
    payload = JSON.parse(value)
  } catch {
    return []
  }

  const candidates: unknown[] = []
  const collect = (candidate: unknown, depth: number) => {
    if (Array.isArray(candidate)) {
      candidates.push(...candidate)
      return
    }
    if (depth > 2 || typeof candidate !== 'object' || candidate === null) return
    const record = candidate as Record<string, unknown>
    for (const key of collectionKeys) collect(record[key], depth + 1)
  }
  collect(payload, 0)
  if (!candidates.length && Array.isArray(payload)) candidates.push(...payload)

  const resources = candidates.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
    const record = candidate as Record<string, unknown>
    const id = readResourceValue(record, idKeys)
    if (!id) return []
    return [{
      id,
      name: readResourceValue(record, nameKeys) || id,
      description: readResourceValue(record, ['description', 'descriptionText']) || undefined,
      type: readResourceValue(record, typeKeys) || undefined,
      status: readResourceValue(record, ['status', 'state']) || undefined
    }]
  })
  return [...new Map(resources.map((resource) => [resource.id, resource])).values()]
}

function optionLabel(resource: CloudManagerResource) {
  const details = [resource.type, resource.status].filter(Boolean).join(' / ')
  return details ? `${resource.name} - ${details}` : resource.name
}

export function App() {
  const [bootState, setBootState] = useState<BootState>('checking')
  const [bootDetail, setBootDetail] = useState('Verifica della sessione Cloud Manager in corso...')
  const [activeToolbox, setActiveToolbox] = useState<AppScreen>('welcome')
  const [welcomeInfo, setWelcomeInfo] = useState<AppWelcomeInfo>({ languages: [navigator.language], username: '' })
  const bootEpochRef = useRef(0)
  const cloudContextEpochRef = useRef(0)
  const [loginBusy, setLoginBusy] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [context, setContext] = useState<AioConfig>({ organizationId: '', programId: '', environmentId: '', detail: '' })
  const [organizations, setOrganizations] = useState<AioOrganization[]>([])
  const [developerConsoleOrganizations, setDeveloperConsoleOrganizations] = useState<AioOrganization[]>([])
  const [developerConsoleProjects, setDeveloperConsoleProjects] = useState<CloudManagerResource[]>([])
  const [developerConsoleWorkspaces, setDeveloperConsoleWorkspaces] = useState<CloudManagerResource[]>([])
  const [appBuilderContext, setAppBuilderContext] = useState<AppBuilderContext>(readAppBuilderContext)
  const [appBuilderContextMessage, setAppBuilderContextMessage] = useState('')
  const [draftContext, setDraftContext] = useState({ organizationId: '', programId: '', environmentId: '' })
  const [editingContext, setEditingContext] = useState(false)
  const [contextMessage, setContextMessage] = useState('')
  const [activeGroup, setActiveGroup] = useState<CommandGroup>('programs')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCommandId, setSelectedCommandId] = useState<CommandId | null>(null)
  const [params, setParams] = useState<CommandParams>({})
  const [response, setResponse] = useState<ResponseState>(responsePlaceholder)
  const [runningCommand, setRunningCommand] = useState<CommandId | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [stoppingCommand, setStoppingCommand] = useState(false)
  const stoppingRequestRef = useRef<string | null>(null)
  const [logs, setLogs] = useState<AppLog[]>([])
  const [programs, setPrograms] = useState<CloudManagerResource[]>([])
  const [environments, setEnvironments] = useState<CloudManagerResource[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [loadingEnvironments, setLoadingEnvironments] = useState(false)
  const [loadingConsoleProjects, setLoadingConsoleProjects] = useState(false)
  const [loadingConsoleWorkspaces, setLoadingConsoleWorkspaces] = useState(false)
  const [selectingOrganization, setSelectingOrganization] = useState(false)
  const [outputWidth, setOutputWidth] = useState(375)
  const [resizingOutput, setResizingOutput] = useState(false)
  const [outputSearchText, setOutputSearchText] = useState('')
  const [outputSearchRegex, setOutputSearchRegex] = useState(false)
  const [outputSearchOpen, setOutputSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [palette, setPalette] = useState<PaletteId>(getSavedPalette)
  const [activeOutputMatchIndex, setActiveOutputMatchIndex] = useState(0)
  const outputMatchNodes = useRef(new Map<number, HTMLElement>())
  const outputSearchInputRef = useRef<HTMLInputElement | null>(null)
  const commandTabRefs = useRef(new Map<CommandGroup, HTMLButtonElement>())
  const mainLayoutRef = useRef<HTMLElement | null>(null)
  const hasSelectedProgram = Boolean(draftContext.programId && programs.some((program) => program.id === draftContext.programId))
  const hasSelectedEnvironment = Boolean(draftContext.environmentId && environments.some((environment) => environment.id === draftContext.environmentId))
  const organizationLocked = isOrganizationSelectLocked(editingContext, selectingOrganization)
  const programLocked = !editingContext || !draftContext.organizationId || selectingOrganization || loadingPrograms || programs.length === 0
  const environmentLocked = !editingContext || !draftContext.programId || !hasSelectedProgram || loadingPrograms || loadingEnvironments || environments.length === 0
  const contextReady = bootState === 'authenticated'
    && Boolean(context.organizationId && context.programId && context.environmentId)
    && context.organizationId === draftContext.organizationId
    && context.programId === draftContext.programId
    && context.environmentId === draftContext.environmentId
    && organizations.some((organization) => organization.id === draftContext.organizationId)
    && hasSelectedProgram
    && hasSelectedEnvironment
    && !editingContext
    && !loadingPrograms
    && !loadingEnvironments
  const contextLoading = selectingOrganization || loadingPrograms || loadingEnvironments
  const outputStdout = response.result?.stdout ? formatOutput(response.result.stdout) : ''
  const outputStderr = response.result?.stderr ? formatOutput(response.result.stderr) : ''
  const stdoutSearch = searchOutput(outputStdout, outputSearchText, outputSearchRegex)
  const stderrSearch = searchOutput(outputStderr, outputSearchText, outputSearchRegex)
  const outputMatchCount = stdoutSearch.matches.length + stderrSearch.matches.length
  const selectedOutputMatch = outputMatchCount ? activeOutputMatchIndex % outputMatchCount : -1
  const outputSearchError = stdoutSearch.error || stderrSearch.error

  useLayoutEffect(() => {
    document.documentElement.dataset.palette = palette
    const favicon = document.getElementById('app-favicon') as HTMLLinkElement | null
    if (favicon) {
      const svg = alienSvgSource.replace(/currentColor/g, paletteAccents[palette])
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      favicon.href = svgDataUrl

      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const context = canvas.getContext('2d')
        if (!context) return
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        window.aio.setNativeIcon(canvas.toDataURL('image/png'))
      }
      image.src = svgDataUrl
    }
    try {
      window.localStorage.setItem('adobe-aio-ui.palette', palette)
    } catch {
      appendLog('warn', 'Preferenza palette non persistita dal browser.')
    }
  }, [palette])

  useEffect(() => {
    if (selectedOutputMatch < 0) return
    outputMatchNodes.current.get(selectedOutputMatch)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedOutputMatch, outputSearchText, outputSearchRegex, outputMatchCount])

  const pendingContextMessage = loadingPrograms
    ? 'Caricamento dei programmi Cloud Manager...'
    : loadingEnvironments
      ? 'Caricamento degli ambienti Cloud Manager...'
      : !draftContext.organizationId
        ? 'In attesa della selezione dell’Organization'
        : !hasSelectedProgram
          ? 'In attesa della selezione del Program'
          : !hasSelectedEnvironment
            ? 'In attesa della selezione dell’Environment'
            : 'In attesa del salvataggio del contesto'

  const beginOutputResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizingOutput(true)
  }

  const moveOutputResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizingOutput || !mainLayoutRef.current) return
    const bounds = mainLayoutRef.current.getBoundingClientRect()
    const availableWidth = bounds.width - 44
    const maxWidth = Math.max(280, Math.min(680, availableWidth - 420))
    const nextWidth = bounds.right - 22 - event.clientX
    setOutputWidth(Math.round(Math.min(maxWidth, Math.max(280, nextWidth))))
  }

  const endOutputResize = () => setResizingOutput(false)

  const resizeOutputByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const bounds = mainLayoutRef.current?.getBoundingClientRect()
    const availableWidth = (bounds?.width ?? window.innerWidth) - 44
    const maxWidth = Math.max(280, Math.min(680, availableWidth - 420))
    const delta = event.key === 'ArrowLeft' ? 20 : -20
    setOutputWidth((current) => Math.round(Math.min(maxWidth, Math.max(280, current + delta))))
  }

  const appendLog = (level: AppLogLevel, message: string) => {
    setLogs((current) => [...current, createLocalAppLog(level, message)].slice(-250))
  }

  useEffect(() => {
    if (!window.aio) {
      appendLog('error', 'Bridge Electron non disponibile nel renderer.')
      return
    }
    appendLog('info', 'Renderer avviato; in attesa della scelta toolbox.')
    let active = true
    void window.aio.getLogs().then((entries) => {
      if (active) setLogs(entries)
    })
    void window.aio.getWelcomeInfo().then((info) => {
      if (active) setWelcomeInfo(info)
    }).catch((error) => {
      appendLog('warn', error instanceof Error ? error.message : 'Impossibile rilevare lingua e account Windows.')
    })
    const unsubscribe = window.aio.onLog((entry) => setLogs((current) => [...current, entry].slice(-250)))
    const unsubscribeCommandOutput = window.aio.onCommandOutput((output) => {
      setResponse((current) => {
        if (current.requestId !== output.requestId) return current
        const result = current.result ?? { ok: false, code: null, stdout: '', stderr: '' }
        return {
          ...current,
          result: {
            ...result,
            stdout: output.stream === 'stdout' ? result.stdout + output.chunk : result.stdout,
            stderr: output.stream === 'stderr' ? result.stderr + output.chunk : result.stderr
          }
        }
      })
    })
    return () => {
      active = false
      unsubscribe()
      unsubscribeCommandOutput()
    }
  }, [])

  const loadPrograms = async (organizationId: string, isCurrent: () => boolean = () => true) => {
    setLoadingPrograms(true)
    appendLog('info', `Caricamento programmi per organization ${organizationId}.`)
    try {
      const result = await window.aio.runCommand('list-programs', {}, crypto.randomUUID())
      if (!isCurrent()) return undefined
      if (!result.ok) {
        const detail = result.stderr || 'Impossibile caricare i programmi.'
        appendLog('error', detail)
        setContextMessage(detail)
        return undefined
      }
      const resources = parseResourceList(result.stdout, ['programs', 'results', 'items', 'data'], ['id', 'programId', 'program_id'], ['name', 'programName', 'displayName'], ['type', 'programType', 'program_type'])
      setPrograms(resources)
      setContextMessage('')
      appendLog('info', `Programmi caricati: ${resources.length}.`)
      return resources
    } finally {
      if (isCurrent()) setLoadingPrograms(false)
    }
  }

  const loadEnvironments = async (programId: string, isCurrent: () => boolean = () => true) => {
    setLoadingEnvironments(true)
    appendLog('info', `Caricamento ambienti per program ${programId}.`)
    try {
      const result = await window.aio.runCommand('list-environments', { programId }, crypto.randomUUID())
      if (!isCurrent()) return undefined
      if (!result.ok) {
        const detail = result.stderr || 'Impossibile caricare gli ambienti.'
        appendLog('error', detail)
        setContextMessage(detail)
        return undefined
      }
      const resources = parseResourceList(result.stdout, ['environments', 'results', 'items', 'data'], ['id', 'environmentId', 'environment_id'], ['name', 'environmentName', 'displayName'], ['type', 'environmentType', 'environment_type', 'tier'])
      setEnvironments(resources)
      setContextMessage('')
      appendLog('info', `Ambienti caricati: ${resources.length}.`)
      return resources
    } finally {
      if (isCurrent()) setLoadingEnvironments(false)
    }
  }

  const loadDeveloperConsoleProjects = async (organizationId: string) => {
    setLoadingConsoleProjects(true)
    setAppBuilderContextMessage('Caricamento dei progetti Developer Console...')
    try {
      const result = await window.aio.getConsoleProjects(organizationId)
      if (!result.ok) {
        appendLog('error', result.detail)
        setAppBuilderContextMessage(result.detail)
        return undefined
      }
      setDeveloperConsoleProjects(result.resources)
      setAppBuilderContextMessage(result.resources.length ? '' : 'Nessun Project disponibile per questa Organization.')
      return result.resources
    } finally {
      setLoadingConsoleProjects(false)
    }
  }

  const loadDeveloperConsoleWorkspaces = async (organizationId: string, projectId: string) => {
    setLoadingConsoleWorkspaces(true)
    setAppBuilderContextMessage('Caricamento dei Workspace Developer Console...')
    try {
      const result = await window.aio.getConsoleWorkspaces(organizationId, projectId)
      if (!result.ok) {
        appendLog('error', result.detail)
        setAppBuilderContextMessage(result.detail)
        return undefined
      }
      setDeveloperConsoleWorkspaces(result.resources)
      setAppBuilderContextMessage(result.resources.length ? '' : 'Nessun Workspace disponibile per questo Project.')
      return result.resources
    } finally {
      setLoadingConsoleWorkspaces(false)
    }
  }

  const persistAppBuilderContext = (next: AppBuilderContext) => {
    setAppBuilderContext(next)
    setAppBuilderContextMessage('')
    try {
      window.localStorage.setItem(appBuilderContextStorageKey, JSON.stringify(next))
    } catch {
      appendLog('warn', 'Contesto App Builder non persistito dal browser.')
    }
  }

  const handleAppBuilderOrganizationChange = async (organizationId: string) => {
    persistAppBuilderContext({ organizationId, projectId: '', workspaceId: '' })
    setDeveloperConsoleProjects([])
    setDeveloperConsoleWorkspaces([])
    if (organizationId) await loadDeveloperConsoleProjects(organizationId)
  }

  const handleAppBuilderProjectChange = async (projectId: string) => {
    persistAppBuilderContext({ ...appBuilderContext, projectId, workspaceId: '' })
    setDeveloperConsoleWorkspaces([])
    if (projectId && appBuilderContext.organizationId) await loadDeveloperConsoleWorkspaces(appBuilderContext.organizationId, projectId)
  }

  const boot = async (requestEpoch = ++bootEpochRef.current) => {
    const contextEpoch = ++cloudContextEpochRef.current
    const isCurrent = () => requestEpoch === bootEpochRef.current && contextEpoch === cloudContextEpochRef.current
    appendLog('info', 'Controllo sessione e contesto Cloud Manager.')
    setBootState('checking')
    setBootDetail('Verifica della sessione Cloud Manager in corso...')
    setContextMessage('')
    setPrograms([])
    setEnvironments([])
    setLoadingPrograms(false)
    setLoadingEnvironments(false)
    setSelectingOrganization(false)
    try {
      const [status, config] = await Promise.all([window.aio.getStatus(), window.aio.getConfig()])
      if (!isCurrent()) return
      const savedOrganizationAvailable = !config.organizationId || !status.organizations.length || status.organizations.some((organization) => organization.id === config.organizationId)
      const profileContext = savedOrganizationAvailable ? config : {
        organizationId: '',
        programId: '',
        environmentId: '',
        detail: 'Il profilo corrente non ha accesso all\'organization salvata.'
      }
      let hydratedContext = profileContext
      let programOptions: CloudManagerResource[] = []
      let environmentOptions: CloudManagerResource[] = []
      if (profileContext.organizationId) {
        const loadedPrograms = await loadPrograms(profileContext.organizationId, isCurrent)
        if (!isCurrent()) return
        if (loadedPrograms) programOptions = loadedPrograms
        if (loadedPrograms && profileContext.programId && !loadedPrograms.some((program) => program.id === profileContext.programId)) {
          hydratedContext = { ...profileContext, programId: '', environmentId: '', detail: 'Il programma salvato non è disponibile per questa Organization.' }
        } else if (loadedPrograms && profileContext.programId) {
          const loadedEnvironments = await loadEnvironments(profileContext.programId, isCurrent)
          if (!isCurrent()) return
          if (loadedEnvironments) environmentOptions = loadedEnvironments
          if (loadedEnvironments && profileContext.environmentId && !loadedEnvironments.some((environment) => environment.id === profileContext.environmentId)) {
            hydratedContext = { ...profileContext, environmentId: '', detail: 'L’ambiente salvato non è disponibile per questo programma.' }
          }
        }
      }
      if (!isCurrent()) return
      setOrganizations(status.organizations)
      setContext(hydratedContext)
      setDraftContext({ organizationId: hydratedContext.organizationId, programId: hydratedContext.programId, environmentId: hydratedContext.environmentId })
      setEditingContext(needsCloudManagerContextEdit(hydratedContext, status.organizations, programOptions, environmentOptions))
      if (!savedOrganizationAvailable) setContextMessage('Seleziona una organization disponibile per il profilo corrente.')
      if (status.authenticated) {
        appendLog('info', `Sessione valida. Organization disponibili: ${status.organizations.length}.`)
        setBootState('authenticated')
        setBootDetail(status.detail)
      } else {
        appendLog('warn', 'Sessione Cloud Manager non disponibile.')
        setBootState('unauthenticated')
        setBootDetail(status.detail)
      }
    } catch (error) {
      if (!isCurrent()) return
      appendLog('error', error instanceof Error ? error.message : 'Errore durante il boot.')
      setBootState('error')
      setBootDetail(error instanceof Error ? error.message : 'Bridge Electron non disponibile.')
    }
  }

  const bootAppBuilder = async (requestEpoch = ++bootEpochRef.current) => {
    const isCurrent = () => requestEpoch === bootEpochRef.current
    appendLog('info', 'Controllo sessione e contesto Developer Console.')
    setBootState('checking')
    setBootDetail('Verifica della sessione Adobe I/O per App Builder...')
    try {
      const status = await window.aio.getDeveloperConsoleStatus()
      if (!isCurrent()) return
      setDeveloperConsoleOrganizations(status.organizations)
      if (!status.authenticated) {
        setBootState('unauthenticated')
        setBootDetail(status.detail)
        return
      }

      let hydratedContext = readAppBuilderContext()
      setDeveloperConsoleProjects([])
      setDeveloperConsoleWorkspaces([])
      if (hydratedContext.organizationId && !status.organizations.some((organization) => organization.id === hydratedContext.organizationId)) {
        hydratedContext = emptyAppBuilderContext
      } else if (hydratedContext.organizationId) {
        const projects = await loadDeveloperConsoleProjects(hydratedContext.organizationId)
        if (!isCurrent()) return
        if (projects && hydratedContext.projectId && !projects.some((project) => project.id === hydratedContext.projectId)) {
          hydratedContext = { ...hydratedContext, projectId: '', workspaceId: '' }
        } else if (projects && hydratedContext.projectId) {
          const workspaces = await loadDeveloperConsoleWorkspaces(hydratedContext.organizationId, hydratedContext.projectId)
          if (!isCurrent()) return
          if (workspaces && hydratedContext.workspaceId && !workspaces.some((workspace) => workspace.id === hydratedContext.workspaceId)) {
            hydratedContext = { ...hydratedContext, workspaceId: '' }
          }
        }
      }
      if (!isCurrent()) return
      persistAppBuilderContext(hydratedContext)
      setBootState('authenticated')
      setBootDetail(status.detail)
      appendLog('info', `Sessione Developer Console valida. Organization disponibili: ${status.organizations.length}.`)
    } catch (error) {
      if (!isCurrent()) return
      const detail = error instanceof Error ? error.message : 'Errore durante il controllo Developer Console.'
      appendLog('error', detail)
      setBootState('error')
      setBootDetail(detail)
    }
  }

  const refreshActiveToolbox = () => {
    if (activeToolbox === 'cloudmanager') return boot()
    if (activeToolbox === 'appbuilder') return bootAppBuilder()
    return Promise.resolve()
  }

  const activateToolbox = async (toolbox: ToolboxId) => {
    const requestEpoch = ++bootEpochRef.current
    cloudContextEpochRef.current += 1
    setLoadingPrograms(false)
    setLoadingEnvironments(false)
    setSelectingOrganization(false)
    setActiveToolbox(toolbox)
    setShortcutsOpen(false)
    if (toolbox === 'cloudmanager') await boot(requestEpoch)
    else await bootAppBuilder(requestEpoch)
  }

  const returnHome = () => {
    bootEpochRef.current += 1
    cloudContextEpochRef.current += 1
    setLoadingPrograms(false)
    setLoadingEnvironments(false)
    setSelectingOrganization(false)
    setActiveToolbox('welcome')
    setShortcutsOpen(false)
  }

  const login = async () => {
    appendLog('info', 'Richiesto login con aio.')
    setLoginBusy(true)
    setBootDetail('Apertura del login Adobe IMS nel browser...')
    try {
      const result = await window.aio.login()
      if (!result.ok) {
        setBootDetail(result.detail)
        setBootState('unauthenticated')
      } else {
        await refreshActiveToolbox()
      }
    } catch (error) {
      setBootState('unauthenticated')
      setBootDetail(error instanceof Error ? error.message : 'Login non completato.')
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = async () => {
    appendLog('info', 'Richiesto logout per cambiare profilo Adobe IMS.')
    setLogoutBusy(true)
    try {
      const result = await window.aio.logout()
      if (result.ok) {
        setOrganizations([])
        setDeveloperConsoleOrganizations([])
        setDeveloperConsoleProjects([])
        setDeveloperConsoleWorkspaces([])
        setContext({ organizationId: '', programId: '', environmentId: '', detail: '' })
        setDraftContext({ organizationId: '', programId: '', environmentId: '' })
        setBootDetail('Logout forzato completato. Ora puoi effettuare nuovamente il login.')
        setBootState('unauthenticated')
      } else {
        appendLog('error', result.detail)
        setContextMessage(result.detail)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Logout non completato.'
      appendLog('error', detail)
      setContextMessage(detail)
    } finally {
      setLogoutBusy(false)
    }
  }

  const saveContext = async () => {
    if (!draftContext.organizationId.trim() || !draftContext.programId.trim() || !draftContext.environmentId.trim()) {
      setContextMessage('Seleziona l\'organization e inserisci Program ID ed Environment ID.')
      return
    }
    setContextMessage('Salvataggio in corso...')
    appendLog('info', 'Salvataggio contesto richiesto.')
    const result = await window.aio.setContext(draftContext)
    if (result.ok) {
      setContext({ ...draftContext, detail: result.detail })
      setEditingContext(false)
      setContextMessage(result.detail)
    } else {
      setContextMessage(result.detail)
    }
  }

  const handleOrganizationChange = async (organizationId: string) => {
    const contextEpoch = ++cloudContextEpochRef.current
    const isCurrent = () => contextEpoch === cloudContextEpochRef.current && activeToolbox === 'cloudmanager'
    setDraftContext({ organizationId, programId: '', environmentId: '' })
    setPrograms([])
    setEnvironments([])
    setLoadingPrograms(false)
    setLoadingEnvironments(false)
    setSelectingOrganization(false)
    setContextMessage('')
    if (!organizationId) return
    setSelectingOrganization(true)
    try {
      const result = await window.aio.selectOrganization(organizationId)
      if (!isCurrent()) return
      if (!result.ok) {
        appendLog('error', result.detail)
        setContextMessage(result.detail)
        return
      }
      await loadPrograms(organizationId, isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      const detail = error instanceof Error ? error.message : 'Impossibile caricare i programmi.'
      appendLog('error', detail)
      setContextMessage(detail)
    } finally {
      if (isCurrent()) setSelectingOrganization(false)
    }
  }

  const handleProgramChange = async (programId: string) => {
    const contextEpoch = ++cloudContextEpochRef.current
    const isCurrent = () => contextEpoch === cloudContextEpochRef.current && activeToolbox === 'cloudmanager'
    setDraftContext((current) => ({ ...current, programId, environmentId: '' }))
    setEnvironments([])
    setLoadingEnvironments(false)
    if (programId) await loadEnvironments(programId, isCurrent)
  }

  const cancelContextEdit = async () => {
    const contextEpoch = ++cloudContextEpochRef.current
    const isCurrent = () => contextEpoch === cloudContextEpochRef.current && activeToolbox === 'cloudmanager'
    setDraftContext({ organizationId: context.organizationId, programId: context.programId, environmentId: context.environmentId })
    setEditingContext(false)
    setContextMessage('Modifica annullata.')
    if (!context.organizationId) return
    const result = await window.aio.selectOrganization(context.organizationId)
    if (!isCurrent() || !result.ok) return
    const programOptions = await loadPrograms(context.organizationId, isCurrent)
    if (isCurrent() && context.programId && programOptions?.some((program) => program.id === context.programId)) await loadEnvironments(context.programId, isCurrent)
  }

  const visibleCommands = useMemo(
    () => commandDefinitions.filter((definition) => {
      const matchesGroup = definition.group === activeGroup
      const matchesMethod = methodFilter === 'ALL' || definition.method === methodFilter
      const search = searchTerm.trim().toLocaleLowerCase()
      const matchesSearch = !search || `${definition.label} ${definition.description} ${definition.id}`.toLocaleLowerCase().includes(search)
      return matchesGroup && matchesMethod && matchesSearch
    }),
    [activeGroup, methodFilter, searchTerm]
  )

  const selectedCommand = visibleCommands.find((definition) => definition.id === selectedCommandId) ?? visibleCommands[0] ?? null

  const selectCommand = (definition: CommandDefinition) => {
    setSelectedCommandId(definition.id)
    setParams({})
  }

  const runCommand = async (definition: CommandDefinition) => {
    const commandParams: CommandParams = { ...params }
    for (const commandField of definition.fields) {
      if (commandField.context) {
        const contextValue = context[commandField.key as 'organizationId' | 'programId' | 'environmentId']
        if (contextValue) commandParams[commandField.key] = contextValue
      }
    }
    commandParams.programId ||= context.programId
    commandParams.environmentId ||= context.environmentId
    for (const commandField of definition.fields) {
      if (!commandField.context && commandField.required && !commandParams[commandField.key]?.trim()) {
        setResponse({ title: definition.label, status: 'error', note: `Compila il campo: ${commandField.label}.` })
        return
      }
    }
    if (definition.confirm) {
      const targetDetails = definition.fields
        .filter((commandField) => !commandField.context && commandField.key !== definition.stdinParam && commandParams[commandField.key]?.trim())
        .map((commandField) => `${commandField.label}: ${commandParams[commandField.key]}`)
      const contextDetails = [`Organization: ${context.organizationId || '-'}`, `Program: ${context.programId || '-'}`, `Environment: ${context.environmentId || '-'}`]
      const confirmation = [definition.confirm, '', ...contextDetails, ...targetDetails].join('\n')
      if (!window.confirm(confirmation)) return
    }
    let stdinInput: string | undefined
    if (definition.stdinParam) {
      stdinInput = commandParams[definition.stdinParam]
      try {
        if (!stdinInput || !Array.isArray(JSON.parse(stdinInput))) throw new Error('Il payload deve essere un array JSON.')
      } catch (error) {
        setResponse({ title: definition.label, status: 'error', note: error instanceof Error ? error.message : 'JSON non valido.' })
        return
      }
    }
    if (definition.longRunning && runningCommand) return
    const requestId = crypto.randomUUID()
    appendLog('info', `Esecuzione comando: ${definition.id}.`)
    setRunningCommand(definition.id)
    setActiveRequestId(requestId)
    setResponse({ title: definition.label, status: 'running', requestId, note: definition.longRunning ? 'Stream avviato; l’output arriverà progressivamente.' : 'Esecuzione del comando aio in corso...' })
    try {
      const result = await window.aio.runCommand(definition.id, commandParams, requestId, stdinInput)
      setResponse({
        title: definition.label,
        status: result.cancelled ? 'cancelled' : result.ok ? 'success' : 'error',
        requestId,
        result,
        note: result.cancelled ? 'Comando interrotto.' : undefined
      })
      if (result.ok && definition.id === 'org-select') await boot()
    } catch (error) {
      setResponse({
        title: definition.label,
        status: 'error',
        note: error instanceof Error ? error.message : 'Errore durante l\'esecuzione.'
      })
    } finally {
      setRunningCommand(null)
      setActiveRequestId(null)
    }
  }

  const stopRunningCommand = async () => {
    const requestId = activeRequestId
    if (!requestId || stoppingRequestRef.current === requestId) return
    stoppingRequestRef.current = requestId
    setStoppingCommand(true)
    try {
      const stopped = await window.aio.cancelCommand(requestId)
      if (stopped) {
        appendLog('info', 'Interruzione comando accettata.')
      } else {
        appendLog('warn', 'Il comando non risulta più attivo; chiudo lo stato del tail.')
        setResponse((current) => current.requestId === requestId
          ? { ...current, status: 'cancelled', note: 'Tail terminato prima della richiesta di interruzione.' }
          : current)
        setRunningCommand(null)
        setActiveRequestId(null)
      }
    } catch (error) {
      appendLog('error', error instanceof Error ? error.message : 'Errore durante l’interruzione del comando.')
      setResponse((current) => current.requestId === requestId
        ? { ...current, status: 'error', note: 'Non è stato possibile interrompere il comando.' }
        : current)
      setRunningCommand(null)
      setActiveRequestId(null)
    } finally {
      if (stoppingRequestRef.current === requestId) {
        stoppingRequestRef.current = null
        setStoppingCommand(false)
      }
    }
  }

  const moveOutputMatch = (direction: -1 | 1) => {
    if (!outputMatchCount) return
    setActiveOutputMatchIndex((current) => (current + direction + outputMatchCount) % outputMatchCount)
  }

  const toggleOutputSearch = (open: boolean) => {
    setOutputSearchOpen(open)
    if (open) setShortcutsOpen(false)
  }

  useEffect(() => {
    if (outputSearchOpen) outputSearchInputRef.current?.focus()
  }, [outputSearchOpen])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'f') {
        event.preventDefault()
        toggleOutputSearch(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'l') {
        event.preventDefault()
        window.dispatchEvent(new Event('aio-ui:toggle-logs'))
        return
      }
      if (event.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false)
        else if (outputSearchOpen) toggleOutputSearch(false)
        else return
        event.preventDefault()
        return
      }
      if (/^F[1-7]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        const group = commandGroups[Number(event.key.slice(1)) - 1]
        if (!group) return
        setActiveGroup(group.id)
        setMethodFilter('ALL')
        setSelectedCommandId(null)
        setParams({})
        requestAnimationFrame(() => commandTabRefs.current.get(group.id)?.focus())
        return
      }
      if (event.key === 'F3' && outputSearchOpen) {
        event.preventDefault()
        const direction = event.shiftKey ? -1 : 1
        if (outputMatchCount) setActiveOutputMatchIndex((current) => (current + direction + outputMatchCount) % outputMatchCount)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && contextReady && selectedCommand && !runningCommand) {
        event.preventDefault()
        void runCommand(selectedCommand)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [contextReady, outputMatchCount, outputSearchOpen, runningCommand, selectedCommand, shortcutsOpen])

  const updateCommandParam = (key: CommandField['key'], value: string) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  const copyResponse = async () => {
    const value = response.result?.stdout || response.result?.stderr || response.note || ''
    if (value) await navigator.clipboard.writeText(value)
  }

  const renderHeader = () => <header className="titlebar">
    <span className="app-watermark titlebar-watermark" aria-hidden="true">{watermarkText}</span>
    <ToolboxSwitcher
      activeToolbox={activeToolbox}
      onGoHome={returnHome}
      onOpenShortcuts={() => setShortcutsOpen(true)}
    />
    <div className="titlebar-meta">
      {activeToolbox === 'welcome' ? <span>{welcomeInfo.username}</span> : <>
        <span className={bootState === 'authenticated' ? 'online-dot' : 'status-led'} />
        <span>{bootState === 'authenticated' ? 'IMS online' : bootState === 'checking' ? 'Connessione...' : 'Accesso richiesto'}</span>
        <button className="small-button" type="button" onClick={() => void refreshActiveToolbox()} disabled={bootState === 'checking'} title="Controlla di nuovo la sessione">Ricarica</button>
        {bootState === 'authenticated' ? <button className="small-button danger-button" type="button" onClick={() => void logout()} disabled={logoutBusy} title="Slogga e accedi con un altro profilo">{logoutBusy ? 'Logout...' : 'Slogga'}</button> : null}
      </>}
    </div>
  </header>

  const welcomeLanguages = welcomeInfo.languages.length ? welcomeInfo.languages : [navigator.language]

  if (activeToolbox === 'welcome') {
    return <div className="app-shell welcome-shell">
      {renderHeader()}
      <WelcomeScreen languages={welcomeLanguages} username={welcomeInfo.username} onSelect={(toolbox) => void activateToolbox(toolbox)} />
      <LogDock entries={logs} />
      <footer className="statusbar"><span>Cloud Manager Studio</span><span>{welcomeInfo.username}</span><span>Adobe I/O toolboxes</span></footer>
      {shortcutsOpen ? <ShortcutsDialog toolbox={activeToolbox} palette={palette} onPaletteChange={setPalette} onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  }

  if (bootState === 'checking') {
    return <div className="app-shell boot-shell">{renderHeader()}<BootScreen detail={bootDetail} toolboxTitle={activeToolbox === 'appbuilder' ? 'Adobe I/O App Builder' : 'Adobe I/O Cloud Manager'} /><LogDock entries={logs} /></div>
  }

  if (bootState === 'unauthenticated' || bootState === 'error') {
    return <div className="app-shell boot-shell">{renderHeader()}<LoginScreen detail={bootDetail} toolboxTitle={activeToolbox === 'appbuilder' ? 'Adobe I/O App Builder' : 'Adobe I/O Cloud Manager'} busy={loginBusy} logoutBusy={logoutBusy} onLogin={login} onForceLogout={logout} onRetry={() => void refreshActiveToolbox()} /><LogDock entries={logs} /></div>
  }

  return (
    <div className="app-shell">
      {renderHeader()}

      {activeToolbox === 'appbuilder' ? (
        <main className="appbuilder-main">
          <section className="appbuilder-context" aria-labelledby="appbuilder-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">DEVELOPER CONSOLE</span>
                <h1 id="appbuilder-title">Contesto App Builder</h1>
              </div>
              <span className="command-count">Adobe I/O Runtime</span>
            </div>
            <div className="appbuilder-context-controls">
              <label className="field-label">
                <span>Organization</span>
                <select value={appBuilderContext.organizationId} onChange={(event) => void handleAppBuilderOrganizationChange(event.target.value)}>
                  <option value="">{developerConsoleOrganizations.length ? 'Seleziona organization...' : 'Nessuna Organization caricata'}</option>
                  {developerConsoleOrganizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}{organization.code ? ` (${organization.code})` : ''}</option>)}
                </select>
              </label>
              <label className="field-label">
                <span>Project</span>
                <select value={appBuilderContext.projectId} disabled={!appBuilderContext.organizationId || loadingConsoleProjects || !developerConsoleProjects.length} onChange={(event) => void handleAppBuilderProjectChange(event.target.value)}>
                  <option value="">{loadingConsoleProjects ? 'Caricamento progetti...' : !appBuilderContext.organizationId ? 'Seleziona prima Organization' : 'Seleziona Project...'}</option>
                  {developerConsoleProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="field-label">
                <span>Workspace</span>
                <select value={appBuilderContext.workspaceId} disabled={!appBuilderContext.projectId || loadingConsoleWorkspaces || !developerConsoleWorkspaces.length} onChange={(event) => persistAppBuilderContext({ ...appBuilderContext, workspaceId: event.target.value })}>
                  <option value="">{loadingConsoleWorkspaces ? 'Caricamento workspace...' : !appBuilderContext.projectId ? 'Seleziona prima Project' : 'Seleziona Workspace...'}</option>
                  {developerConsoleWorkspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
            </div>
            <div className="context-feedback" aria-live="polite">{appBuilderContextMessage || (appBuilderContext.workspaceId ? 'Workspace selezionato.' : 'Seleziona Organization, Project e Workspace.')}</div>
            <div className="appbuilder-context-summary">
              <span>Org <b>{appBuilderContext.organizationId || '-'}</b></span>
              <span>Project <b>{appBuilderContext.projectId || '-'}</b></span>
              <span>Workspace <b>{appBuilderContext.workspaceId || '-'}</b></span>
            </div>
          </section>
          <section className="appbuilder-capabilities" aria-labelledby="appbuilder-capabilities-title">
            <div>
              <span className="eyebrow">FUNZIONALITÀ</span>
              <h2 id="appbuilder-capabilities-title">Comandi App Builder non ancora disponibili</h2>
              <p>Questa versione permette di selezionare il contesto Developer Console. Init, run, test, build, deploy e log delle app restano da sviluppare.</p>
            </div>
            <span className="appbuilder-context-state" aria-live="polite">{appBuilderContext.workspaceId ? 'Contesto pronto' : 'Contesto incompleto'}</span>
          </section>
        </main>
      ) : (
        <>
      <section className="context-panel" aria-labelledby="context-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONTESTO CLOUD MANAGER</span>
            <h1 id="context-title">Target operativo</h1>
          </div>
          <div className="moment-status" aria-live="polite">
            <span className="status-led" />
            <span><b>Momento</b> {context.organizationId || 'nessuna org'} / {context.programId || 'nessun programma'} / {context.environmentId || 'nessun ambiente'}</span>
          </div>
        </div>
        <div className="context-controls">
          <label className="field-label">
            <span>Organization</span>
            <select
              value={draftContext.organizationId}
              disabled={organizationLocked}
              onChange={(event) => void handleOrganizationChange(event.target.value)}
            >
              <option value="">{organizations.length ? 'Seleziona organization...' : 'Nessuna Organization caricata'}</option>
              {draftContext.organizationId && !organizations.some((organization) => organization.id === draftContext.organizationId) ? <option value={draftContext.organizationId}>Org salvata ({draftContext.organizationId})</option> : null}
              {organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}{organization.code ? ` (${organization.code})` : ''}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Program ID</span>
            <select
              value={draftContext.programId}
              disabled={programLocked}
              onChange={(event) => void handleProgramChange(event.target.value)}
            >
              <option value="">{selectingOrganization || loadingPrograms ? 'Caricamento programmi...' : !draftContext.organizationId ? 'Seleziona prima l’Organization' : programs.length ? 'Seleziona programma...' : 'Nessun Program disponibile'}</option>
              {programs.map((program) => <option value={program.id} key={program.id}>{optionLabel(program)}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Environment ID</span>
            <select
              className={environmentLocked ? 'dependency-locked' : undefined}
              value={draftContext.environmentId}
              disabled={environmentLocked}
              onChange={(event) => setDraftContext((current) => ({ ...current, environmentId: event.target.value }))}
            >
              <option value="">{loadingEnvironments ? 'Caricamento ambienti...' : !hasSelectedProgram ? 'Seleziona prima il programma' : environments.length ? 'Seleziona ambiente...' : 'Nessun Environment disponibile'}</option>
              {environments.map((environment) => <option value={environment.id} key={environment.id}>{optionLabel(environment)}</option>)}
            </select>
          </label>
          <div className="context-actions">
            {!editingContext ? (
              <button className="button secondary" type="button" onClick={() => { setEditingContext(true); setContextMessage('Modifica attiva.') }}>Modifica</button>
            ) : (
              <>
                <button className="button primary" type="button" onClick={() => void saveContext()}>Salva</button>
                {context.organizationId && context.programId && context.environmentId ? <button className="button secondary" type="button" onClick={() => void cancelContextEdit()}>Annulla</button> : null}
              </>
            )}
          </div>
        </div>
        <div className="context-feedback" aria-live="polite">{contextMessage || context.detail}</div>
      </section>

      <main
        ref={mainLayoutRef}
        className={resizingOutput ? 'main-layout is-resizing' : 'main-layout'}
        style={{ '--output-width': `${outputWidth}px` } as CSSProperties}
      >
        <section className="command-workspace" aria-labelledby="commands-title">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">CATALOGO CLOUD MANAGER</span>
              <h2 id="commands-title">Seleziona un comando</h2>
            </div>
            <span className="command-count">{visibleCommands.length} disponibili</span>
          </div>

          <nav className="tabs" aria-label="Tipologia comando">
            {commandGroups.map((group) => (
              <button ref={(element) => { if (element) commandTabRefs.current.set(group.id, element); else commandTabRefs.current.delete(group.id) }} className={activeGroup === group.id ? 'tab active' : 'tab'} type="button" key={group.id} onClick={() => { setActiveGroup(group.id); setMethodFilter('ALL'); setSelectedCommandId(null); setParams({}) }}>
                <span>{group.shortLabel}</span>
                <small>{commandDefinitions.filter((definition) => definition.group === group.id).length}</small>
              </button>
            ))}
          </nav>

          <div className="tool-row">
            <label className="command-search">
              <span className="sr-only">Cerca nei comandi</span>
              <input type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setSelectedCommandId(null); setParams({}) }} placeholder="Cerca comando o risorsa" />
            </label>
            <div className="method-switch" role="group" aria-label="Filtra per tipo chiamata">
              {(['ALL', 'GET', 'POST', 'PATCH', 'DELETE'] as MethodFilter[]).map((method) => (
                <button className={methodFilter === method ? 'method active' : 'method'} type="button" key={method} onClick={() => { setMethodFilter(method); setSelectedCommandId(null); setParams({}) }}>{method === 'ALL' ? 'Tutte' : methodLabel(method)}</button>
              ))}
            </div>
          </div>

          <div className="command-browser">
            <div className="command-list" aria-label="Comandi disponibili">
              {visibleCommands.map((definition) => (
                <CommandRow key={definition.id} definition={definition} selected={selectedCommand?.id === definition.id} running={runningCommand === definition.id} onSelect={() => selectCommand(definition)} />
              ))}
              {!visibleCommands.length ? <div className="empty-state">Nessun comando corrisponde ai filtri.</div> : null}
            </div>
            {selectedCommand ? <CommandDetails
              definition={selectedCommand}
              params={params}
              context={context}
              running={runningCommand === selectedCommand.id}
              canStop={Boolean(activeRequestId && selectedCommand.longRunning)}
              stopping={stoppingCommand}
              busy={Boolean(runningCommand)}
              onChange={updateCommandParam}
              onRun={() => void runCommand(selectedCommand)}
              onStop={() => void stopRunningCommand()}
            /> : <div className="command-details command-details-empty">Seleziona un comando dal catalogo.</div>}
          </div>
        </section>

        <div
          className="output-splitter"
          role="separator"
          aria-label="Ridimensiona il pannello output"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={680}
          aria-valuenow={outputWidth}
          tabIndex={0}
          onPointerDown={beginOutputResize}
          onPointerMove={moveOutputResize}
          onPointerUp={endOutputResize}
          onPointerCancel={endOutputResize}
          onKeyDown={resizeOutputByKeyboard}
          title="Trascina per ridimensionare; usa le frecce sinistra/destra"
        >
          <span />
        </div>

        <aside className="response-panel" aria-labelledby="response-title">
          <div className="response-heading">
            <div>
              <span className="eyebrow">OUTPUT</span>
              <h2 id="response-title">{response.title}</h2>
            </div>
            <div className="response-actions">
              <button className="small-button" type="button" onClick={() => toggleOutputSearch(true)} title="Apri ricerca output">Cerca</button>
              <button className="small-button" type="button" onClick={() => void copyResponse()} disabled={response.status === 'idle'} title="Copia la risposta">Copia</button>
            </div>
          </div>
          {outputSearchOpen ? <div className="output-search" role="search" aria-label="Cerca nella risposta">
            <input ref={outputSearchInputRef} type="search" value={outputSearchText} onChange={(event) => { setOutputSearchText(event.target.value); setActiveOutputMatchIndex(0) }} placeholder={outputSearchRegex ? 'Espressione regolare' : 'Cerca parola o frase'} aria-label="Testo da cercare nell’output" />
            <div className="search-mode" role="group" aria-label="Modalità ricerca">
              <button type="button" className={!outputSearchRegex ? 'active' : ''} aria-pressed={!outputSearchRegex} onClick={() => { setOutputSearchRegex(false); setActiveOutputMatchIndex(0) }}>Testo</button>
              <button type="button" className={outputSearchRegex ? 'active' : ''} aria-pressed={outputSearchRegex} onClick={() => { setOutputSearchRegex(true); setActiveOutputMatchIndex(0) }}>Regex</button>
            </div>
            <span className={outputSearchError ? 'search-count search-error' : 'search-count'} aria-live="polite">
              {outputSearchError ? 'Regex non valida' : outputMatchCount ? `${selectedOutputMatch + 1}/${outputMatchCount}` : outputSearchText ? '0 risultati' : ''}
            </span>
            <button type="button" className="search-step" onClick={() => moveOutputMatch(-1)} disabled={!outputMatchCount} aria-label="Risultato precedente" title="Risultato precedente">↑</button>
            <button type="button" className="search-step" onClick={() => moveOutputMatch(1)} disabled={!outputMatchCount} aria-label="Risultato successivo" title="Risultato successivo">↓</button>
            <button type="button" className="search-close" onClick={() => toggleOutputSearch(false)} aria-label="Chiudi ricerca output" title="Chiudi ricerca">×</button>
          </div> : null}
          {outputSearchOpen && outputSearchError ? <div className="search-error-detail" role="alert">{outputSearchError}</div> : null}
          <div className={response.status === 'running' ? 'response-status running' : response.status === 'success' ? 'response-status success' : response.status === 'error' ? 'response-status error' : response.status === 'cancelled' ? 'response-status cancelled' : 'response-status'}>
            <span className="status-led" />
            {response.status === 'running' ? 'In esecuzione...' : response.status === 'success' ? 'Completato' : response.status === 'error' ? 'Errore' : response.status === 'cancelled' ? 'Interrotto' : 'In attesa'}
            {response.result?.code !== undefined && response.result?.code !== null ? <span className="exit-code">exit {response.result.code}</span> : null}
          </div>
          <div className="response-body">
            {response.status === 'running' ? <div className="response-loader"><span className="loader small" /><span>Attendo risposta da aio...</span></div> : null}
            {response.note && response.status !== 'running' ? <p className="response-note">{response.note}</p> : null}
            {response.result?.command ? <div className="command-line">$ {response.result.command}</div> : null}
            {outputStdout ? <pre><OutputMatches text={outputStdout} matches={stdoutSearch.matches} offset={0} activeIndex={selectedOutputMatch} nodes={outputMatchNodes.current} /></pre> : null}
            {outputStderr ? <pre className="stderr"><OutputMatches text={outputStderr} matches={stderrSearch.matches} offset={stdoutSearch.matches.length} activeIndex={selectedOutputMatch} nodes={outputMatchNodes.current} /></pre> : null}
          </div>
          <div className="response-footer">Le credenziali non vengono mostrate nell'output.</div>
        </aside>

        {!contextReady ? <div className="context-wait-overlay" role="status" aria-live="polite">
          <div className="context-wait-content">
            {contextLoading ? <span className="loader" /> : <span className="context-wait-icon" aria-hidden="true">!</span>}
            <strong>{contextLoading ? 'Caricamento del contesto' : 'Configurazione richiesta'}</strong>
            <span>{pendingContextMessage}</span>
            <small>Seleziona e salva Organization, Program ed Environment nell’intestazione.</small>
          </div>
        </div> : null}
      </main>
        </>
      )}

      <LogDock entries={logs} />
      <footer className="statusbar">
        <span className="app-watermark statusbar-watermark" aria-hidden="true">{watermarkText}</span>
        <span><span className="status-led" /> {activeToolbox === 'cloudmanager' ? 'Adobe I/O Cloud Manager collegata' : 'Adobe I/O App Builder collegato'}</span>
        <span>{activeToolbox === 'cloudmanager' ? `Context: ${context.organizationId || '-'} / ${context.programId || '-'} / ${context.environmentId || '-'}` : `Context: ${appBuilderContext.organizationId || '-'} / ${appBuilderContext.projectId || '-'} / ${appBuilderContext.workspaceId || '-'}`}</span>
        <span>v0.1.0</span>
      </footer>
      {shortcutsOpen ? <ShortcutsDialog toolbox={activeToolbox} palette={palette} onPaletteChange={setPalette} onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  )
}

function ToolboxSwitcher({ activeToolbox, onGoHome, onOpenShortcuts }: {
  activeToolbox: AppScreen
  onGoHome: () => void
  onOpenShortcuts: () => void
}) {
  const activeLabel = activeToolbox === 'welcome' ? 'Home' : activeToolbox === 'cloudmanager' ? 'Cloud Manager CLI' : 'App Builder'

  return (
    <div className="brand-switcher">
      <div className="brand-mark">
        <button className="brand-mark-home" type="button" onClick={onGoHome} aria-label="Torna alla home Cloud Manager Studio">
          <span className="app-logo" aria-hidden="true" />
        </button>
        <button className="brand-help" type="button" onClick={onOpenShortcuts} aria-label="Apri le informazioni della toolbox" aria-haspopup="dialog" title="Informazioni toolbox">(?)</button>
      </div>
      <button className="brand-copy-home brand-trigger" type="button" onClick={onGoHome} aria-label={`Torna alla home Cloud Manager Studio. Toolbox attiva: ${activeLabel}`}>
        <div>
          <strong>Cloud Manager Studio</strong>
          <span>{activeLabel}</span>
        </div>
      </button>
    </div>
  )
}

function WelcomeScreen({ languages, username, onSelect }: { languages: string[]; username: string; onSelect: (toolbox: ToolboxId) => void }) {
  const copy = getWelcomeMessages(languages)
  const accountName = username.trim() || copy.fallbackName
  const greeting = copy.greeting(new Date().getHours())

  return (
    <main className="welcome-screen">
      <section className="welcome-copy" aria-labelledby="welcome-title">
        <span className="eyebrow">CLOUD MANAGER STUDIO · ADOBE I/O</span>
        <p className="welcome-greeting">{greeting},</p>
        <h1 id="welcome-title">{accountName}</h1>
        <span className="welcome-rule" aria-hidden="true" />
      </section>
      <section className="welcome-picker" aria-label={copy.choose}>
        <h2>{copy.choose}</h2>
        <div className="welcome-toolboxes">
          <button className="toolbox-choice" type="button" onClick={() => onSelect('cloudmanager')}>
            <span className="toolbox-stamp" aria-hidden="true">CM</span>
            <strong>{copy.cloudManagerTitle}</strong>
            <small>{copy.cloudManagerDescription}</small>
            <span className="toolbox-choice-arrow" aria-hidden="true">›</span>
          </button>
          <button className="toolbox-choice appbuilder-choice" type="button" onClick={() => onSelect('appbuilder')}>
            <span className="toolbox-stamp" aria-hidden="true">AB</span>
            <strong>{copy.appBuilderTitle}</strong>
            <small>{copy.appBuilderDescription}</small>
            <span className="toolbox-choice-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </main>
  )
}

function CommandRow({ definition, selected, running, onSelect }: { definition: CommandDefinition; selected: boolean; running: boolean; onSelect: () => void }) {
  return (
    <button className={selected ? 'command-row selected' : 'command-row'} type="button" onClick={onSelect} aria-pressed={selected}>
      <span className={`method-badge method-${definition.method.toLowerCase()}`}>{methodLabel(definition.method)}</span>
      <span className="command-row-copy"><strong>{definition.label}</strong><small>{definition.id}</small></span>
      {definition.risk === 'destructive' ? <span className="risk-mark" title="Richiede conferma">!</span> : null}
      {running ? <span className="loader tiny" aria-label="Comando in esecuzione" /> : null}
    </button>
  )
}

function CommandDetails({ definition, params, context, running, canStop, stopping, busy, onChange, onRun, onStop }: {
  definition: CommandDefinition
  params: CommandParams
  context: AioConfig
  running: boolean
  canStop: boolean
  stopping: boolean
  busy: boolean
  onChange: (key: CommandField['key'], value: string) => void
  onRun: () => void
  onStop: () => void
}) {
  const formFields = definition.fields.filter((item) => !item.context)
  const inheritedFields = definition.fields.filter((item) => item.context)

  return (
    <section className="command-details" aria-label={`Dettagli comando ${definition.label}`}>
      <div className="detail-topline">
        <span className={`method-badge method-${definition.method.toLowerCase()}`}>{methodLabel(definition.method)}</span>
        <span className={`risk-label risk-${definition.risk}`}>{definition.risk === 'read' ? 'Lettura' : definition.risk === 'write' ? 'Modifica' : definition.risk === 'destructive' ? 'Distruttivo' : 'Stream'}</span>
      </div>
      <h3>{definition.label}</h3>
      <p className="detail-description">{definition.description}</p>
      <code className="detail-command-id">{definition.id}</code>

      <div className="active-context-summary">
        <span>Org <b>{context.organizationId || '-'}</b></span>
        <span>Program <b>{context.programId || '-'}</b></span>
        <span>Environment <b>{context.environmentId || '-'}</b></span>
      </div>

      {inheritedFields.length ? <div className="inherited-fields">Contesto richiesto: {inheritedFields.map((item) => item.label).join(' · ')}</div> : null}

      {formFields.length ? <div className="command-form">
        {formFields.map((item) => <label className={`command-field field-${item.type ?? 'text'}`} key={item.key}>
          <span>{item.label}{item.required ? <i> richiesto</i> : null}</span>
          {item.type === 'select' ? <select value={params[item.key] ?? ''} onChange={(event) => onChange(item.key, event.target.value)}>
            <option value="">Seleziona...</option>
            {item.options?.map((option) => <option key={option} value={option}>{option}</option>)}
          </select> : item.type === 'textarea' ? <textarea value={params[item.key] ?? ''} onChange={(event) => onChange(item.key, event.target.value)} placeholder={item.placeholder} rows={7} spellCheck={false} /> : <input type={item.type === 'number' ? 'number' : 'text'} value={params[item.key] ?? ''} onChange={(event) => onChange(item.key, event.target.value)} placeholder={item.placeholder} spellCheck={false} />}
        </label>)}
      </div> : <div className="no-command-fields">Non richiede parametri aggiuntivi.</div>}

      {definition.stdinParam ? <p className="secure-input-note">Il JSON viene passato via stdin e non inserito negli argomenti o nei log del comando.</p> : null}
      {definition.confirm ? <p className="confirmation-note">L’esecuzione richiederà conferma.</p> : null}
      <div className="detail-actions">
        <button className={definition.risk === 'destructive' ? 'button danger-action' : 'button primary'} type="button" onClick={onRun} disabled={busy}>{running ? 'In esecuzione...' : definition.risk === 'stream' ? 'Avvia stream' : 'Esegui comando'}</button>
        {canStop ? <button className="button secondary" type="button" onClick={onStop} disabled={stopping}>{stopping ? 'Interruzione...' : 'Interrompi'}</button> : null}
      </div>
    </section>
  )
}

function OutputMatches({ text, matches, offset, activeIndex, nodes }: { text: string; matches: SearchMatch[]; offset: number; activeIndex: number; nodes: Map<number, HTMLElement> }) {
  if (!matches.length) return text
  const parts: ReactNode[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    if (match.start > cursor) parts.push(text.slice(cursor, match.start))
    const globalIndex = offset + index
    parts.push(<mark
      key={`${match.start}-${match.end}`}
      className={globalIndex === activeIndex ? 'output-match active' : 'output-match'}
      ref={(node) => { if (node) nodes.set(globalIndex, node); else nodes.delete(globalIndex) }}
    >{text.slice(match.start, match.end)}</mark>)
    cursor = match.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function ShortcutsDialog({ toolbox, palette, onPaletteChange, onClose }: { toolbox: AppScreen; palette: PaletteId; onPaletteChange: (palette: PaletteId) => void; onClose: () => void }) {
  const isCloudManager = toolbox === 'cloudmanager'
  return (
    <div className="shortcuts-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="shortcuts-heading">
          <div>
            <span className="eyebrow">{toolbox === 'appbuilder' ? 'APP BUILDER' : isCloudManager ? 'CLOUD MANAGER CLI' : 'HOME'}</span>
            <h2 id="shortcuts-title">{isCloudManager ? 'Scorciatoie da tastiera' : 'Informazioni toolbox'}</h2>
          </div>
          <button type="button" className="search-close" onClick={onClose} aria-label="Chiudi guida scorciatoie">×</button>
        </div>
        <div className="palette-setting">
          <div className={`palette-swatch palette-swatch-${palette}`} aria-hidden="true" />
          <label htmlFor="interface-palette">Palette interfaccia</label>
          <select id="interface-palette" value={palette} onChange={(event) => onPaletteChange(event.target.value as PaletteId)}>
            {paletteOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </div>
        {isCloudManager ? <div className="shortcut-list">
          <div className="shortcut-row"><span><kbd>Ctrl</kbd> <kbd>F</kbd></span><strong>Apri la ricerca dell’output e porta il focus sul campo</strong></div>
          <div className="shortcut-row"><span><kbd>F1</kbd>–<kbd>F7</kbd></span><strong>Seleziona e focalizza la categoria comandi</strong></div>
          {commandGroups.map((group, index) => <div className="shortcut-subrow" key={group.id}><span><kbd>F{index + 1}</kbd></span><span>{group.label}</span></div>)}
          <div className="shortcut-row"><span><kbd>F3</kbd></span><strong>Vai al risultato successivo della ricerca output</strong></div>
          <div className="shortcut-row"><span><kbd>Shift</kbd> <kbd>F3</kbd></span><strong>Vai al risultato precedente</strong></div>
          <div className="shortcut-row"><span><kbd>Ctrl</kbd> <kbd>Enter</kbd></span><strong>Esegui il comando selezionato</strong></div>
          <div className="shortcut-row"><span><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd></span><strong>Apri o minimizza il pannello log</strong></div>
          <div className="shortcut-row"><span><kbd>Esc</kbd></span><strong>Chiudi la guida o la ricerca output</strong></div>
        </div> : <p className="shortcuts-footnote">{toolbox === 'appbuilder' ? 'Nessuna scorciatoia configurata per App Builder.' : 'Seleziona una toolbox dalla home per visualizzare le informazioni disponibili.'}</p>}
        {isCloudManager ? <p className="shortcuts-footnote">Le operazioni che modificano risorse continuano a chiedere conferma.</p> : null}
      </section>
    </div>
  )
}

function BootScreen({ detail, toolboxTitle }: { detail: string; toolboxTitle: string }) {
  return (
    <div className="boot-screen">
      <div className="boot-window">
        <div className="boot-brand"><span className="app-logo" aria-hidden="true" /><span>{toolboxTitle}</span></div>
        <div className="loader" aria-label="Caricamento" />
        <h1>Connessione alla CLI</h1>
        <p>{detail}</p>
        <span className="boot-caption">Controllo login e contesto locale</span>
      </div>
    </div>
  )
}

function LoginScreen({ detail, toolboxTitle, busy, logoutBusy, onLogin, onForceLogout, onRetry }: { detail: string; toolboxTitle: string; busy: boolean; logoutBusy: boolean; onLogin: () => void; onForceLogout: () => void; onRetry: () => void }) {
  return (
    <div className="boot-screen login-screen">
      <div className="boot-window login-window">
        <div className="boot-brand"><span className="app-logo" aria-hidden="true" /><span>{toolboxTitle}</span></div>
        <div className="login-icon">!</div>
        <span className="eyebrow">ACCESSO RICHIESTO</span>
        <h1>Sessione non disponibile</h1>
        <p>{detail}</p>
        <div className="login-actions">
          <button className="button primary login-button" type="button" onClick={onLogin} disabled={busy || logoutBusy}>{busy ? <><span className="loader tiny" /> Attendo browser...</> : 'Login con aio'}</button>
          <button className="button secondary" type="button" onClick={onForceLogout} disabled={busy || logoutBusy}>{logoutBusy ? <><span className="loader tiny" /> Logout...</> : 'Forza logout'}</button>
        </div>
        <button className="link-button" type="button" onClick={onRetry} disabled={busy || logoutBusy}>Controlla di nuovo</button>
        <span className="boot-caption">Il login apre il flusso Adobe IMS nel browser predefinito.</span>
      </div>
    </div>
  )
}

function LogDock({ entries }: { entries: AppLog[] }) {
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(170)
  const [followLogs, setFollowLogs] = useState(true)
  const resizeStart = useRef<{ y: number; height: number } | null>(null)
  const logListRef = useRef<HTMLDivElement | null>(null)
  const lastLogId = entries.length ? entries[entries.length - 1].id : null

  useLayoutEffect(() => {
    if (expanded && logListRef.current) logListRef.current.scrollTop = logListRef.current.scrollHeight
  }, [expanded])

  useEffect(() => {
    if (!expanded || !followLogs || lastLogId === null || !logListRef.current) return
    logListRef.current.scrollTop = logListRef.current.scrollHeight
  }, [entries.length, expanded, followLogs, lastLogId])

  useEffect(() => {
    const toggle = () => setExpanded((current) => !current)
    window.addEventListener('aio-ui:toggle-logs', toggle)
    return () => window.removeEventListener('aio-ui:toggle-logs', toggle)
  }, [])

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    resizeStart.current = { y: event.clientY, height }
    event.currentTarget.setPointerCapture(event.pointerId)
    setExpanded(true)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return
    const nextHeight = resizeStart.current.height + resizeStart.current.y - event.clientY
    setHeight(Math.min(360, Math.max(92, nextHeight)))
  }

  const stopResize = () => {
    resizeStart.current = null
  }

  return (
    <section className={expanded ? 'log-dock expanded' : 'log-dock'} style={{ height: expanded ? `${height}px` : '32px' }} aria-label="Log applicativo">
      <div className="log-grip" onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} title="Trascina per alzare o abbassare il log">
        <span />
      </div>
      <div className="log-toolbar">
        <div className="log-title"><span className="status-led" /> <b>LOG</b><span>{entries.length} eventi</span></div>
        <span className="log-hint">{expanded ? 'Trascina la maniglia per ridimensionare' : 'Footer log minimizzato'}</span>
        <button className={followLogs ? 'log-follow active' : 'log-follow'} type="button" onClick={() => setFollowLogs((current) => !current)} aria-label={followLogs ? 'Disattiva segui log' : 'Attiva segui log'} aria-pressed={followLogs} title={followLogs ? 'Segui i nuovi log' : 'Segui log disattivato'}>↓</button>
        <button className="log-toggle" type="button" onClick={() => setExpanded((current) => !current)} aria-label={expanded ? 'Abbassa log' : 'Riapri log'} title={expanded ? 'Abbassa log' : 'Riapri log'}>{expanded ? 'v' : 'L'}</button>
      </div>
      {expanded ? <div className="log-list" ref={logListRef}>
        {entries.length ? entries.map((entry) => <div className={`log-entry log-${entry.level}`} key={entry.id}><time>{entry.timestamp.slice(11, 19)}</time><strong>{entry.level.toUpperCase()}</strong><span>{entry.message}</span></div>) : <div className="log-empty">Nessun evento registrato.</div>}
      </div> : null}
    </section>
  )
}
