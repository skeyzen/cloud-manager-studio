# Contesto del progetto
- **Tipo:** suite desktop multi-toolbox per Adobe I/O Cloud Manager e Adobe App Builder tramite CLI locale.
- **Stack:** TypeScript, React e Vite nel renderer; Electron con runtime Node.js nei processi main e preload.

## Struttura
- `index.html` -> `src/main.tsx`: entry point HTML e bootstrap React; `src/App.tsx` contiene welcome, switcher toolbox, i contesti Cloud Manager Organization/Program/Environment e App Builder Organization/Project/Workspace, invocazione e output.
- `src/styles.css`: stili del renderer. `src/output-search.ts`: ricerca testuale e regex nell'output.
- `shared/command-catalog.ts`: catalogo condiviso di gruppi, campi, rischi, conferme e funzioni `buildArgs`; è consumato sia dal renderer sia dal processo Electron main.
- `src/types.ts`: tipi applicativi e contratto globale tipizzato `window.aio` esposto al renderer.
- `electron/preload.ts` -> `electron/main.ts`: il preload espone un bridge ristretto con `contextBridge` e IPC; il main gestisce sessione e configurazione CLI, richieste IPC e finestra Electron. La finestra abilita `contextIsolation` e disabilita `nodeIntegration`.
- `electron/aio-process-runner.ts`: esegue il processo CLI, raccoglie o inoltra stdout/stderr e gestisce timeout e cancellazione; `electron/main.ts` inoltra log e output al renderer tramite IPC.
- `dist/` e `dist-electron/`: output generati rispettivamente per renderer e processi Electron; le sorgenti corrispondenti sono in `src/`, `shared/` ed `electron/`.

## Dipendenze
- React e React DOM: interfaccia renderer; Vite e `@vitejs/plugin-react`: sviluppo e bundle del renderer.
- Electron: finestra desktop, processi main/preload e IPC; TypeScript: tipi e compilazione separata per renderer e processi Electron (`tsconfig.json`, `tsconfig.electron.json`).
- Adobe I/O CLI (`aio`, oppure `aio.cmd` su Windows): dipendenza esterna invocata dal main process per autenticazione e toolbox. Cloud Manager richiede il plugin Cloud Manager; App Builder Developer Console context richiede il plugin Console. La disponibilità dipende dall'installazione e dalla sessione CLI locale.

## Flusso tecnico
- `index.html` -> `src/main.tsx` -> `src/App.tsx` -> `window.aio` (`electron/preload.ts`) -> handler IPC in `electron/main.ts` -> Cloud Manager catalog / Developer Console list commands / `electron/aio-process-runner.ts` -> CLI `aio`.
- Risultati, output in streaming e log ritornano al renderer via IPC; il renderer non avvia direttamente processi di sistema.