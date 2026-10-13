/**
 * @name CleanPastedCodeIndents
 * @author PurelyAndy
 * @description Attempts to match the indentation of pasted code to the indentation of where it's pasted. Also adds a button to clean the indentation of code blocks.
 * @version 1.0.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/CleanPastedCodeIndents
 * @runAt idle
 */

const { Webpack, Patcher, Utils, React, Components, UI, Data } = BdApi;
const Filters = Webpack.Filters;

const [HistoryEditorModule, HistoryEditorKey] = Webpack.getWithKey(
    t => t.withSingleEntry,
    { target: Webpack.getBySource('withSingleEntry:(') }
);
const HistoryEditor = HistoryEditorModule[HistoryEditorKey];
const { Editor, Node: SlateNode, Element: SlateElement } = Webpack.getMangled(
    'Could not completely normalize the editor',
    Object.fromEntries(['Editor', 'Node', 'Element'].map(k => [k, Filters.byKeys('is' + k)]))
);

const { codeBlock } = Webpack.getByKeys("defaultRules", "parseTopic").defaultRules;
const [ divButton ] = Object.values(Webpack.getBySource('defaultProps={tag:"div",role:"button"'));

const settings = [
    {
        id: 'cleanCodeBlocksByDefault',
        name: 'Clean Code Blocks by Default',
        note: 'If enabled, code blocks in the chat will be cleaned without you having to click the button.',
        type: 'switch',
        value: true
    },
];

module.exports = class CleanPastedCodeIndents {
    start() {
        Object.assign(settings, Data.load('CleanPastedCodeIndents', 'settings'));
        loadModel();
        Patcher.instead('CleanPastedCodeIndents', codeBlock, 'react', (_, args, original) => {
            return React.createElement(Components.ErrorBoundary,
                { name: "CleanPastedCodeIndents", id: "CodeBlockWrapper" },
                React.createElement(CodeBlockWrapper, { original, args })
            );
        });

        let avoidInfiniteLoop = false;
        Patcher.before('CleanPastedCodeIndents', HistoryEditor, 'withSingleEntry', (_, args) => {
            const editor = args[0];
            const callback = args[1];

            if (!editor || !callback
                || typeof callback !== "function"
                || !callback.toString().includes('{always:!0}')) {
                return;
            }

            if (avoidInfiniteLoop) {
                return;
            }

            const oldAnchor = {
                offset: editor.selection.anchor.offset,
                path: [...editor.selection.anchor.path]
            };

            args[1] = () => {
                Editor.withoutNormalizing(editor, () => {
                    callback();

                    const pastedTextSelection = {
                        anchor: {
                            offset: oldAnchor.offset,
                            path: oldAnchor.path
                        },
                        focus: {
                            offset: editor.selection.focus.offset,
                            path: editor.selection.focus.path
                        }
                    };
                    const toBeginningOfParaSelection = {
                        anchor: {
                            offset: 0,
                            path: [oldAnchor.path[0], 0]
                        },
                        focus: {
                            offset: oldAnchor.offset,
                            path: oldAnchor.path
                        }
                    };
                    const prevParaSelection = {
                        anchor: {
                            offset: 0,
                            path: [Math.max(0, oldAnchor.path[0] - 1), 0]
                        },
                        focus: {
                            offset: 0,
                            path: [oldAnchor.path[0], 0]
                        }
                    };

                    editor.selection = toBeginningOfParaSelection;
                    const toBeginningOfParaText = getFragmentText(editor);
                    const atStartOfPara = toBeginningOfParaText.length === 0;
                    const atStartOfLine = atStartOfPara || toBeginningOfParaText.endsWith("\n");

                    let prevText;
                    let deltaIndent = 0;
                    if (atStartOfPara) {
                        editor.selection = prevParaSelection;
                        prevText = getFragmentText(editor).split("\n").slice(-2, -1)[0] || "";
                    } else {
                        const lines = toBeginningOfParaText.split("\n");
                        let prevLine;

                        if (lines.length > 1) {
                            prevLine = lines[lines.length - 2];
                        } else if (oldAnchor.path[0] > 0) {
                            editor.selection = prevParaSelection;
                            prevLine = getFragmentText(editor).split("\n").slice(-2, -1)[0] || "";
                        } else {
                            prevText = toBeginningOfParaText.split("\n").pop();
                        }

                        if (atStartOfLine && prevLine) {
                            prevText = prevLine;
                        } else {
                            prevText = toBeginningOfParaText.split("\n").pop();
                            if (prevText.trim() === "") {
                                if (prevLine) {
                                    const prevLineIndent = prevLine.search(/\S|$/);
                                    const prevTextIndent = prevText.search(/\S|$/);
                                    if (prevLineIndent > prevTextIndent) {
                                        prevText = prevLine;
                                        deltaIndent = prevLineIndent - prevTextIndent;
                                    }
                                }
                            }
                        }
                    }

                    prevText = prevText.replace(/\t/g, "    ");
                    const prevIndent = " ".repeat(prevText.search(/\S|$/));

                    editor.selection = pastedTextSelection;
                    const pastedText = getFragmentText(editor);

                    const lines = pastedText.split('\n');
                    const newText = cleanIndentation(lines, atStartOfLine, prevIndent, deltaIndent);

                    editor.selection = pastedTextSelection;
                    editor.deleteFragment();
                    avoidInfiniteLoop = true;
                    editor.insertText(newText);
                    avoidInfiniteLoop = false;
                });
            };
        });
    }
    stop() {
        Patcher.unpatchAll('CleanPastedCodeIndents');
    }
    getSettingsPanel() {
        return UI.buildSettingsPanel({ settings, onChange: (_, id, value) => {
            settings.find(s => s.id == id).value = value;
            Data.save('CleanPastedCodeIndents', 'settings', settings);
        }});
    }
};

function cleanIndentation(lines, atStartOfLine = false, prevIndent = "", deltaIndent = 0) {
    if (lines.length <= 1) {
        return lines.join('\n').trimStart();
    }
    const { minIndent, indentSize } = calculateIndentInfo(lines);
    if (minIndent !== Infinity) {
        const trimmedLines = [lines[0].slice(Math.min(minIndent, lines[0].search(/\S/))), ...lines.slice(1).map(line => line.slice(minIndent))];
        const newLines = [
            (atStartOfLine ? prevIndent : " ".repeat(deltaIndent)) + trimmedLines[0],
            ...trimmedLines.slice(1).map(line => prevIndent + " ".repeat(indentSize) + line)
        ];
        return newLines.join('\n');
    }
}

function calculateIndentInfo(lines) {
    const nextLineIndent = lines[1].search(/\S|$/);

    let minIndent = Infinity;
    const indents = new Set();

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") {
            continue;
        }

        const indent = line.search(/\S/);
        if (indent !== -1) {
            indents.add(indent);
            if (indent < minIndent) {
                minIndent = indent;
            }
        }
    }

    const tabSize = findIndentSize(indents);
    const trimmedLines = [lines[0].slice(Math.min(minIndent, lines[0].search(/\S/))), ...lines.slice(1).map(line => line.slice(minIndent))].filter(line => line.trim() !== "");
    const heuristicAddIndentLevel = minIndent >= nextLineIndent && model.predict(buildModelEntries(trimmedLines, tabSize));
    const indentSize = heuristicAddIndentLevel ? tabSize : 0;

    return { minIndent, indentSize: indentSize };
}

var findInReactTree = (root, filter) => Utils.findInTree(root, filter, { walkable: ['props', 'children'] });

function CodeBlockWrapper({ original, args }) {
    const [cleaned, setCleaned] = React.useState(false);

    if (args[0].otherContent) {
        [args[0].otherContent, args[0].content] = [args[0].content, args[0].otherContent];
    } else {
        args[0].otherContent = cleanIndentation(args[0].content.split('\n'));
    }
    const tree = original(...args);

    const targetNode = findInReactTree(tree, n => n?.props?.className?.includes('codeActions'));

    if (targetNode) {
        const existingChildren = React.Children.toArray(targetNode.props.children);
        targetNode.props.children = [
            ...existingChildren,
            React.createElement(divButton, {
                onClick: (e) => {
                    e.stopPropagation();
                    setCleaned(prev => !prev);
                },
                children: React.createElement(cleaned ? IconIncreaseIndent : IconDecreaseIndent)
            })
        ];
    }

    return tree;
}

const IconDecreaseIndent = () => React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
},
    React.createElement('line', { x1: '3', y1: '4', x2: '21', y2: '4' }),
    React.createElement('line', { x1: '11', y1: '10.5', x2: '21', y2: '10.5' }),
    React.createElement('line', { x1: '11', y1: '17', x2: '21', y2: '17' }),
    React.createElement('polyline', { points: '7 9 4 12 7 15' })
);

const IconIncreaseIndent = () => React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
},
    React.createElement('line', { x1: '3', y1: '4', x2: '21', y2: '4' }),
    React.createElement('line', { x1: '11', y1: '10.5', x2: '21', y2: '10.5' }),
    React.createElement('line', { x1: '11', y1: '17', x2: '21', y2: '17' }),
    React.createElement('polyline', { points: '4 9 7 12 4 15' })
);

function findIndentSize(indents) {
    const values = [...indents].sort((a, b) => a - b);

    if (values.length === 1) {
        if ((values[0] % 4) === 0) return 4;
        if ((values[0] % 2) === 0) return 2;
        if ((values[0] % 3) === 0) return 3;
        return values[0];
    }

    const diffs = [];

    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];

        if (diff > 0) {
            diffs.push(diff);
        }
    }
    
    return diffs.reduce((a, b) => {
        while (b !== 0) {
            [a, b] = [b, a % b];
        }
        return a;
    });
}

// Editor.string() doesn't separate paragraphs with newlines, so we have to do it ourselves.

// this function doesn't work because Editor.nodes() doesn't cut the nodes off at the selection boundaries, so it will include all of the text of any nodes that are partially selected, which is not what we want. We only want the text that is actually selected.
/* function getFragmentText(editor, selection) {
    return Array.from(
        Editor.nodes(editor, {
            at: selection,
            match: n => SlateElement.isElement(n)
        })
    ).map(([node]) => SlateNode.string(node))
    .join('\n');
} */
// this function seems to work fine, but if there are nodes that shouldn't have newlines between them,
// it will still add newlines, which is not what we want.
// haven't ran into that situation, so i am going to assume that it won't happen.
function getFragmentText(editor) {
    return editor.getFragment().map(node => SlateNode.string(node)).join("\n");
}
// this function also seems to work fine, but is more complicated and brittle than the above function
/* function getFragmentText(editor) {
    const fragment = editor.getFragment();
    let text = "";
    for (const descendant of fragment) {
        for (const child of descendant.children) {
            if (child.text) {
                text += child.text;
            }
        }
        if (descendant.type === "line") {
            text += "\n";
        }
    }
    return text.substring(0, text.length - 1); // remove the last newline
} */

//const fs = require('fs');
//const classifierWeights = fs.readFileSync(__dirname + '/model_weights.json', 'utf8');
//const compactWeights = fs.readFileSync(__dirname + '/model_weights.compact', 'binary');

async function loadModel() {
    const response = await fetch(`https://raw.githubusercontent.com/PurelyAndy/bdplugins/main/CleanPastedCodeIndents/model_weights.compact?t=${Date.now()}`);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const compactWeights = await response.arrayBuffer();
    const weightData = await inflateModel(compactWeights);
    const classifierWeights = await unpackWeights(weightData);
    model = new TinyIndentTransformer(classifierWeights, 96, 5);
}

const TAB_WIDTH = 4;
const MAX_MODEL_LINES = 5;

function buildModelEntries(lines, tabSize) {
    const entries = lines.filter(l => l.trim() !== "").slice(0, MAX_MODEL_LINES);
    const widths = entries.map(indentWidth);
    const minLater = entries.length > 1 ? Math.min(...widths.slice(1)) : 0;

    return entries.map((line, i) => ({
        text: line.trimStart(),
        relIndent: i === 0 ? 0 : Math.max(0, widths[i] - minLater) / tabSize,
    }));
}

async function inflateModel(arrayBuffer) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
    const arrayBufferDecompressed = await new Response(stream).arrayBuffer();

    return arrayBufferDecompressed;
}

async function unpackWeights(arrayBuffer) {
    const buffer = new Uint8Array(arrayBuffer);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const decoder = new TextDecoder('utf-8');

    const weights = {};

    let offset = 0;

    while (offset < buffer.length) {
        const nullTermIndex = buffer.indexOf(0, offset);
        if (nullTermIndex === -1) {
            break;
        }
        //console.log(`Reading tensor key at offset ${offset}, null-terminated at ${nullTermIndex}`);

        const key = decoder.decode(buffer.subarray(offset, nullTermIndex));
        offset = nullTermIndex + 1;

        const length = view.getUint32(offset, true);
        //console.log(`Length of tensor ${key} is at offset ${offset}: ${length}`);

        offset += 4;

        //console.log(`Values of tensor ${key} are at offset ${offset}`);

        const value = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            value[i] = view.getFloat32(offset, true);
            offset += 4;
        }

        weights[key] = value;
    }

    return weights;
}

function indentWidth(line) {
    let width = 0;

    for (const ch of line) {
        if (ch === ' ') {
            width++;
        } else if (ch === '\t') {
            width += TAB_WIDTH;
        } else {
            break;
        }
    }

    return width;
}

class TinyIndentTransformer {
    constructor(weights, maxBytesPerLine, numLines) {
        this.encoder = new TextEncoder();
        this.maxBytesPerLine = maxBytesPerLine || 96;
        this.numLines = numLines || 5;
        this.dModel = 32;
        this.w = weights;
    }

    _lineBytes(rawText) {
        const bytes = this.encoder.encode(rawText.replace(/\t/g, "    ").trimStart());
        const max = this.maxBytesPerLine;
        
        if (bytes.length <= max) {
            return bytes;
        }

        const budget = max - 1;
        const headBytes = Math.floor(budget / 3);
        const tailBytes = budget - headBytes;

        let headEnd = headBytes;
        while (headEnd > 0 && (bytes[headEnd] & 0xC0) === 0x80) {
            headEnd--;
        }
        
        let tailStart = bytes.length - tailBytes;
        while (tailStart < bytes.length && (bytes[tailStart] & 0xC0) === 0x80) {
            tailStart++;
        }

        const out = new Uint8Array(headEnd + 1 + (bytes.length - tailStart));
        out.set(bytes.subarray(0, headEnd), 0);
        out[headEnd] = 0x01;
        out.set(bytes.subarray(tailStart), headEnd + 1);

        return out;
    }

    predict(entries) {
        const startTime = performance.now();

        const seqLen = this.numLines * this.maxBytesPerLine;
        const dModel = this.dModel;
        const tokens = new Int32Array(seqLen);
        const indents = new Float32Array(seqLen);

        for (let i = 0; i < this.numLines; i++) {
            if (i < entries.length) {
                const bytes = this._lineBytes(entries[i].text);
                const lineStart = i * this.maxBytesPerLine;
                const offset = lineStart + (this.maxBytesPerLine - bytes.length);

                for (let j = 0; j < bytes.length; j++) {
                    tokens[offset + j] = bytes[j];
                }
                
                for (let j = 0; j < this.maxBytesPerLine; j++) {
                    indents[i * this.maxBytesPerLine + j] = entries[i].relIndent;
                }
            }
        }

        const X = new Float32Array(seqLen * dModel);
        const wByte = this.w['byteEmbedding.weight'];
        const wPos = this.w['posEmbedding.weight'];
        const wIndent = this.w['indentLinear.weight'];
        const bIndent = this.w['indentLinear.bias'];

        for (let i = 0; i < seqLen; i++) {
            const token = tokens[i], ind = indents[i];
            for (let d = 0; d < dModel; d++) {
                X[i * dModel + d] = wByte[token * dModel + d] + wPos[i * dModel + d] + (wIndent[d] * ind + bIndent[d]);
            }
        }

        const Q = new Float32Array(seqLen * dModel), K = new Float32Array(seqLen * dModel);
        const V = new Float32Array(seqLen * dModel), AttnOut = new Float32Array(seqLen * dModel);
        const wIn = this.w['transformerEncoder.layers.0.self_attn.in_proj_weight'];
        const bIn = this.w['transformerEncoder.layers.0.self_attn.in_proj_bias'];

        for (let i = 0; i < seqLen; i++) {
            for (let out_d = 0; out_d < dModel * 3; out_d++) {
                let sum = bIn[out_d];
                for (let in_d = 0; in_d < dModel; in_d++) {
                    sum += X[i * dModel + in_d] * wIn[out_d * dModel + in_d];
                }
                
                if (out_d < dModel) {
                    Q[i * dModel + out_d] = sum;
                } else if (out_d < dModel * 2) {
                    K[i * dModel + (out_d - dModel)] = sum;
                } else {
                    V[i * dModel + (out_d - dModel * 2)] = sum;
                }
            }
        }

        const nHeads = 2, headDim = 16, scale = 1.0 / Math.sqrt(headDim);
        const scores = new Float32Array(seqLen);
        for (let h = 0; h < nHeads; h++) {
            for (let i = 0; i < seqLen; i++) {
                let maxScore = -Infinity;

                for (let j = 0; j < seqLen; j++) {
                    if (tokens[j] === 0) {
                        scores[j] = -Infinity;
                        continue;
                    }

                    let dot = 0;

                    for (let d = 0; d < headDim; d++) {
                        dot += Q[i * dModel + h * headDim + d] * K[j * dModel + h * headDim + d];
                    }
                    
                    scores[j] = dot * scale;
                    
                    if (scores[j] > maxScore) {
                        maxScore = scores[j];
                    }
                }

                let sumExp = 0;
                for (let j = 0; j < seqLen; j++) {
                    if (tokens[j] !== 0) {
                        scores[j] = Math.exp(scores[j] - maxScore);
                        sumExp += scores[j];
                    } else scores[j] = 0;
                }

                for (let j = 0; j < seqLen; j++) scores[j] /= sumExp;

                for (let d = 0; d < headDim; d++) {
                    let val = 0;
                    for (let j = 0; j < seqLen; j++) if (scores[j] > 0) val += scores[j] * V[j * dModel + h * headDim + d];
                    AttnOut[i * dModel + h * headDim + d] = val;
                }
            }
        }

        const wOut = this.w['transformerEncoder.layers.0.self_attn.out_proj.weight'];
        const bOut = this.w['transformerEncoder.layers.0.self_attn.out_proj.bias'];

        for (let i = 0; i < seqLen; i++) {
            for (let out_d = 0; out_d < dModel; out_d++) {
                let sum = bOut[out_d];
                for (let in_d = 0; in_d < dModel; in_d++) sum += AttnOut[i * dModel + in_d] * wOut[out_d * dModel + in_d];
                X[i * dModel + out_d] += sum;
            }
        }

        const layerNorm = (arr, startIdx, len, wNorm, bNorm) => {
            let sum = 0, varSum = 0;
            for (let i = 0; i < len; i++) sum += arr[startIdx + i];

            const mean = sum / len;
            for (let i = 0; i < len; i++) varSum += (arr[startIdx + i] - mean) ** 2;

            const std = Math.sqrt((varSum / len) + 1e-5);
            for (let i = 0; i < len; i++) arr[startIdx + i] = ((arr[startIdx + i] - mean) / std) * wNorm[i] + bNorm[i];
        };

        const norm1W = this.w['transformerEncoder.layers.0.norm1.weight'], norm1B = this.w['transformerEncoder.layers.0.norm1.bias'];
        
        for (let i = 0; i < seqLen; i++) {
            layerNorm(X, i * dModel, dModel, norm1W, norm1B);
        }

        const wLin1 = this.w['transformerEncoder.layers.0.linear1.weight'], bLin1 = this.w['transformerEncoder.layers.0.linear1.bias'];
        const wLin2 = this.w['transformerEncoder.layers.0.linear2.weight'], bLin2 = this.w['transformerEncoder.layers.0.linear2.bias'];
        const hidden = new Float32Array(128);

        for (let i = 0; i < seqLen; i++) {
            for (let out_d = 0; out_d < 128; out_d++) {
                let sum = bLin1[out_d];
                for (let in_d = 0; in_d < dModel; in_d++) sum += X[i * dModel + in_d] * wLin1[out_d * dModel + in_d];
                hidden[out_d] = sum > 0 ? sum : 0; // ReLU
            }

            for (let out_d = 0; out_d < dModel; out_d++) {
                let sum = bLin2[out_d];
                for (let in_d = 0; in_d < 128; in_d++) sum += hidden[in_d] * wLin2[out_d * 128 + in_d];
                X[i * dModel + out_d] += sum;
            }
        }

        const norm2W = this.w['transformerEncoder.layers.0.norm2.weight']
        const norm2B = this.w['transformerEncoder.layers.0.norm2.bias'];
        for (let i = 0; i < seqLen; i++) {
            layerNorm(X, i * dModel, dModel, norm2W, norm2B);
        }

        const maskedMean = new Float32Array(dModel);
        let validTokens = 0;

        for (let i = 0; i < seqLen; i++) {
            if (tokens[i] !== 0) {
                validTokens++;
                for (let d = 0; d < dModel; d++) maskedMean[d] += X[i * dModel + d];
            }
        }

        const divisor = (validTokens / seqLen) + 1e-6;

        for (let d = 0; d < dModel; d++) {
            maskedMean[d] = (maskedMean[d] / seqLen) / divisor;
        }

        const lineEnds = new Float32Array(this.numLines * dModel);

        for (let L = 0; L < this.numLines; L++) {
            const lastPos = L * this.maxBytesPerLine + (this.maxBytesPerLine - 1);

            if (tokens[lastPos] !== 0) {
                for (let d = 0; d < dModel; d++) lineEnds[L * dModel + d] = X[lastPos * dModel + d];
            }
        }

        const lineStarts = new Float32Array(this.numLines * dModel);

        for (let L = 0; L < this.numLines; L++) {
            let firstOffset = -1;

            for (let j = 0; j < this.maxBytesPerLine; j++) {
                if (tokens[L * this.maxBytesPerLine + j] !== 0) { firstOffset = j; break; }
            }

            if (firstOffset !== -1) {
                const firstPos = L * this.maxBytesPerLine + firstOffset;
                for (let d = 0; d < dModel; d++) lineStarts[L * dModel + d] = X[firstPos * dModel + d];
            }
        }

        const featureSize = dModel * (1 + 2 * this.numLines);
        const features = new Float32Array(featureSize);

        features.set(maskedMean, 0);
        features.set(lineEnds, dModel);
        features.set(lineStarts, dModel + this.numLines * dModel);

        const wC1 = this.w['classifierHead.0.weight'], bC1 = this.w['classifierHead.0.bias'];
        const hiddenC = new Float32Array(32);

        for (let out_d = 0; out_d < 32; out_d++) {
            let sum = bC1[out_d];
            for (let in_d = 0; in_d < featureSize; in_d++) sum += features[in_d] * wC1[out_d * featureSize + in_d];
            hiddenC[out_d] = sum > 0 ? sum : 0.01 * sum;
        }

        const wC2 = this.w['classifierHead.2.weight'], bC2 = this.w['classifierHead.2.bias'];
        let outSum = bC2[0];

        for (let in_d = 0; in_d < 32; in_d++) {
            outSum += hiddenC[in_d] * wC2[in_d];
        }

        console.log("Took " + (performance.now() - startTime).toFixed(2) + "ms to predict confidence " + outSum.toFixed(2) + " for " + entries.length + " lines.");

        return outSum > 0;
    }
}
var model;