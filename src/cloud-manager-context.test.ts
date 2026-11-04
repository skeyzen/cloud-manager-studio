import assert from 'node:assert/strict'
import test from 'node:test'
import { isOrganizationSelectLocked, needsCloudManagerContextEdit } from './cloud-manager-context'

test('keeps Organization editable when no options were loaded', () => {
  assert.equal(isOrganizationSelectLocked(true, false), false)
})

test('unlocks context when saved IDs are absent from freshly loaded resource lists', () => {
  const savedContext = { organizationId: 'org-1', programId: 'program-1', environmentId: 'environment-1' }
  const organizations = [{ id: 'org-1' }]

  assert.equal(needsCloudManagerContextEdit(savedContext, organizations, [], []), true)
})

test('keeps a fully verified context locked until the user chooses Edit', () => {
  const savedContext = { organizationId: 'org-1', programId: 'program-1', environmentId: 'environment-1' }

  assert.equal(needsCloudManagerContextEdit(savedContext, [{ id: 'org-1' }], [{ id: 'program-1' }], [{ id: 'environment-1' }]), false)
})