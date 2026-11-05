export const setupActionOptions = [
  {
    id: 'check-runtime',
    label: 'Verifica Node.js, npm e AIO CLI',
    command: 'Get-Command node, npm, aio -ErrorAction SilentlyContinue | Select-Object Name, Source'
  },
  {
    id: 'install-node',
    label: 'Installa Node.js LTS con winget',
    command: 'winget install --id OpenJS.NodeJS.LTS --exact'
  },
  {
    id: 'install-aio-cli',
    label: 'Installa Adobe I/O CLI con npm',
    command: 'npm install --global @adobe/aio-cli@11.2.0'
  },
  {
    id: 'install-cloudmanager-plugin',
    label: 'Installa il plugin Cloud Manager con AIO CLI',
    command: 'aio plugins:install @adobe/aio-cli-plugin-cloudmanager@4.2.4'
  }
] as const

export type SetupActionId = typeof setupActionOptions[number]['id']