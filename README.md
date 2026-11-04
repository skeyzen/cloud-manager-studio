# Cloud Manager Studio

Desktop toolbox suite for Adobe I/O workflows, built with Electron, React and TypeScript. It currently provides a Cloud Manager CLI toolbox and an App Builder Developer Console context selector.

## Requirements

- Node.js 24+
- `aio` available on PATH
- `@adobe/aio-cli-plugin-cloudmanager` for the Cloud Manager toolbox
- `@adobe/aio-cli-plugin-console` for App Builder Organization, Project and Workspace selectors
- An Adobe IMS session with the required product permissions

## Run

```powershell
npm install
npm run dev
```

For a production-like local run:

```powershell
npm run build
npm start
```

## Behavior

- Startup opens a localized welcome with the Windows account name; no Adobe CLI status check runs until a toolbox is selected.
- The logo opens the toolbox switcher. The `(?)` button attached to it opens keyboard shortcuts.
- Each toolbox triggers its own Adobe IMS session check. Logout is shared with the local Adobe I/O CLI profile.
- Cloud Manager keeps its Organization → Program → Environment context.
- App Builder uses the separate Developer Console Organization → Project → Workspace context; list operations do not change the global CLI selection.
- Cloud Manager commands are allowlisted and executed in Electron's main process through IPC. Renderer code never receives a shell handle.
- Command output is shown in the response panel and secret-like values are redacted before reaching the UI.

App Builder project scaffolding, build and deployment actions are not part of the current UI yet.

The exact command flags remain dependent on the installed CLI/plugin versions. Confirm them with `aio <command> --help` when Adobe changes the command surface.

## Credits and License

Created and maintained by [Gennaro Secondulfo](https://github.com/skeyzen).

This project is licensed under the MIT License. The license applies to the
original project code; third-party dependencies and assets remain subject to
their respective licenses. See [LICENSE](LICENSE) for the full text.

## Disclaimer

Cloud Manager Studio is an independent project. It is not affiliated with,
endorsed by, or sponsored by Adobe Inc. Adobe, Adobe I/O, and Cloud Manager are
trademarks of Adobe Inc. or its affiliates.

This software is provided "as is", without warranty of any kind. Use it only
with Adobe CLI tools and accounts you are authorized to access.
