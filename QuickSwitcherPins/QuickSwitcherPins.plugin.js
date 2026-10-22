/**
 * @name QuickSwitcherPins
 * @author PurelyAndy
 * @description Lets you specify search results to always show up at the top of the quick switcher
 * @version 1.1.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/QuickSwitcherPins
 * @runAt idle
 */

const Bd = new BdApi('QuickSwitcherPins');
const { Webpack, Patcher, Data, React, UI } = Bd;
const Filters = Webpack.Filters;
const rce = React.createElement;

const QuickSwitcher = Webpack.getBySource(
    '.GAME_PROFILE:return[]', {
        map: {
            quickSwitcherResultsChanged: Filters.byStrings('.GAME_PROFILE:return[]'),
            resultTypes: Filters.byStrings('{return['),
        },
        mapDeclarations: true
    }
);
/* const RelationshipStore = Webpack.Stores.RelationshipStore; */

const regexPattern = /^\/(.+)\/([dgimsuvy]*)$/;

/* const settings = [
    {
        id: 'hideWhichUsers',
        name: 'Hide Users',
        note: 'Hides these users/bots from the quick switcher.',
        type: 'dropdown',
        options: [
            { id: 'hideNeither', label: 'Neither', value: 0 },
            { id: 'hideBlockedUsers', label: 'Blocked Users', value: 1 },
            { id: 'hideIgnoredUsers', label: 'Ignored Users', value: 2 },
            { id: 'hideBoth', label: 'Both', value: 3 }
        ],
        value: 0,
        style: 'default'
    }
];
for (const setting of settings) {
    Object.defineProperty(settings, setting.id, {
        get: () => setting.value = (Data.load(setting.id) ?? setting.value),
        set: (value) => Data.save(setting.id, setting.value = value) 
    });
}
const shouldHideBlockedUsers = () => settings.hideWhichUsers & 1 == 1;
const shouldHideIgnoredUsers = () => settings.hideWhichUsers & 2 == 2; */
function updateSettings() {
    const version = Data.load('settingsVersion') ?? 0;
    if (version < 1) {
        Data.delete('settings');
        Data.save('settingsVersion', 1);
    }
}

module.exports = class QuickSwitcherPins {
    start() {
        updateSettings();

        Patcher.before(QuickSwitcher, 'quickSwitcherResultsChanged', (_, args) => {
            let [results, query] = args;
            if (!results || !Array.isArray(results) || !query) return;

            const pinned = Data.load('pinned');
            if (pinned && Array.isArray(pinned)) {
                for (let i = pinned.length - 1; i >= 0; i--) {
                    const pin = pinned[i];
                    if (pin.queryRegex) {
                        const match = pin.queryRegex.match(regexPattern);
                        let regex;

                        if (match) {
                            const [, pattern, flags] = match;
                            regex = new RegExp(pattern, flags);
                        } else {
                            regex = new RegExp(pin.queryRegex, 'i');
                        }

                        if (!regex.test(query)) {
                            continue;
                        }
                    }

                    const matchesPin = r =>
                        (pin.id || pin.type)
                        && (!pin.id || r.record.id === pin.id)
                        && (!pin.type || r.type === pin.type);

                    const matches = [], rest = [];
                    results.forEach(r => (matchesPin(r) ? matches : rest).push(r));
                    results.splice(0, results.length, ...matches, ...rest);
                    //results.splice(0, results.length);
                }
            }
            /* const hide = [
                ...(shouldHideBlockedUsers() ? RelationshipStore.getBlockedIDs() : []),
                ...(shouldHideIgnoredUsers() ? RelationshipStore.getIgnoredIDs() : [])
            ];
            results = results.filter(r => !hide.includes(r.record.id)); */
        });
    }
    stop() {
        Patcher.unpatchAll();
    }
    getSettingsPanel() {
        return SettingsPanel;
    }
};

function humanize(type) {
    switch (type) {
        case 'IN_APP_NAVIGATION': return 'In-App Menu';
        case 'GROUP_DM': return 'Group DM';
        case 'TEXT_CHANNEL': return 'Channel';
        default: return type.split('_').map(s => s[0] + s.slice(1).toLowerCase()).join(' ');
    }
}

const settingsStyles =
`
.qsp-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
}
.qsp-row {
    display: flex;
    align-items: center;
    background: var(--background-base-lower);
    padding: 3px 5px 3px 0;
    border-radius: 6px;
    transition: opacity 0.1s;
    box-sizing: border-box;

    .bd-text-input {
        flex: 1 1 0;
        margin: 0;
    }

    > *:not(:last-child):not(:first-child) {
        margin-right: 4px !important;
    }
}
.qsp-sizer {
    display: inline-grid;
    align-items: center;
    flex: 0 0 auto;

    &::after {
        content: "Regex search must match (optional)";
        visibility: hidden;
        white-space: pre;
        grid-area: 1 / 1;
        font-size: 14px;
        padding: 5px;
        border: 1px solid;
        font-family: inherit;
    }

    > input.bd-text-input {
        grid-area: 1 / 1;
        width: 100%;
    }
}
.qsp-grip {
    cursor: grab;
    color: var(--interactive-text-default);
    display: flex;
    padding: 4px;
    &:hover {
        color: var(--interactive-text-hover);
    }
    &:active {
        cursor: grabbing;
    }
}
.qsp-grip-disabled {
    cursor: not-allowed !important;
    color: var(--interactive-muted) !important;
}
.qsp-del {
    padding: 4px !important;
    display: flex !important;
    align-items: center;
    align-self: stretch;
    justify-content: center;
}
input.bd-text-input {
    background: var(--background-base-lowest);
    border-radius: var(--radius-xs);
    min-width: 0;
    height: 30px;
    padding: 5px;
    font-size: 14px;
}
select.qsp-select {
    background: var(--background-base-lowest);
    color: var(--text-default);
    border: 1px solid transparent;
    border-radius: var(--radius-xs);
    height: 30px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    cursor: pointer;
    &:hover {
        border-color: var(--interactive-text-hover);
    }
    &:focus {
        border-color: var(--accent-1, var(--background-mod-strong));
    }
}
`;

function SettingsPanel() {
    /* const bdSettings = UI.buildSettingsPanel({
            settings, onChange: (_, id, value) => settings[id] = value
        }); */

    const generateKey = () => Math.random().toString(36).slice(2);
    const resultTypes = QuickSwitcher.resultTypes();

    const [pins, setPins] = React.useState(() => {
        const loaded = (Data.load('pinned') || []).map(pin => ({ type: '', ...pin, _key: generateKey() }));
        if (!loaded.length || loaded[loaded.length - 1].id || loaded[loaded.length - 1].queryRegex) {
            loaded.push({ id: '', queryRegex: '', type: '', _key: generateKey() });
        }
        return loaded;
    });
    const [draggedIndex, setDraggedIndex] = React.useState(null);
    const [dragActiveIndex, setDragActiveIndex] = React.useState(null);
    const [dropTargetIndex, setDropTargetIndex] = React.useState(null);

    const savePins = (updatedPins) => {
        setPins(updatedPins);
        Data.save(
            'pinned',
            updatedPins.filter(pin => pin.id || pin.queryRegex).map(({ _key, ...rest }) => rest)
        );
    };

    const updatePin = (index, field, value) => {
        const nextPins = [...pins];
        nextPins[index][field] = value;

        // add a new empty row when the empty row is typed into
        if (index === nextPins.length - 1 && (nextPins[index].id || nextPins[index].queryRegex)) {
            nextPins.push({ id: '', queryRegex: '', type: '', _key: generateKey() });
        }

        savePins(nextPins);
    };

    const handleBlur = (index, e) => {
        // don't remove the empty row if the user is still interacting with it
        const row = e.currentTarget.closest('.qsp-row');
        if (row && row.contains(e.relatedTarget)) {
            return;
        }

        if (!pins[index].id && !pins[index].queryRegex && index !== pins.length - 1) {
            savePins(pins.filter((_, idx) => idx !== index));
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (draggedIndex === null) return;

        const rows = Array.from(e.currentTarget.querySelectorAll('.qsp-row:not(.qsp-empty)'));
        let targetIdx = rows.findIndex(row => e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2);
        if (targetIdx === -1) targetIdx = rows.length;

        setDropTargetIndex(targetIdx !== draggedIndex && targetIdx !== draggedIndex + 1 ? targetIdx : null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (draggedIndex !== null && dropTargetIndex !== null) {
            const nextPins = [...pins];
            const [draggedPin] = nextPins.splice(draggedIndex, 1);
            nextPins.splice(dropTargetIndex > draggedIndex ? dropTargetIndex - 1 : dropTargetIndex, 0, draggedPin);
            savePins(nextPins);
        }
    };

    return rce('div', { className: 'qsp-panel', onDragOver: handleDragOver, onDrop: handleDrop },
        rce('style', null, settingsStyles),
        /* bdSettings, */
        pins.map((pin, index) => {
            const isEmpty = index === pins.length - 1 && !pin.id && !pin.queryRegex;
            return rce('div', {
                key: pin._key,
                className: 'qsp-row' + (isEmpty ? ' qsp-empty' : ''),
                draggable: dragActiveIndex === index && !isEmpty,
                onDragStart: (e) => {
                    setDraggedIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                },
                onDragEnd: () => {
                    setDraggedIndex(null);
                    setDragActiveIndex(null);
                    setDropTargetIndex(null);
                },
                style: {
                    opacity: draggedIndex === index ? 0.3 : 1,
                    border: isEmpty ? '1px dashed var(--background-mod-strong)' : '1px solid transparent',
                    boxShadow: dropTargetIndex === index ? '0 -2px 0 0 var(--background-brand)' : 'none'
                }
            },
                rce('div', {
                    className: 'qsp-grip' + (isEmpty ? ' qsp-grip-disabled' : ''),
                    onMouseEnter: () => setDragActiveIndex(index),
                    onMouseLeave: () => setDragActiveIndex(null)
                },
                    rce('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'currentColor' },
                        ['8', '16'].map(cx => ['6', '12', '18'].map(cy => rce('circle', { cx, cy, r: '2', key: cx + cy })))
                    )
                ),
                rce('select', {
                    className: 'qsp-select',
                    value: pin.type || '',
                    onChange: (e) => updatePin(index, 'type', e.target.value),
                    onBlur: (e) => handleBlur(index, e)
                },
                    rce('option', { value: '' }, 'All Types'),
                    resultTypes.map(type =>
                        rce('option', { key: type, value: type }, humanize(type))
                    )
                ),
                rce('input', {
                    className: 'bd-text-input',
                    placeholder: 'Some ID',
                    value: pin.id || '',
                    onChange: (e) => updatePin(index, 'id', e.target.value),
                    onBlur: (e) => handleBlur(index, e)
                }),
                rce('div', { className: 'qsp-sizer' },
                    rce('input', {
                        className: 'bd-text-input',
                        placeholder: 'Regex search must match (optional)',
                        value: pin.queryRegex || '',
                        onChange: (e) => updatePin(index, 'queryRegex', e.target.value),
                        onBlur: (e) => handleBlur(index, e)
                    })
                ),
                rce('button', {
                    className: 'bd-button bd-button-filled qsp-del bd-button-color-red',
                    onClick: () => savePins(pins.filter((_, idx) => idx !== index)),
                    style: { visibility: isEmpty ? 'hidden' : 'visible' }
                },
                    rce('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                        rce('path', { d: 'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }),
                        rce('line', { x1: '10', y1: '11', x2: '10', y2: '17' }),
                        rce('line', { x1: '14', y1: '11', x2: '14', y2: '17' })
                    )
                )
            );
        })
    );
}