/**
 * @name DontMaskPastedURLs
 * @author PurelyAndy
 * @description Makes it so that when you paste a link with some text selected, it just replaces the text rather than creating a [masked link](https://example.com)
 * @version 1.1.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/DontMaskPastedURLs
 * @runAt idle
 */

const { Webpack, Patcher } = BdApi;
const Filters = Webpack.Filters;

const DiscordEditor = Webpack.getModule(
    Filters.combine(
        Filters.byKeys("withoutNormalizing"),
        Filters.bySource('attributes:["textMention"]')),
    { searchExports: true }
);
const SlateRange = Webpack.getModule(
    Filters.combine(
        Filters.byKeys("isRange"),
        Filters.bySource('Could not completely normalize the editor')),
    { searchExports: true }
);

const settings = [
    {
        id: 'maskUnlessFullSelection',
        name: 'Only prevent masking if the entire text is selected',
        note: 'If enabled, pasted URLs will still be masked if only part of the text is selected. If disabled, pasted URLs will never be masked.',
        type: 'switch',
        value: false
    },
];
const maskUnlessFullSelection = () => settings.find(s => s.id === 'maskUnlessFullSelection')?.value;

module.exports = class DontMaskPastedURLs {
    start() {
        Object.assign(settings, Data.load('DontMaskPastedURLs', 'settings'));

        Patcher.before('DontMaskPastedURLs', DiscordEditor, 'withoutNormalizing', (_, args) => {
            const editor = args[0];
            const callback = args[1];

            if (!editor || !callback
                || typeof callback !== "function"
                || !callback.toString().includes('insertText("[")')) {
                return;
            }

            args[1] = () => {
                const originalInsertText = editor.insertText;
                const originalSelection = editor.selection;
                const isFullSelection = SlateRange.equals(editor.selection, DiscordEditor.range(editor, []));

                if (maskUnlessFullSelection() && !isFullSelection) {
                    return callback();
                }

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
                    return callback();
                } finally {
                    editor.insertText = originalInsertText;
                }
            };
        });
    }
    stop() {
        Patcher.unpatchAll('DontMaskPastedURLs');
    }
    getSettingsPanel() {
        return UI.buildSettingsPanel({ settings, onChange: (_, id, value) => {
            settings.find(s => s.id == id).value = value;
            Data.save('DontMaskPastedURLs', 'settings', settings);
        }});
    }
};