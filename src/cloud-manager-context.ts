export interface ContextResource {
  id: string
}

export interface CloudManagerContextIds {
  organizationId: string
  programId: string
  environmentId: string
}

export function isOrganizationSelectLocked(editingContext: boolean, selectingOrganization: boolean) {
  return !editingContext || selectingOrganization
}

export function needsCloudManagerContextEdit(context: CloudManagerContextIds, organizations: ContextResource[], programs: ContextResource[], environments: ContextResource[]) {
  return !context.organizationId
    || !context.programId
    || !context.environmentId
    || !organizations.some((organization) => organization.id === context.organizationId)
    || !programs.some((program) => program.id === context.programId)
    || !environments.some((environment) => environment.id === context.environmentId)
}