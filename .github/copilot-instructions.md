# Dependency Impact Visualizer - VS Code Extension

A VS Code extension that provides real-time visualization of code dependencies and impact analysis.

## Features Implemented

- ✅ Real-time dependency impact analysis
- ✅ Visual graph showing affected files and components
- ✅ Context menu integration for quick access
- ✅ Type-based classification (functions, classes, variables, tests, components)
- ✅ Interactive navigation to affected code locations
- ✅ Webview panel with beautiful visualization

## Project Structure

```
.
├── src/
│   ├── extension.ts          # Main extension logic
│   └── test/
│       └── extension.test.ts  # Tests
├── package.json               # Extension manifest
├── tsconfig.json             # TypeScript config
├── esbuild.js                # Bundler configuration
└── README.md                 # Documentation
```

## Development

- **Run Extension**: Press `F5` to start debugging
- **Compile**: `npm run compile`
- **Watch Mode**: `npm run watch`
- **Run Tests**: `npm test`

## How to Test

1. Press `F5` to open Extension Development Host
2. Open any code project in the new window
3. Place cursor on a function/class/variable
4. Right-click → "Analyze Symbol Impact"
5. View the visualization panel

## Key Technologies

- TypeScript
- VS Code Extension API
- Webview API for visualization
- Language Server Protocol for reference finding
