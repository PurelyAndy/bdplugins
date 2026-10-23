/**
 * @name BlockAccidentalApostropheSends
 * @author PurelyAndy
 * @description Stops you from accidentally pressing enter, thereby sending a message, when you meant to type an apostrophe.
 * @version 1.0.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/BlockAccidentalApostropheSends
 * @runAt idle
 */

"use strict";

const Bd = new BdApi('BlockAccidentalApostropheSends');
const { Webpack, Patcher, React, UI, Data } = Bd;
const Filters = Webpack.Filters;

const SlateRichTextEditor = Webpack.getByPrototypeKeys('handleBeforeInput');

/** @type {Array<any> & Record<string, any>} */
const settings = [
    {
        id: 'blockTimeout',
        name: 'Block Timeout',
        note: 'The amount of time (in milliseconds) that each method of blocking will be active for.',
        type: 'slider',
        min: 0,
        max: 1000,
        markers: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
        value: 150,
    },
    {
        id: 'blockApostropheSends',
        name: 'Block Apostrophe Sends',
        note: 'If enabled, pressing enter immediately after typing an apostrophe will not send the message.',
        type: 'switch',
        value: true
    },
    {
        id: 'delayEnterBeforeApostrophe',
        name: 'Delay Enter Before Apostrophe',
        note:   'If enabled, all messages will have a very small delay before they are sent. '+
                'If an apostrophe is typed during this delay, the message will not be sent.',
        type: 'switch',
        value: true
    },
];
for (const setting of settings) {
    let _ = Object.defineProperty(settings, setting.id, {
        get: () => setting.value = (Data.load(setting.id) ?? setting.value),
        set: (value) => Data.save(setting.id, setting.value = value)
    })[setting.id];
}
function updateSettings() {
    const version = Data.load('settingsVersion') ?? 0;
}

let lastApostropheTime = 0;
let messageSendTimeout = null;

module.exports = class BlockAccidentalApostropheSends {
    start() {
        updateSettings();

        Patcher.before(SlateRichTextEditor.prototype, 'handleBeforeInput', (_, args) => {
            const event = args[0];
            if (event.inputType === 'insertText' && event.data === "'") {
                lastApostropheTime = performance.now();
                if (settings.delayEnterBeforeApostrophe) {
                    if (messageSendTimeout) {
                        clearTimeout(messageSendTimeout);
                    }
                }
            }
        });
        Patcher.instead(SlateRichTextEditor.prototype, 'handleKeyDown', (self, args, orig) => {
            const event = args[0];

            if (event.key === "'") {
                lastApostropheTime = performance.now();
            } else if (event.key === 'Enter') {
                const now = performance.now();
                const timeSinceApostrophe = now - lastApostropheTime;

                if (settings.blockApostropheSends && timeSinceApostrophe < settings.blockTimeout) {
                    event.preventDefault();
                    return;
                }
                if (settings.delayEnterBeforeApostrophe) {
                    if (messageSendTimeout) {
                        clearTimeout(messageSendTimeout);
                    }
                    messageSendTimeout = setTimeout(() => {
                        messageSendTimeout = null;
                        orig.apply(self, args);
                    }, settings.blockTimeout);

                    event.preventDefault();
                    return;
                }
            }

            return orig.apply(self, args);
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