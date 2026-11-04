export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type CommandGroup = 'organizations' | 'programs' | 'environments' | 'pipelines' | 'executions' | 'content' | 'ip-allowlists'
export type CommandId = string
export type CommandRisk = 'read' | 'write' | 'destructive' | 'stream'

export type CommandParamKey =
  | 'organizationId' | 'programId' | 'environmentId' | 'pipelineId' | 'executionId'
  | 'action' | 'service' | 'days' | 'logName' | 'outputDirectory' | 'output' | 'file'
  | 'contentFlowId' | 'contentSetId' | 'destinationEnvironmentId' | 'includeAcl' | 'tier'
  | 'ipAllowlistId' | 'cidr' | 'name' | 'limit' | 'branch' | 'repositoryId' | 'tag'
  | 'devEnvironmentId' | 'stageEnvironmentId' | 'prodEnvironmentId' | 'emergency' | 'variablesJson' | 'enabledOnly'

export type CommandParams = Partial<Record<CommandParamKey, string>>

export interface CommandField {
  key: CommandParamKey
  label: string
  placeholder?: string
  type?: 'text' | 'number' | 'select' | 'textarea'
  options?: string[]
  required?: boolean
  context?: boolean
}

export interface CommandDefinition {
  id: CommandId
  label: string
  description: string
  group: CommandGroup
  method: HttpMethod
  fields: CommandField[]
  risk: CommandRisk
  confirm?: string
  stdinParam?: CommandParamKey
  longRunning?: boolean
  buildArgs: (params: CommandParams) => string[]
}

const required = (params: CommandParams, key: CommandParamKey) => {
  const value = params[key]?.trim()
  if (!value) throw new Error(`Parametro obbligatorio: ${key}`)
  return value
}

const withProgram = (params: CommandParams) => ['--programId', required(params, 'programId')]
const optional = (params: CommandParams, key: CommandParamKey, flag: string) => {
  const value = params[key]?.trim()
  return value ? [flag, value] : []
}
const field = (key: CommandParamKey, label: string, placeholder?: string, options?: string[], isRequired = true): CommandField => ({
  key,
  label,
  placeholder,
  type: options ? 'select' : key === 'days' || key === 'limit' ? 'number' : key === 'variablesJson' ? 'textarea' : 'text',
  options,
  required: isRequired
})

const contextField = (key: CommandParamKey, label: string): CommandField => ({ ...field(key, label), context: true })
const programFields: CommandField[] = [contextField('programId', 'Program selezionato')]
const environmentField = contextField('environmentId', 'Environment selezionato')
const pipelineField = field('pipelineId', 'Pipeline ID')
const executionField = field('executionId', 'Execution ID')
const serviceField = field('service', 'Service', undefined, ['author', 'publish', 'preview'])
const qualityGateActionField = field('action', 'Quality gate', undefined, ['codeQuality', 'security', 'performance', 'contentAudit', 'experienceAudit'])
const stepActionField = field('action', 'Pipeline step', undefined, ['build', 'codeQuality', 'devDeploy', 'stageDeploy', 'prodDeploy', 'buildImage'])
const variablesJsonField = field('variablesJson', 'Variabili JSON', '[{"name":"MY_VARIABLE","value":"value","type":"string"}]')

export const commandDefinitions: CommandDefinition[] = [
  {
    id: 'org-list', label: 'Elenca Organization', description: 'Mostra le Organization abilitate a Cloud Manager per l’utente.', group: 'organizations', method: 'GET', fields: [], risk: 'read',
    buildArgs: () => ['cloudmanager:org:list', '--json']
  },
  {
    id: 'org-select', label: 'Seleziona Organization', description: 'Imposta l’Organization Cloud Manager attiva.', group: 'organizations', method: 'POST', fields: [field('organizationId', 'Organization ID')], risk: 'write',
    buildArgs: (params) => ['cloudmanager:org:select', required(params, 'organizationId')]
  },
  {
    id: 'list-programs', label: 'Elenca programmi', description: 'Mostra i programmi Cloud Manager accessibili all’utente.', group: 'programs', method: 'GET', fields: [field('enabledOnly', 'Solo programmi abilitati', undefined, ['true', 'false'], false)], risk: 'read',
    buildArgs: (params) => ['cloudmanager:list-programs', ...params.enabledOnly === 'true' ? ['--enabledonly'] : [], '--json']
  },
  {
    id: 'delete-program', label: 'Elimina programma', description: 'Elimina il Program Cloud Manager specificato.', group: 'programs', method: 'DELETE', fields: [field('programId', 'Program ID da eliminare')], risk: 'destructive', confirm: 'Eliminare definitivamente questo Program Cloud Manager?',
    buildArgs: (params) => ['cloudmanager:program:delete', required(params, 'programId')]
  },
  {
    id: 'list-environments', label: 'Elenca ambienti', description: 'Legge gli ambienti del programma selezionato.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-environments', ...withProgram(params), '--json']
  },
  {
    id: 'list-pipelines', label: 'Elenca pipeline', description: 'Legge le pipeline configurate nel programma selezionato.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-pipelines', ...withProgram(params), '--json']
  },
  {
    id: 'list-current-executions', label: 'Esecuzioni correnti', description: 'Mostra le esecuzioni attive del programma.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-current-executions', ...withProgram(params), '--json']
  },
  {
    id: 'list-program-ip-allowlists', label: 'Elenca IP allowlist', description: 'Mostra le allowlist IP del programma.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-ip-allowlists', ...withProgram(params), '--json']
  },
  {
    id: 'list-content-sets', label: 'Elenca content set', description: 'Mostra i content set disponibili nel programma.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-content-sets', ...withProgram(params), '--json']
  },
  {
    id: 'list-content-flows', label: 'Elenca content flow', description: 'Mostra i content flow del programma.', group: 'programs', method: 'GET', fields: programFields, risk: 'read',
    buildArgs: (params) => ['cloudmanager:program:list-content-flows', ...withProgram(params), '--json']
  },
  {
    id: 'bind-environment-allowlist', label: 'Associa IP allowlist', description: 'Associa una allowlist IP a un servizio dell’ambiente.', group: 'environments', method: 'POST', fields: [environmentField, field('ipAllowlistId', 'IP allowlist ID'), serviceField], risk: 'write', confirm: 'Associare l’allowlist al servizio selezionato?',
    buildArgs: (params) => ['cloudmanager:environment:bind-ip-allowlist', required(params, 'environmentId'), required(params, 'ipAllowlistId'), required(params, 'service'), ...withProgram(params)]
  },
  {
    id: 'delete-environment', label: 'Elimina ambiente', description: 'Elimina l’ambiente Cloud Manager selezionato.', group: 'environments', method: 'DELETE', fields: [environmentField], risk: 'destructive', confirm: 'Eliminare definitivamente questo ambiente Cloud Manager?',
    buildArgs: (params) => ['cloudmanager:environment:delete', required(params, 'environmentId'), ...withProgram(params)]
  },
  {
    id: 'download-logs', label: 'Scarica log', description: 'Scarica log dell’ambiente per il servizio e l’intervallo indicati.', group: 'environments', method: 'GET', fields: [environmentField, serviceField, field('logName', 'Nome log'), field('days', 'Giorni', '1', undefined, false), field('outputDirectory', 'Cartella output', './logs', undefined, false)], risk: 'read',
    buildArgs: (params) => ['cloudmanager:environment:download-logs', required(params, 'environmentId'), required(params, 'service'), required(params, 'logName'), params.days?.trim() || '1', ...withProgram(params), '--outputDirectory', params.outputDirectory?.trim() || './logs']
  },
  {
    id: 'list-log-options', label: 'Opzioni log', description: 'Mostra i log disponibili per l’ambiente.', group: 'environments', method: 'GET', fields: [environmentField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:environment:list-available-log-options', required(params, 'environmentId'), ...withProgram(params), '--json']
  },
  {
    id: 'list-environment-allowlist-bindings', label: 'Elenca allowlist ambiente', description: 'Mostra le allowlist associate all’ambiente.', group: 'environments', method: 'GET', fields: [environmentField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:environment:list-ip-allowlist-bindings', required(params, 'environmentId'), ...withProgram(params), '--json']
  },
  {
    id: 'list-environment-variables', label: 'Variabili ambiente', description: 'Legge le variabili configurate nell’ambiente selezionato.', group: 'environments', method: 'GET', fields: [environmentField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:environment:list-variables', required(params, 'environmentId'), ...withProgram(params), '--json']
  },
  {
    id: 'open-developer-console', label: 'Apri Developer Console', description: 'Apre nel browser la Developer Console dell’ambiente, se disponibile.', group: 'environments', method: 'GET', fields: [environmentField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:environment:open-developer-console', required(params, 'environmentId'), ...withProgram(params)]
  },
  {
    id: 'set-environment-variables', label: 'Imposta variabili ambiente', description: 'Aggiorna variabili runtime usando un array JSON.', group: 'environments', method: 'PATCH', fields: [environmentField, variablesJsonField], risk: 'write', confirm: 'Applicare queste variabili runtime all’ambiente?', stdinParam: 'variablesJson',
    buildArgs: (params) => ['cloudmanager:environment:set-variables', required(params, 'environmentId'), ...withProgram(params), '--jsonStdin']
  },
  {
    id: 'tail-environment-log', label: 'Segui log ambiente', description: 'Segue in streaming il log selezionato del servizio.', group: 'environments', method: 'GET', fields: [environmentField, serviceField, field('logName', 'Nome log')], risk: 'stream', longRunning: true,
    buildArgs: (params) => ['cloudmanager:environment:tail-log', required(params, 'environmentId'), required(params, 'service'), required(params, 'logName'), ...withProgram(params)]
  },
  {
    id: 'unbind-environment-allowlist', label: 'Rimuovi IP allowlist', description: 'Rimuove l’associazione allowlist dal servizio ambiente.', group: 'environments', method: 'DELETE', fields: [environmentField, field('ipAllowlistId', 'IP allowlist ID'), serviceField], risk: 'destructive', confirm: 'Rimuovere l’allowlist dal servizio selezionato?',
    buildArgs: (params) => ['cloudmanager:environment:unbind-ip-allowlist', required(params, 'environmentId'), required(params, 'ipAllowlistId'), required(params, 'service'), ...withProgram(params)]
  },
  {
    id: 'list-pipeline-executions', label: 'Storico execution', description: 'Legge le esecuzioni recenti di una pipeline.', group: 'pipelines', method: 'GET', fields: [pipelineField, field('limit', 'Numero execution', '20', undefined, false)], risk: 'read',
    buildArgs: (params) => ['cloudmanager:pipeline:list-executions', required(params, 'pipelineId'), ...withProgram(params), ...optional(params, 'limit', '--limit'), '--json']
  },
  {
    id: 'create-pipeline-execution', label: 'Avvia pipeline', description: 'Avvia una nuova esecuzione della pipeline.', group: 'pipelines', method: 'POST', fields: [pipelineField, field('emergency', 'Modalità emergency', undefined, ['false', 'true'], false)], risk: 'write', confirm: 'Avviare una nuova esecuzione della pipeline?',
    buildArgs: (params) => ['cloudmanager:pipeline:create-execution', required(params, 'pipelineId'), ...withProgram(params), ...(params.emergency === 'true' ? ['--emergency'] : [])]
  },
  {
    id: 'delete-pipeline', label: 'Elimina pipeline', description: 'Elimina la pipeline selezionata.', group: 'pipelines', method: 'DELETE', fields: [pipelineField], risk: 'destructive', confirm: 'Eliminare definitivamente questa pipeline?',
    buildArgs: (params) => ['cloudmanager:pipeline:delete', required(params, 'pipelineId'), ...withProgram(params)]
  },
  {
    id: 'invalidate-pipeline-cache', label: 'Invalida cache pipeline', description: 'Invalida la cache della pipeline.', group: 'pipelines', method: 'POST', fields: [pipelineField], risk: 'write', confirm: 'Invalidare la cache della pipeline?',
    buildArgs: (params) => ['cloudmanager:pipeline:invalidate-cache', required(params, 'pipelineId'), ...withProgram(params)]
  },
  {
    id: 'list-pipeline-variables', label: 'Variabili pipeline', description: 'Legge le variabili build-time della pipeline.', group: 'pipelines', method: 'GET', fields: [pipelineField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:pipeline:list-variables', required(params, 'pipelineId'), ...withProgram(params), '--json']
  },
  {
    id: 'set-pipeline-variables', label: 'Imposta variabili pipeline', description: 'Aggiorna variabili build-time usando un array JSON.', group: 'pipelines', method: 'PATCH', fields: [pipelineField, variablesJsonField], risk: 'write', confirm: 'Applicare queste variabili build-time alla pipeline?', stdinParam: 'variablesJson',
    buildArgs: (params) => ['cloudmanager:pipeline:set-variables', required(params, 'pipelineId'), ...withProgram(params), '--jsonStdin']
  },
  {
    id: 'update-pipeline', label: 'Aggiorna pipeline', description: 'Modifica branch, repository, tag o ambienti associati.', group: 'pipelines', method: 'PATCH', fields: [pipelineField, field('branch', 'Branch', undefined, undefined, false), field('repositoryId', 'Repository ID', undefined, undefined, false), field('tag', 'Tag', undefined, undefined, false), field('devEnvironmentId', 'Dev Environment ID', undefined, undefined, false), field('stageEnvironmentId', 'Stage Environment ID', undefined, undefined, false), field('prodEnvironmentId', 'Prod Environment ID', undefined, undefined, false)], risk: 'write', confirm: 'Applicare le modifiche alla configurazione della pipeline?',
    buildArgs: (params) => ['cloudmanager:pipeline:update', required(params, 'pipelineId'), ...withProgram(params), ...optional(params, 'branch', '--branch'), ...optional(params, 'repositoryId', '--repositoryId'), ...optional(params, 'tag', '--tag'), ...optional(params, 'devEnvironmentId', '--devEnvironmentId'), ...optional(params, 'stageEnvironmentId', '--stageEnvironmentId'), ...optional(params, 'prodEnvironmentId', '--prodEnvironmentId')]
  },
  {
    id: 'get-current-execution', label: 'Execution corrente', description: 'Legge lo stato dell’esecuzione corrente della pipeline.', group: 'executions', method: 'GET', fields: [pipelineField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:current-execution:get', required(params, 'pipelineId'), ...withProgram(params), '--json']
  },
  {
    id: 'advance-current-execution', label: 'Avanza execution', description: 'Avanza uno step in attesa di approvazione o quality gate.', group: 'executions', method: 'POST', fields: [pipelineField], risk: 'write', confirm: 'Avanzare l’esecuzione corrente della pipeline?',
    buildArgs: (params) => ['cloudmanager:current-execution:advance', required(params, 'pipelineId'), ...withProgram(params)]
  },
  {
    id: 'cancel-current-execution', label: 'Annulla execution', description: 'Annulla lo step o rifiuta l’approvazione/quality gate corrente.', group: 'executions', method: 'DELETE', fields: [pipelineField], risk: 'destructive', confirm: 'Annullare o rifiutare l’esecuzione corrente?',
    buildArgs: (params) => ['cloudmanager:current-execution:cancel', required(params, 'pipelineId'), ...withProgram(params)]
  },
  {
    id: 'get-quality-gate-results', label: 'Risultati quality gate', description: 'Legge i risultati del quality gate selezionato.', group: 'executions', method: 'GET', fields: [pipelineField, executionField, qualityGateActionField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:execution:get-quality-gate-results', required(params, 'pipelineId'), required(params, 'executionId'), required(params, 'action'), ...withProgram(params), '--json']
  },
  {
    id: 'get-step-details', label: 'Dettaglio step', description: 'Legge i dettagli di un’esecuzione. Il comando non richiede un parametro action.', group: 'executions', method: 'GET', fields: [pipelineField, executionField], risk: 'read',
    buildArgs: (params) => ['cloudmanager:execution:get-step-details', required(params, 'pipelineId'), required(params, 'executionId'), ...withProgram(params), '--json']
  },
  {
    id: 'get-step-log', label: 'Leggi log step', description: 'Recupera il log di uno step di pipeline.', group: 'executions', method: 'GET', fields: [pipelineField, executionField, stepActionField, field('file', 'File alternativo', undefined, undefined, false), field('output', 'Percorso output', undefined, undefined, false)], risk: 'read',
    buildArgs: (params) => ['cloudmanager:execution:get-step-log', required(params, 'pipelineId'), required(params, 'executionId'), required(params, 'action'), ...withProgram(params), ...optional(params, 'file', '--file'), ...optional(params, 'output', '--output')]
  },
  {
    id: 'tail-step-log', label: 'Segui log step', description: 'Segue in streaming il log dello step build.', group: 'executions', method: 'GET', fields: [pipelineField, field('action', 'Pipeline step', 'build', ['build'], false)], risk: 'stream', longRunning: true,
    buildArgs: (params) => ['cloudmanager:execution:tail-step-log', required(params, 'pipelineId'), params.action?.trim() || 'build', ...withProgram(params)]
  },
  {
    id: 'cancel-content-flow', label: 'Annulla content flow', description: 'Annulla un content flow in esecuzione.', group: 'content', method: 'DELETE', fields: [field('contentFlowId', 'Content Flow ID')], risk: 'destructive', confirm: 'Annullare questo content flow?',
    buildArgs: (params) => ['cloudmanager:content-flow:cancel', required(params, 'contentFlowId'), ...withProgram(params)]
  },
  {
    id: 'create-content-flow', label: 'Crea content flow', description: 'Crea un trasferimento contenuti tra ambienti.', group: 'content', method: 'POST', fields: [environmentField, field('contentSetId', 'Content Set ID'), field('destinationEnvironmentId', 'Environment di destinazione'), field('includeAcl', 'Includi ACL', undefined, ['true', 'false']), field('tier', 'Tier', 'author', ['author', 'publish'], false)], risk: 'write', confirm: 'Creare un content flow verso l’ambiente selezionato?',
    buildArgs: (params) => ['cloudmanager:content-flow:create', required(params, 'environmentId'), required(params, 'contentSetId'), required(params, 'destinationEnvironmentId'), required(params, 'includeAcl'), params.tier?.trim() || 'author', ...withProgram(params)]
  },
  {
    id: 'get-content-flow', label: 'Dettaglio content flow', description: 'Legge i dettagli di un content flow.', group: 'content', method: 'GET', fields: [field('contentFlowId', 'Content Flow ID')], risk: 'read',
    buildArgs: (params) => ['cloudmanager:content-flow:get', required(params, 'contentFlowId'), ...withProgram(params), '--json']
  },
  {
    id: 'delete-content-set', label: 'Elimina content set', description: 'Elimina il content set selezionato.', group: 'content', method: 'DELETE', fields: [field('contentSetId', 'Content Set ID')], risk: 'destructive', confirm: 'Eliminare definitivamente questo content set?',
    buildArgs: (params) => ['cloudmanager:content-set:delete', required(params, 'contentSetId'), ...withProgram(params)]
  },
  {
    id: 'get-content-set', label: 'Dettaglio content set', description: 'Legge i dettagli di un content set.', group: 'content', method: 'GET', fields: [field('contentSetId', 'Content Set ID')], risk: 'read',
    buildArgs: (params) => ['cloudmanager:content-set:get', required(params, 'contentSetId'), ...withProgram(params), '--json']
  },
  {
    id: 'create-ip-allowlist', label: 'Crea IP allowlist', description: 'Crea una allowlist con il blocco CIDR specificato.', group: 'ip-allowlists', method: 'POST', fields: [field('name', 'Nome'), field('cidr', 'Blocco CIDR', '192.0.2.0/24')], risk: 'write', confirm: 'Creare questa IP allowlist?',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:create', required(params, 'name'), '--cidr', required(params, 'cidr'), ...withProgram(params)]
  },
  {
    id: 'delete-ip-allowlist', label: 'Elimina IP allowlist', description: 'Elimina la allowlist IP selezionata.', group: 'ip-allowlists', method: 'DELETE', fields: [field('ipAllowlistId', 'IP allowlist ID')], risk: 'destructive', confirm: 'Eliminare definitivamente questa IP allowlist?',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:delete', required(params, 'ipAllowlistId'), ...withProgram(params)]
  },
  {
    id: 'get-ip-allowlist-binding-details', label: 'Dettaglio binding allowlist', description: 'Legge i dettagli dei binding dell’allowlist.', group: 'ip-allowlists', method: 'GET', fields: [field('ipAllowlistId', 'IP allowlist ID')], risk: 'read',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:get-binding-details', required(params, 'ipAllowlistId'), ...withProgram(params), '--json']
  },
  {
    id: 'bind-ip-allowlist', label: 'Associa IP allowlist', description: 'Associa una allowlist IP a un ambiente e servizio.', group: 'ip-allowlists', method: 'POST', fields: [field('ipAllowlistId', 'IP allowlist ID'), environmentField, serviceField], risk: 'write', confirm: 'Associare l’allowlist all’ambiente selezionato?',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:bind', required(params, 'ipAllowlistId'), required(params, 'environmentId'), required(params, 'service'), ...withProgram(params)]
  },
  {
    id: 'unbind-ip-allowlist', label: 'Rimuovi binding allowlist', description: 'Rimuove un’associazione allowlist da un ambiente.', group: 'ip-allowlists', method: 'DELETE', fields: [field('ipAllowlistId', 'IP allowlist ID'), environmentField, serviceField], risk: 'destructive', confirm: 'Rimuovere questo binding IP allowlist?',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:unbind', required(params, 'ipAllowlistId'), required(params, 'environmentId'), required(params, 'service'), ...withProgram(params)]
  },
  {
    id: 'update-ip-allowlist', label: 'Aggiorna IP allowlist', description: 'Sostituisce i blocchi CIDR dell’allowlist.', group: 'ip-allowlists', method: 'PATCH', fields: [field('ipAllowlistId', 'IP allowlist ID'), field('cidr', 'Blocco CIDR', '192.0.2.0/24')], risk: 'write', confirm: 'Sostituire i blocchi CIDR di questa allowlist?',
    buildArgs: (params) => ['cloudmanager:ip-allowlist:update', required(params, 'ipAllowlistId'), '--cidr', required(params, 'cidr'), ...withProgram(params), '--json']
  }
]

export const commandGroups: { id: CommandGroup; label: string; shortLabel: string }[] = [
  { id: 'organizations', label: 'Organization', shortLabel: 'Org' },
  { id: 'programs', label: 'Programmi', shortLabel: 'Programmi' },
  { id: 'environments', label: 'Ambienti', shortLabel: 'Ambienti' },
  { id: 'pipelines', label: 'Pipeline', shortLabel: 'Pipeline' },
  { id: 'executions', label: 'Execution', shortLabel: 'Execution' },
  { id: 'content', label: 'Contenuti', shortLabel: 'Contenuti' },
  { id: 'ip-allowlists', label: 'IP allowlist', shortLabel: 'IP' }
]
