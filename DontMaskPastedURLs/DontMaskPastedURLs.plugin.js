/**
 * @name DontMaskPastedURLs
 * @author PurelyAndy
 * @description Makes it so that when you paste a link with some text selected, it just replaces the text rather than creating a [masked link](https://example.com)
 * @version 1.1.1
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/DontMaskPastedURLs
 * @runAt idle
 */

"use strict";

const Bd = new BdApi('DontMaskPastedURLs');
const { Webpack, Patcher, Data, UI } = Bd;
const Filters = Webpack.Filters;

const DiscordEditor = Webpack.getModule(
    Filters.combine(
        Filters.byKeys('withoutNormalizing'),
        Filters.bySource('attributes:["textMention"]')),
    { searchExports: true }
);
const SlateRange = Webpack.getModule(
    Filters.combine(
        Filters.byKeys('isRange'),
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
for (const setting of settings) {
    Object.defineProperty(settings, setting.id, {
        get: () => setting.value = (Data.load(setting.id) ?? setting.value),
        set: (value) => Data.save(setting.id, setting.value = value)
    });
}
function updateSettings() {
    const version = Data.load('settingsVersion') ?? 0;
    if (version < 1) {
        Data.delete('settings');
        Data.save('settingsVersion', 1);
    }
}

module.exports = class DontMaskPastedURLs {
    start() {
        updateSettings();

        Patcher.before(DiscordEditor, 'withoutNormalizing', (_, args) => {
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

                if (settings.maskUnlessFullSelection && !isFullSelection) {
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
        Patcher.unpatchAll();
    }
    getSettingsPanel() {
        return UI.buildSettingsPanel({
            settings, onChange: (_, id, value) => settings[id] = value
        });
    }
};