import { existsSync } from 'node:fs'
import path from 'node:path'
import { setupActionOptions, type SetupActionId } from '../shared/setup-actions'

const actionById = new Map<SetupActionId, typeof setupActionOptions[number]>(setupActionOptions.map((action) => [action.id, action]))

const powerShellOperations: Record<SetupActionId, string> = {
  'check-runtime': "$commands = Get-Command -Name node, npm, aio -ErrorAction SilentlyContinue; if ($commands) { $commands | Select-Object Name, Source | Format-Table -AutoSize } else { Write-Host 'Node.js, npm e AIO CLI non sono stati trovati nel PATH.' }",
  'install-node': "& winget install --id OpenJS.NodeJS.LTS --exact; if ($LASTEXITCODE -ne 0) { throw \"winget è terminato con exit $LASTEXITCODE\" }",
  'install-aio-cli': "& npm install --global @adobe/aio-cli@11.2.0; if ($LASTEXITCODE -ne 0) { throw \"npm è terminato con exit $LASTEXITCODE\" }",
  'install-cloudmanager-plugin': "& aio plugins:install @adobe/aio-cli-plugin-cloudmanager@4.2.4; if ($LASTEXITCODE -ne 0) { throw \"aio è terminato con exit $LASTEXITCODE\" }"
}

export interface CliProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

export type CliToolbox = 'cloudmanager' | 'appbuilder'

export function getSetupAction(actionId: unknown) {
  if (typeof actionId !== 'string') return undefined
  return actionById.get(actionId as SetupActionId)
}

export function buildPowerShellSetupScript(actionId: unknown) {
  const action = getSetupAction(actionId)
  if (!action) return undefined

  const operation = powerShellOperations[action.id]
  return [
    "$ErrorActionPreference = 'Stop'",
    `Write-Host 'Cloud Manager Studio: ${action.label.replaceAll("'", "''")}'`,
    `Write-Host 'Comando selezionato: ${action.command.replaceAll("'", "''")}'`,
    "$confirmation = Read-Host 'Digita INSTALL per eseguire il comando'",
    "if ($confirmation -cne 'INSTALL') {",
    "  Write-Host 'Operazione annullata.'",
    '} else {',
    `  ${operation}`,
    '}',
    "Read-Host 'Premi INVIO per chiudere' | Out-Null"
  ].join('\r\n')
}

export function isMissingCliDependency(result: CliProcessResult) {
  if (result.code === 0) return false
  const output = `${result.stderr}\n${result.stdout}`
  return /\bENOENT\b|MODULE_NOT_FOUND|Cannot find (?:module|package)|command not found|is not recognized as an internal or external command|No such file or directory/i.test(output)
}

export function getMissingBundledComponents(
  appPath: string,
  isPackaged: boolean,
  toolbox: CliToolbox,
  exists: (entryPath: string) => boolean = existsSync
) {
  if (!isPackaged) return []

  const requiredEntries = [
    { entry: ['node_modules', '@adobe', 'aio-cli', 'bin', 'run'], label: 'Adobe I/O CLI' },
    ...(toolbox === 'cloudmanager'
      ? [{ entry: ['node_modules', '@adobe', 'aio-cli-plugin-cloudmanager', 'bin', 'run'], label: 'Cloud Manager CLI plugin' }]
      : [{ entry: ['node_modules', '@adobe', 'aio-cli-plugin-console', 'package.json'], label: 'Adobe I/O Console plugin' }])
  ]

  return requiredEntries
    .filter(({ entry }) => !exists(path.join(appPath, ...entry)))
    .map(({ label }) => label)
}