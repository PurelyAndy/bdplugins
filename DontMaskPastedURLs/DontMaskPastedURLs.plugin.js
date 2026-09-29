/**
 * @name DontMaskPastedURLs
 * @author PurelyAndy
 * @description Makes it so when you paste a link with some text selected, it just replaces the text rather than creating a [masked link](https://example.com)
 * @version 1.0.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/DontMaskPastedURLs
 * @runAt idle
 */

const { Webpack, Patcher, Data, React } = BdApi;
const Filters = Webpack.Filters;
const [SomeKindOfMarkdownModule, utilObjectKey] = Webpack.getWithKey(
    t => t.withoutNormalizing,
    { target: Webpack.getModule(Filters.bySource('attributes:["textMention"]')) }
);

module.exports = class DontMaskPastedURLs {
    start() {
        Patcher.before('DontMaskPastedURLs', SomeKindOfMarkdownModule[utilObjectKey], 'withoutNormalizing', (self, args) => {
            const editor = args[0];
            const callback = args[1];

            if (!editor || !callback
                || typeof callback !== "function"
                || !callback.toString().includes('insertText("[")')) {
                return;
            }

            args[1] = () => {
                const originalInsertText = editor.insertText;

                let originalSelection = editor.selection;

                editor.insertText = text => {
                    if (text === "[") {
                        return;
                    }

                    if (typeof text === "string" && text.startsWith("](")) {
                        editor.apply({
                            type: "set_selection",
                            newProperties: originalSelection
                        })
                        return originalInsertText.call(editor, text.slice(2, text.length - 2));
                    }

                    return originalInsertText.call(editor, text);
                };

                try {
                    return callback.apply(this, arguments);
                } finally {
                    editor.insertText = originalInsertText;
                }
            };
        });
    }
    stop() {
        Patcher.unpatchAll('DontMaskPastedURLs');
    }
};
