import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { buildPowerShellSetupScript, getMissingBundledComponents, getSetupAction, isMissingCliDependency } from './setup-actions'

test('repair actions expose only the predefined PowerShell operations', () => {
  const action = getSetupAction('install-aio-cli')

  assert.equal(action?.command, 'npm install --global @adobe/aio-cli@11.2.0')
  assert.equal(getSetupAction('install-anything') , undefined)
  assert.equal(buildPowerShellSetupScript('install-anything; Remove-Item *'), undefined)
})

test('PowerShell repair script shows the selected command and requires confirmation', () => {
  const script = buildPowerShellSetupScript('install-cloudmanager-plugin')

  assert.match(script ?? '', /Comando selezionato: aio plugins:install @adobe\/aio-cli-plugin-cloudmanager@4\.2\.4/)
  assert.match(script ?? '', /Read-Host 'Digita INSTALL per eseguire il comando'/)
  assert.match(script ?? '', /if \(\$confirmation -cne 'INSTALL'\)/)
  assert.doesNotMatch(script ?? '', /Invoke-Expression/)
})

test('only missing executable and module errors trigger setup recovery', () => {
  assert.equal(isMissingCliDependency({ code: null, stdout: '', stderr: 'spawn aio.cmd ENOENT' }), true)
  assert.equal(isMissingCliDependency({ code: 1, stdout: '', stderr: "Cannot find module '@adobe/aio-cli-plugin-console'" }), true)
  assert.equal(isMissingCliDependency({ code: 0, stdout: 'Version 11.2.0', stderr: "Warning: MODULE_NOT_FOUND for an optional command" }), false)
  assert.equal(isMissingCliDependency({ code: 10, stdout: '', stderr: 'IMS authentication required' }), false)
})

test('bundled preflight checks only the components required by the selected toolbox', () => {
  const existingEntries = new Set<string>()
  const checkedPaths: string[] = []
  const exists = (entryPath: string) => {
    checkedPaths.push(entryPath)
    return existingEntries.has(entryPath)
  }

  assert.deepEqual(getMissingBundledComponents('app.asar', true, 'appbuilder', exists), ['Adobe I/O CLI', 'Adobe I/O Console plugin'])
  assert.deepEqual(getMissingBundledComponents('app.asar', true, 'cloudmanager', exists), ['Adobe I/O CLI', 'Cloud Manager CLI plugin'])
  assert.deepEqual(getMissingBundledComponents('source', false, 'cloudmanager', exists), [])
  assert.ok(checkedPaths.includes(path.join('app.asar', 'node_modules', '@adobe', 'aio-cli-plugin-console', 'package.json')))
})