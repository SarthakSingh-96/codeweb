import * as vscode from 'vscode';

// ─── Data Types ──────────────────────────────────────────────

interface DependencyNode {
	id: string;
	name: string;
	fileName: string;
	uri: string;
	line: number;
	type: 'symbol' | 'function' | 'class' | 'variable' | 'test' | 'component' | 'import' | 'type';
	references: number;
	isRoot: boolean;
}

interface DependencyLink {
	source: string;
	target: string;
	type: 'defines' | 'uses' | 'tests' | 'imports';
}

interface ImpactAnalysis {
	symbol: string;
	sourceFile: string;
	affectedFiles: number;
	totalReferences: number;
	nodes: DependencyNode[];
	links: DependencyLink[];
}

// ─── State ───────────────────────────────────────────────────

let impactPanel: vscode.WebviewPanel | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// ─── Activation ──────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
	console.log('Dependency Impact Visualizer is now active!');

	const showImpactCmd = vscode.commands.registerCommand(
		'dependency-impact-visualizer.showImpact',
		() => showImpactPanel(context)
	);

	const analyzeSymbolCmd = vscode.commands.registerCommand(
		'dependency-impact-visualizer.analyzeSymbol',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}
			await analyzeSymbolAtPosition(editor.document, editor.selection.active, context);
		}
	);

	// Debounced real-time updates while typing
	const fileWatcher = vscode.workspace.onDidChangeTextDocument(event => {
		if (impactPanel?.visible) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document === event.document) {
				if (debounceTimer) { clearTimeout(debounceTimer); }
				debounceTimer = setTimeout(async () => {
					await updateImpactInRealTime(editor.document, editor.selection.active);
				}, 500);
			}
		}
	});

	context.subscriptions.push(showImpactCmd, analyzeSymbolCmd, fileWatcher);
}

// ─── Analysis Logic ──────────────────────────────────────────

async function analyzeSymbolAtPosition(
	document: vscode.TextDocument,
	position: vscode.Position,
	context: vscode.ExtensionContext
) {
	const wordRange = document.getWordRangeAtPosition(position);
	if (!wordRange) {
		vscode.window.showInformationMessage('No symbol found at cursor position');
		return;
	}

	const symbol = document.getText(wordRange);

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `Analyzing impact of "${symbol}"...` },
		async () => {
			const locations = await vscode.commands.executeCommand<vscode.Location[]>(
				'vscode.executeReferenceProvider',
				document.uri,
				position
			);
			if (locations && locations.length > 0) {
				const analysis = await buildImpactAnalysis(symbol, document.uri, locations);
				showImpactPanel(context, analysis);
			} else {
				vscode.window.showInformationMessage(`No references found for "${symbol}"`);
			}
		}
	);
}

async function buildImpactAnalysis(
	symbol: string,
	sourceUri: vscode.Uri,
	locations: vscode.Location[]
): Promise<ImpactAnalysis> {
	const nodes: DependencyNode[] = [];
	const links: DependencyLink[] = [];
	const fileGroups = new Map<string, vscode.Location[]>();

	// Group locations by file
	for (const loc of locations) {
		const key = loc.uri.fsPath;
		if (!fileGroups.has(key)) { fileGroups.set(key, []); }
		fileGroups.get(key)!.push(loc);
	}

	const sourceFileName = sourceUri.fsPath.split(/[\\/]/).pop() || 'unknown';

	// Root node = the analyzed symbol
	const rootId = 'root';
	nodes.push({
		id: rootId,
		name: symbol,
		fileName: sourceFileName,
		uri: sourceUri.fsPath,
		line: 0,
		type: 'symbol',
		references: locations.length,
		isRoot: true
	});

	// Create a file-level node for each affected file, then individual reference nodes
	let nodeIdx = 0;
	for (const [filePath, locs] of fileGroups) {
		const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
		const fileType = classifyFile(fileName);
		const fileNodeId = `file-${nodeIdx}`;

		nodes.push({
			id: fileNodeId,
			name: fileName,
			fileName,
			uri: filePath,
			line: locs[0].range.start.line + 1,
			type: fileType,
			references: locs.length,
			isRoot: false
		});

		// Link from root → file
		const linkType = fileType === 'test' ? 'tests'
			: filePath === sourceUri.fsPath ? 'defines'
			: 'uses';
		links.push({ source: rootId, target: fileNodeId, type: linkType });

		// Individual reference nodes within each file (if more than 1 ref in file)
		if (locs.length > 1) {
			for (let i = 0; i < locs.length; i++) {
				const loc = locs[i];
				const refNodeId = `ref-${nodeIdx}-${i}`;
				const lineNum = loc.range.start.line + 1;

				let refType: DependencyNode['type'] = 'function';
				try {
					const doc = await vscode.workspace.openTextDocument(loc.uri);
					const lineText = doc.lineAt(loc.range.start.line).text.trim();
					refType = classifyLineContext(lineText, fileName);
				} catch { /* fallback */ }

				nodes.push({
					id: refNodeId,
					name: `L${lineNum}`,
					fileName,
					uri: filePath,
					line: lineNum,
					type: refType,
					references: 1,
					isRoot: false
				});
				links.push({ source: fileNodeId, target: refNodeId, type: 'uses' });
			}
		}

		nodeIdx++;
	}

	return {
		symbol,
		sourceFile: sourceFileName,
		affectedFiles: fileGroups.size,
		totalReferences: locations.length,
		nodes,
		links
	};
}

function classifyFile(fileName: string): DependencyNode['type'] {
	if (/\.(test|spec)\./i.test(fileName)) { return 'test'; }
	if (/component/i.test(fileName) || /\.(vue|svelte|jsx|tsx)$/.test(fileName)) { return 'component'; }
	if (/\.(d\.ts|types?\.)/.test(fileName)) { return 'type'; }
	return 'function';
}

function classifyLineContext(lineText: string, fileName: string): DependencyNode['type'] {
	if (/\b(import|require|from)\b/.test(lineText)) { return 'import'; }
	if (/\bclass\b/.test(lineText)) { return 'class'; }
	if (/\b(interface|type)\b/.test(lineText)) { return 'type'; }
	if (/\b(const|let|var)\b/.test(lineText)) { return 'variable'; }
	if (/\b(function|=>)\b/.test(lineText)) { return 'function'; }
	if (/\b(it|describe|test|expect)\b/.test(lineText)) { return 'test'; }
	return classifyFile(fileName);
}

// ─── Real-Time Updates ───────────────────────────────────────

async function updateImpactInRealTime(document: vscode.TextDocument, position: vscode.Position) {
	const wordRange = document.getWordRangeAtPosition(position);
	if (!wordRange || !impactPanel) { return; }

	const symbol = document.getText(wordRange);
	const locations = await vscode.commands.executeCommand<vscode.Location[]>(
		'vscode.executeReferenceProvider',
		document.uri,
		position
	);

	if (locations && locations.length > 0) {
		const analysis = await buildImpactAnalysis(symbol, document.uri, locations);
		// Send data update instead of replacing entire HTML (keeps D3 state)
		impactPanel.webview.postMessage({ command: 'updateGraph', data: analysis });
	}
}

// ─── Panel Management ────────────────────────────────────────

function showImpactPanel(context: vscode.ExtensionContext, analysis?: ImpactAnalysis) {
	if (impactPanel) {
		impactPanel.reveal(vscode.ViewColumn.Beside);
	} else {
		impactPanel = vscode.window.createWebviewPanel(
			'dependencyImpact',
			'Dependency Impact Graph',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true }
		);

		impactPanel.onDidDispose(() => { impactPanel = undefined; });

		impactPanel.webview.onDidReceiveMessage(
			async message => {
				if (message.command === 'openFile') {
					try {
						const uri = vscode.Uri.file(message.uri);
						const doc = await vscode.workspace.openTextDocument(uri);
						await vscode.window.showTextDocument(doc, {
							selection: new vscode.Range(message.line - 1, 0, message.line - 1, 0),
							preserveFocus: false
						});
					} catch (err) {
						vscode.window.showErrorMessage(`Could not open file: ${message.uri}`);
					}
				}
			},
			undefined,
			context.subscriptions
		);
	}

	impactPanel.webview.html = getWebviewContent(analysis);
}

// ─── Webview HTML with D3.js ─────────────────────────────────

function getWebviewContent(analysis?: ImpactAnalysis): string {
	const graphData = analysis
		? JSON.stringify({ nodes: analysis.nodes, links: analysis.links })
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
		: 'null';

	const summaryHtml = analysis ? `
		<div class="header">
			<h1><span class="symbol-badge">${analysis.symbol}</span></h1>
			<p class="subtitle">defined in ${analysis.sourceFile}</p>
			<div class="summary">
				<div class="summary-item">
					<span class="summary-value">${analysis.affectedFiles}</span>
					<span class="summary-label">Files</span>
				</div>
				<div class="summary-item">
					<span class="summary-value">${analysis.totalReferences}</span>
					<span class="summary-label">References</span>
				</div>
				<div class="summary-item">
					<span class="summary-value">${analysis.nodes.length}</span>
					<span class="summary-label">Nodes</span>
				</div>
			</div>
			<div class="legend" id="legend"></div>
		</div>
	` : '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dependency Impact Graph</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
	color: var(--vscode-foreground, #ccc);
	background: var(--vscode-editor-background, #1e1e1e);
	overflow: hidden;
	height: 100vh;
	display: flex;
	flex-direction: column;
}
.header {
	padding: 16px 20px 12px;
	border-bottom: 1px solid var(--vscode-panel-border, #333);
	flex-shrink: 0;
}
h1 { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
.symbol-badge {
	background: var(--vscode-textLink-foreground, #3794ff);
	color: #fff;
	padding: 3px 10px;
	border-radius: 4px;
	font-family: var(--vscode-editor-font-family, monospace);
}
.subtitle {
	font-size: 12px;
	color: var(--vscode-descriptionForeground, #888);
	margin-bottom: 10px;
}
.summary {
	display: flex;
	gap: 24px;
	margin-bottom: 10px;
}
.summary-item { text-align: center; }
.summary-value {
	display: block;
	font-size: 22px;
	font-weight: 700;
	color: var(--vscode-textLink-foreground, #3794ff);
}
.summary-label {
	font-size: 10px;
	text-transform: uppercase;
	color: var(--vscode-descriptionForeground, #888);
	letter-spacing: 0.5px;
}
.legend {
	display: flex;
	gap: 14px;
	flex-wrap: wrap;
	margin-top: 4px;
}
.legend-item {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 11px;
	color: var(--vscode-descriptionForeground, #999);
}
.legend-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
}
.graph-container {
	flex: 1;
	position: relative;
	overflow: hidden;
}
svg { width: 100%; height: 100%; }
.tooltip {
	position: absolute;
	background: var(--vscode-editorHoverWidget-background, #252526);
	border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
	padding: 8px 12px;
	border-radius: 4px;
	font-size: 12px;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s;
	z-index: 100;
	max-width: 280px;
	box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.tooltip.visible { opacity: 1; }
.tooltip-title {
	font-weight: 600;
	margin-bottom: 4px;
	font-family: var(--vscode-editor-font-family, monospace);
}
.tooltip-meta {
	color: var(--vscode-descriptionForeground, #888);
	font-size: 11px;
}
.controls {
	position: absolute;
	top: 10px;
	right: 10px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	z-index: 10;
}
.controls button {
	width: 30px;
	height: 30px;
	border: 1px solid var(--vscode-panel-border, #333);
	background: var(--vscode-input-background, #3c3c3c);
	color: var(--vscode-foreground, #ccc);
	cursor: pointer;
	border-radius: 4px;
	font-size: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
}
.controls button:hover {
	background: var(--vscode-list-hoverBackground, #2a2d2e);
}
.empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	flex-direction: column;
	color: var(--vscode-descriptionForeground, #888);
	gap: 16px;
	padding: 40px;
	text-align: center;
}
.empty-icon { font-size: 48px; opacity: 0.4; }
.empty-state .instruction {
	padding: 12px 16px;
	background: var(--vscode-textBlockQuote-background, #222);
	border-left: 3px solid var(--vscode-textLink-foreground, #3794ff);
	text-align: left;
	font-size: 13px;
}
</style>
</head>
<body>
${analysis ? `
${summaryHtml}
<div class="graph-container" id="graphContainer">
	<div class="controls">
		<button onclick="zoomIn()" title="Zoom In">+</button>
		<button onclick="zoomOut()" title="Zoom Out">&minus;</button>
		<button onclick="zoomReset()" title="Reset">&#8634;</button>
	</div>
	<div class="tooltip" id="tooltip">
		<div class="tooltip-title" id="tooltipTitle"></div>
		<div class="tooltip-meta" id="tooltipMeta"></div>
	</div>
	<svg id="graph"></svg>
</div>
` : `
<div class="empty-state">
	<div class="empty-icon">&#9670;</div>
	<h2>Dependency Impact Visualizer</h2>
	<p>Position your cursor on a symbol and analyze its impact</p>
	<div class="instruction">
		<strong>Right-click</strong> on any function, class, or variable<br>
		→ Select <strong>"Analyze Symbol Impact"</strong>
	</div>
</div>
`}

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const vscodeApi = acquireVsCodeApi();

const TYPE_COLORS = {
	symbol:    '#ff6b6b',
	function:  '#4CAF50',
	class:     '#2196F3',
	variable:  '#FF9800',
	test:      '#9C27B0',
	component: '#00BCD4',
	import:    '#FFEB3B',
	type:      '#E91E63'
};

const TYPE_LABELS = {
	symbol:    'Analyzed Symbol',
	function:  'Function',
	class:     'Class',
	variable:  'Variable',
	test:      'Test',
	component: 'Component',
	import:    'Import',
	type:      'Type / Interface'
};

const LINK_COLORS = {
	defines: '#4CAF50',
	uses:    '#3794ff',
	tests:   '#9C27B0',
	imports: '#FFEB3B'
};

// ── Build legend ───────────────────────────────
function buildLegend(nodes) {
	const legendEl = document.getElementById('legend');
	if (!legendEl) return;
	const types = [...new Set(nodes.map(n => n.type))];
	legendEl.innerHTML = types.map(t =>
		'<div class="legend-item"><div class="legend-dot" style="background:' + TYPE_COLORS[t] + '"></div>' + TYPE_LABELS[t] + '</div>'
	).join('');
}

// ── D3 Graph Rendering ────────────────────────
let simulation, svg, g, zoomBehaviour, currentData;

function renderGraph(data) {
	if (!data) return;
	currentData = data;
	buildLegend(data.nodes);

	const container = document.getElementById('graphContainer');
	if (!container) return;
	const width = container.clientWidth;
	const height = container.clientHeight;

	// Clear previous
	d3.select('#graph').selectAll('*').remove();

	svg = d3.select('#graph').attr('viewBox', [0, 0, width, height]);

	// Zoom
	zoomBehaviour = d3.zoom()
		.scaleExtent([0.2, 5])
		.on('zoom', (event) => g.attr('transform', event.transform));
	svg.call(zoomBehaviour);

	g = svg.append('g');

	// Arrowhead markers for each link type
	const defs = svg.append('defs');
	Object.entries(LINK_COLORS).forEach(([type, color]) => {
		defs.append('marker')
			.attr('id', 'arrow-' + type)
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 20)
			.attr('refY', 0)
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.attr('orient', 'auto')
			.append('path')
			.attr('d', 'M0,-5L10,0L0,5')
			.attr('fill', color)
			.attr('opacity', 0.6);
	});

	// Links
	const link = g.append('g')
		.selectAll('line')
		.data(data.links)
		.join('line')
		.attr('stroke', d => LINK_COLORS[d.type] || '#555')
		.attr('stroke-opacity', 0.5)
		.attr('stroke-width', d => d.type === 'defines' ? 2.5 : 1.5)
		.attr('stroke-dasharray', d => d.type === 'tests' ? '5,3' : null)
		.attr('marker-end', d => 'url(#arrow-' + d.type + ')');

	// Nodes
	const node = g.append('g')
		.selectAll('g')
		.data(data.nodes)
		.join('g')
		.attr('cursor', 'pointer')
		.call(d3.drag()
			.on('start', dragStart)
			.on('drag', dragging)
			.on('end', dragEnd));

	// Node circles
	node.append('circle')
		.attr('r', d => d.isRoot ? 22 : (d.name.startsWith('L') ? 6 : 12 + Math.min(d.references * 2, 10)))
		.attr('fill', d => TYPE_COLORS[d.type] || '#666')
		.attr('stroke', d => d.isRoot ? '#fff' : 'rgba(255,255,255,0.15)')
		.attr('stroke-width', d => d.isRoot ? 3 : 1.5)
		.attr('opacity', 0.9);

	// Glow effect on root
	node.filter(d => d.isRoot)
		.select('circle')
		.attr('filter', 'url(#glow)');

	// Glow filter
	const filter = defs.append('filter').attr('id', 'glow');
	filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
	const feMerge = filter.append('feMerge');
	feMerge.append('feMergeNode').attr('in', 'coloredBlur');
	feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

	// Labels (only for file-level and root nodes)
	node.filter(d => !d.name.startsWith('L'))
		.append('text')
		.text(d => d.isRoot ? d.name : d.name)
		.attr('dy', d => d.isRoot ? 34 : 24)
		.attr('text-anchor', 'middle')
		.attr('fill', 'var(--vscode-foreground, #ccc)')
		.attr('font-size', d => d.isRoot ? '13px' : '10px')
		.attr('font-weight', d => d.isRoot ? '700' : '400')
		.attr('font-family', 'var(--vscode-editor-font-family, monospace)')
		.attr('pointer-events', 'none');

	// Tooltip & click
	node.on('mouseover', function(event, d) {
		showTooltip(event, d);
		d3.select(this).select('circle').transition().duration(150).attr('opacity', 1).attr('stroke-width', 3);
		// Highlight connected links
		link.attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.15);
	})
	.on('mousemove', function(event) {
		moveTooltip(event);
	})
	.on('mouseout', function() {
		hideTooltip();
		d3.select(this).select('circle').transition().duration(150).attr('opacity', 0.9).attr('stroke-width', d => d.isRoot ? 3 : 1.5);
		link.attr('stroke-opacity', 0.5);
	})
	.on('click', function(event, d) {
		if (!d.isRoot && d.uri) {
			vscodeApi.postMessage({ command: 'openFile', uri: d.uri, line: d.line });
		}
	});

	// Force simulation
	simulation = d3.forceSimulation(data.nodes)
		.force('link', d3.forceLink(data.links).id(d => d.id).distance(d => {
			if (d.type === 'defines') return 80;
			if (d.source.isRoot || d.target.isRoot) return 140;
			return 60;
		}))
		.force('charge', d3.forceManyBody().strength(d => d.isRoot ? -400 : -150))
		.force('center', d3.forceCenter(width / 2, height / 2))
		.force('collision', d3.forceCollide().radius(d => d.isRoot ? 40 : 20))
		.on('tick', () => {
			link
				.attr('x1', d => d.source.x)
				.attr('y1', d => d.source.y)
				.attr('x2', d => d.target.x)
				.attr('y2', d => d.target.y);
			node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
		});

	// Animate nodes in
	node.attr('opacity', 0)
		.transition()
		.delay((d, i) => i * 30)
		.duration(400)
		.attr('opacity', 1);
}

// ── Tooltip ──────────────────────────────────
function showTooltip(event, d) {
	const tt = document.getElementById('tooltip');
	const title = document.getElementById('tooltipTitle');
	const meta = document.getElementById('tooltipMeta');
	title.textContent = d.isRoot ? d.name + ' (source)' : d.fileName + ':' + d.line;
	meta.textContent = TYPE_LABELS[d.type] + ' · ' + d.references + ' reference' + (d.references !== 1 ? 's' : '');
	tt.classList.add('visible');
	moveTooltip(event);
}

function moveTooltip(event) {
	const tt = document.getElementById('tooltip');
	const container = document.getElementById('graphContainer');
	const rect = container.getBoundingClientRect();
	tt.style.left = (event.clientX - rect.left + 15) + 'px';
	tt.style.top = (event.clientY - rect.top - 10) + 'px';
}

function hideTooltip() {
	document.getElementById('tooltip').classList.remove('visible');
}

// ── Drag ─────────────────────────────────────
function dragStart(event, d) {
	if (!event.active) simulation.alphaTarget(0.3).restart();
	d.fx = d.x; d.fy = d.y;
}
function dragging(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) {
	if (!event.active) simulation.alphaTarget(0);
	d.fx = null; d.fy = null;
}

// ── Zoom Controls ────────────────────────────
function zoomIn() {
	svg.transition().duration(300).call(zoomBehaviour.scaleBy, 1.4);
}
function zoomOut() {
	svg.transition().duration(300).call(zoomBehaviour.scaleBy, 0.7);
}
function zoomReset() {
	const container = document.getElementById('graphContainer');
	svg.transition().duration(500).call(
		zoomBehaviour.transform,
		d3.zoomIdentity.translate(container.clientWidth / 2, container.clientHeight / 2).scale(1).translate(-container.clientWidth / 2, -container.clientHeight / 2)
	);
}

// ── Message handler for real-time updates ────
window.addEventListener('message', event => {
	const msg = event.data;
	if (msg.command === 'updateGraph' && msg.data) {
		renderGraph(msg.data);
	}
});

// ── Initial Render ───────────────────────────
const initialData = JSON.parse('${graphData}');
if (initialData) {
	// Wait for DOM
	requestAnimationFrame(() => renderGraph(initialData));
}
</script>
</body>
</html>`;
}

// ─── Deactivation ────────────────────────────────────────────

export function deactivate() {
	if (debounceTimer) { clearTimeout(debounceTimer); }
	if (impactPanel) { impactPanel.dispose(); }
}
