/**
 * @name QuickSwitcherPins
 * @author PurelyAndy
 * @description Lets you specify search results to always show up at the top of the quick switcher
 * @version 1.0.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/QuickSwitcherPins
 * @runAt idle
 */

const { Webpack, Patcher, Data, React } = BdApi;
const Filters = Webpack.Filters;
const rce = React.createElement;

const QuickSwitcher = Webpack.getMangled(
    '.GAME_PROFILE:return[]',
    { quickSwitcherResultsChanged: Filters.byStrings('.GAME_PROFILE:return[]') },
    { mapDeclarations: true }
);

const regexPattern = /^\/(.+)\/([dgimsuvy]*)$/;

module.exports = class QuickSwitcherPins {
    start() {
        Patcher.before('QuickSwitcherPins', QuickSwitcher, "quickSwitcherResultsChanged", (_, args) => {
            const [results, query] = args;
            if (!results || !Array.isArray(results) || !query) return;

            const pinned = Data.load('QuickSwitcherPins', 'pinned');
            if (!pinned || !Array.isArray(pinned)) return;

            for (let i = pinned.length - 1; i >= 0; i--) {
                const pin = pinned[i];
                if (pin.queryRegex) {
                    const match = pin.queryRegex.match(regexPattern);
                    let regex;

                    if (match) {
                        const [, pattern, flags] = match;
                        regex = new RegExp(pattern, flags);
                    } else {
                        regex = new RegExp(pin.queryRegex);
                    }

                    if (!regex.test(query)) {
                        continue;
                    }
                }
                const existingIndex = results.findIndex(r => r.record.id === pin.id);
                if (existingIndex !== -1) {
                    results.unshift(results.splice(existingIndex, 1)[0]);
                }
            }
        });
    }
    stop() {
        Patcher.unpatchAll('QuickSwitcherPins');
    }
    getSettingsPanel() {
        return SettingsPanel;
    }
};

const settingsStyles =
`
.qsp-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
}
.qsp-row {
    display: flex;
    align-items: center;
    background: var(--background-surface-high);
    padding: 3px 5px 3px 0;
    border-radius: 6px;
    transition: opacity 0.1s;
    box-sizing: border-box;

    .bd-text-input {
        flex: 1;
        margin: 0;
    }
    > *:not(:last-child):not(:first-child) {
        margin-right: 4px !important;
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
    border-radius: var(--radius-xs);
    min-width: 100px;
    height: 30px;
    padding: 5px;
    font-size: 14px;
}
`;

function SettingsPanel() {
    const generateKey = () => Math.random().toString(36).slice(2);

    const [pins, setPins] = React.useState(() => {
        const loaded = (Data.load('QuickSwitcherPins', 'pinned') || []).map(pin => ({ ...pin, _key: generateKey() }));
        if (!loaded.length || loaded[loaded.length - 1].id || loaded[loaded.length - 1].queryRegex) {
            loaded.push({ id: '', queryRegex: '', _key: generateKey() });
        }
        return loaded;
    });
    const [draggedIndex, setDraggedIndex] = React.useState(null);
    const [dragActiveIndex, setDragActiveIndex] = React.useState(null);
    const [dropTargetIndex, setDropTargetIndex] = React.useState(null);

    const savePins = (updatedPins) => {
        setPins(updatedPins);
        Data.save(
            'QuickSwitcherPins',
            'pinned',
            updatedPins.filter(pin => pin.id || pin.queryRegex).map(({ _key, ...rest }) => rest)
        );
    };

    const updatePin = (index, field, value) => {
        const nextPins = [...pins];
        nextPins[index][field] = value;

        // add a new empty row when the empty row is typed into
        if (index === nextPins.length - 1 && (nextPins[index].id || nextPins[index].queryRegex)) {
            nextPins.push({ id: '', queryRegex: '', _key: generateKey() });
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
                rce('input', {
                    className: 'bd-text-input',
                    placeholder: 'Server/user/channel/bot ID',
                    value: pin.id || '',
                    onChange: (e) => updatePin(index, 'id', e.target.value),
                    onBlur: (e) => handleBlur(index, e)
                }),
                rce('input', {
                    className: 'bd-text-input',
                    placeholder: 'Regex search must match (optional)',
                    value: pin.queryRegex || '',
                    onChange: (e) => updatePin(index, 'queryRegex', e.target.value),
                    onBlur: (e) => handleBlur(index, e)
                }),
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
