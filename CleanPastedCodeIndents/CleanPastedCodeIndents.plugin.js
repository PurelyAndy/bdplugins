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

const { Webpack, Patcher, Utils, React, Components } = BdApi;
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

module.exports = class CleanPastedCodeIndents {
    start() {
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

    const heuristicAddIndentLevel = minIndent >= nextLineIndent && [..."{[(:"].some(c => lines[0].trim().endsWith(c));
    const indentSize = heuristicAddIndentLevel ? findIndentSize(indents) : 0;

    return { minIndent, indentSize };
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
