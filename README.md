# rcasm-lsp

Relay Computer Assembly language server for use in VSCode.

Heavily inspired by <https://github.com/grahambates/m68k-lsp>

- Suitable for use with LSP supporting editors
- Includes VS Code extension
- Provides an LSP to <https://github.com/paul80nd/relay-computer-ide>

## Functionality

This Language Server works for rcasm files. It has the following language features:

- Auto-completion:
  - Instruction mnemonics
  - Assembler directives
    <!-- - Registers -->
    <!-- - Symbols -->
- Code Linting
  - Parser errors
  - Assembly errors
  <!-- - Processor support -->
- Code Folding
<!-- - Document Formatting -->
- Document Highlights
<!-- - Document Links -->
- Document Symbols
- Find References
- Go to definition
- Hover
  - Instruction/directive documentation
  - Symbol info
  <!-- - Multiple workspaces -->
- Rename Symbols
<!-- - Signature Help -->

## Structure

```text
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running in VSCode

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a document in 'rcasm' language mode.
