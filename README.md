# Dependency Impact Visualizer

A VS Code extension that provides real-time visualization of code dependencies and impact analysis. See how changes to functions, classes, or variables ripple through your codebase before you make them.

## Features

- **Real-time Impact Analysis**: Instantly see which files, tests, and components are affected when you modify code
- **Visual Dependency Graph**: Beautiful, interactive visualization of code relationships
- **Context Menu Integration**: Right-click any symbol to analyze its impact
- **Type Classification**: Automatically categorizes affected code as functions, classes, variables, tests, or components
- **Click-to-Navigate**: Jump directly to any affected location from the visualization panel

## Usage

### Analyze a Symbol

1. Place your cursor on any function, class, or variable name
2. Right-click and select **"Analyze Symbol Impact"**
3. View the impact visualization in the side panel

### Use Command Palette

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type "Analyze Symbol Impact" and press Enter
3. The extension will analyze the symbol at your current cursor position

### Navigate to Affected Code

- Click any item in the visualization panel to jump to that location in your code
- The panel shows:
  - Total number of affected files
  - Total number of references
  - Breakdown by type (functions, classes, variables, tests, components)

## How It Works

The extension uses VS Code's built-in language server capabilities to:
1. Find all references to the selected symbol
2. Analyze the context of each reference
3. Classify references by type (test, component, function, etc.)
4. Display an interactive visualization

## Requirements

- VS Code version 1.109.0 or higher
- A workspace with code files (JavaScript, TypeScript, Python, etc.)

## Extension Commands

This extension contributes the following commands:

* `dependency-impact-visualizer.showImpact`: Show Dependency Impact panel
* `dependency-impact-visualizer.analyzeSymbol`: Analyze Symbol Impact at cursor

## Known Issues

- Impact analysis depends on language server accuracy for reference finding
- Large codebases may take a moment to analyze

## Development

### Running the Extension

1. Open this folder in VS Code
2. Press `F5` to open a new Extension Development Host window
3. In the new window, open a project and try the commands

### Building

```bash
npm run compile    # Compile the extension
npm run watch      # Watch for changes
npm run package    # Package for production
```

### Testing

```bash
npm test
```

## Release Notes

### 0.0.1

Initial release of Dependency Impact Visualizer:
- Real-time dependency analysis
- Visual impact graph
- Context menu integration
- Type-based classification

---

**Enjoy visualizing your code dependencies!**

## Connect With Me

- 🐙 **GitHub**: [SarthakSingh-96](https://github.com/SarthakSingh-96)
- 💼 **LinkedIn**: [Sarthak Singh](https://www.linkedin.com/in/sarthaksingh-96)
- 🌐 **Portfolio**: [sarthaksingh.dev](https://sarthaksingh.dev)
- 📧 **Email**: [sarthaksingh1211@gmail.com](mailto:sarthaksingh1211@gmail.com)

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
