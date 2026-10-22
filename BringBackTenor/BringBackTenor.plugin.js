/**
 * @name BringBackTenor
 * @author PurelyAndy
 * @description Brings back Tenor GIF search
 * @version 1.0.1
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/bdplugins/tree/main/BringBackTenor
 * @runAt idle
 */

"use strict";

const Bd = new BdApi('BringBackTenor');
const { Patcher, Webpack } = Bd;
const Filters = Webpack.Filters;

const API_V2_KEY = 'AIzaSyAp4Ie-x-F5nLqwoqvDFrJGI4purWdGIVo';

const KlipyTextModule = Webpack.getBySource(
    '="Klipy"',
    { map: { getSearchKlipyText: Filters.byStrings('intl') } },
);

const GIFPicker = Webpack.getBySource(
    'type:"GIF_PICKER_SUGGESTIONS_SUCCESS",',
    {
        map: {
            foundSearch: Filters.byStrings('(){var'),
            foundTrending: Filters.byStrings('.GIFS_TRENDING_GIFS,'),
            foundTrendingCategories: Filters.byStrings('.GIFS_TRENDING,'),
        },
        mapDeclarations: true
    }
);

const lodash = Webpack.getByKeys('bindAll', 'debounce');

const { GIFPickerViewStore, LocaleStore } = Webpack.Stores;
const Dispatcher = GIFPickerViewStore._dispatcher

const format = getMediaFormat(GIFPickerViewStore.getSelectedFormat());
function getMediaFormat(mediaFormat) {
    return mediaFormat === 'webm' ? 'webm' : mediaFormat === 'mp4' ? 'mp4' : mediaFormat === 'tinywebp' ? 'webp_transparent' : 'tinygif';
}

const throttledSearch = lodash.throttle((query) => {
    fetchSearchResults(query).then(async results => {
        Dispatcher.dispatch({
            type: "GIF_PICKER_QUERY_SUCCESS",
            query: query,
            items: results || await getErrGifs("unspecified error"),
        });
    }).catch(async err => {
        Dispatcher.dispatch({
            type: "GIF_PICKER_QUERY_SUCCESS",
            query: query,
            items: await getErrGifs(err.stack),
        });
    });
}, 500, { leading: true, trailing: true });

module.exports = class BringBackTenor {
    start() {
        Patcher.after(KlipyTextModule, "getSearchKlipyText", (_, __, ret) => ret.replace('Klipy', 'Tenor'))
        
        Patcher.instead(GIFPicker, "foundSearch", (_, args, __) => {
            const query = args[0];
            throttledSearch(query);
        });

        Patcher.instead(GIFPicker, "foundTrending", (_, __, ___) => {
            fetchTrendingGifsResults(50).then(results => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_QUERY_SUCCESS",
                    items: results || getErrGifs("unspecified error"),
                });
            }).catch(async err => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_QUERY_SUCCESS",
                    items: await getErrGifs(err.stack),
                });
            });
        });

        Patcher.instead(GIFPicker, "foundTrendingCategories", (_, __, ___) => {
            Promise.all([
                fetchTrendingSearchResults(),
                fetchTrendingGifsResults(1)
            ]).then(([categories, gifs]) => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_TRENDING_FETCH_SUCCESS",
                    trendingCategories: categories || getErrTrending("unspecified error"),
                    trendingGIFPreview: (gifs && gifs[0]) || getErrGif()
                });
            }).catch(async err => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_TRENDING_FETCH_SUCCESS",
                    trendingCategories: getErrTrending(err.stack),
                    trendingGIFPreview: getErrGif()
                });
            });
        });
    }
    stop() {
        Patcher.unpatchAll();
    }
};

function getErrTrending(error) {
    return [
        {
            name: "error getting trending categories",
            src: "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif"
        },
        {
            name: "",
            src: makeInfoImage(error)
        }
    ];
}

function getErrGif() {
    const errGif = {
        id: "12307037628302986948",
        title: "scrolling through errors",
        url: "https://tenor.com/view/error-windows-glitch-gif-5012719",
        src: format === "webm"
            ? "https://media.tenor.com/qsthhHhdjsQAAAPs/error-windows.webm"
            : format === "mp4"
                ? "https://media.tenor.com/qsthhHhdjsQAAAPo/error-windows.mp4"
                : format === "webp_transparent"
                    ? "https://media.tenor.com/qsthhHhdjsQAAAAl/error-windows.webp"
                    : "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif",
        gif_src: "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif",
        width: 400,
        height: 300,
        preview: "https://media.tenor.com/qsthhHhdjsQAAAAe/error-windows.png"
    };
    return errGif;
}
async function getErrGifs(error) {
    return [getErrGif(), await makeInfoVideo(error)];
}

function makeInfoImage(error) {
    const width = 400;
    const height = 300;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#171717";
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 16;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeRect(0, 0, width, height);

    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 38px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("An error occurred", 10, 10);
    ctx.fillStyle = "#80A0FF";
    ctx.font = "32px monospace";
    ctx.fillText("Click to view", 10, 44);

    ctx.font = "12px monospace";
    ctx.fillStyle = "#ffffff";

    const messageLines = error.split("\n");
    const lines = [];
    const maxWidth = width - 20;

    for (const line of messageLines) {
        const words = line.split(" ");
        let currentLine = "";

        for (const originalWord of words) {
            let word = originalWord;
            while (ctx.measureText(word).width > maxWidth) {
                let charIndex = word.length;

                while (charIndex > 0 && ctx.measureText(word.slice(0, charIndex)).width > maxWidth) {
                    charIndex--;
                }

                if (charIndex === 0) charIndex = 1;

                const part = word.slice(0, charIndex);
                word = word.slice(charIndex);

                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = "";
                }

                lines.push(part);
            }

            const candidate = currentLine ? currentLine + " " + word : word;

            if (ctx.measureText(candidate).width > maxWidth) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = candidate;
            }
        }

        lines.push(currentLine);
    }

    let y = 80;
    for (const line of lines) {
        ctx.fillText(line, 10, y);
        y += 14;
    }

    let image = canvas.toDataURL("image/jpeg", 0.2);
    for (let i = 0; i < 5; i++) {
        const idx = Math.floor(512 * Math.random()) + image.length * (0.5 + i * 0.08);
        image = image.substring(0, idx) + String.fromCharCode(Math.random() * 26 + 65) + image.substring(idx + 1);
    }
    return image;
}

async function makeInfoVideo(error) {
    const width = 400;
    const height = 300;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const preview = makeInfoImage(error);
    const img = new Image();

    const loaded = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    img.src = preview;
    await loaded;

    ctx.drawImage(img, 0, 0);

    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 1 });
    const chunks = [];

    const videoBlob = await new Promise((resolve) => {
        recorder.ondataavailable = event => {
            if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            resolve(new Blob(chunks, { type: 'video/webm;codecs=vp8' }));
        };

        recorder.start();

        let count = 0;
        const requestNextFrame = () => {
            track.requestFrame();
            count++;
            // only really makes 1 frame no matter how many times we do this as long as it's >= 5
            // i've seen it fail at 5 though so we'll do 10 to be safe
            if (count < 10) {
                requestAnimationFrame(requestNextFrame);
            } else {
                recorder.stop();
            }
        };

        requestAnimationFrame(requestNextFrame);
    });

    const videoUrl = URL.createObjectURL(videoBlob);

    return {
        id: "info-gif",
        title: error,
        url:
        `
        \`\`\`js
        ${error}
        \`\`\`
        `,
        src: videoUrl,
        gif_src: videoUrl,
        width,
        height,
        preview
    };
}

function mapGifResult(result) {
    const media = result.media_formats[format] ?? result.media_formats.tinygif;
    return {
        id: result.id,
        title: result.title,
        url: result.itemurl,
        src: media.url,
        gif_src: result.media_formats.tinygif.url,
        width: media.dims[0],
        height: media.dims[1],
        preview: result.media_formats.gifpreview.url
    };
}

function fetchTenorResults(endpoint, queryParams) {
    const url = new URL(`https://tenor.googleapis.com/v2/${endpoint}`);
    const params = {
        ...queryParams,
        media_filter: `${format},tinygif,gifpreview`,
        contentfilter: 'off',
        locale: LocaleStore.locale,
        client_key: 'tenor_web',
        key: API_V2_KEY,
        prettyPrint: 'false'
    }
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    return fetch(url)
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    console.log(`Error fetching Tenor results (endpoint: ${endpoint})`, text);
                    return Promise.reject(new Error(text));
                });
            }
            return res.json();
        });
}

function fetchSearchResults(query) {
    return fetchTenorResults('search', {
        q: query,
        limit: '50',
        fields: 'results.id,results.title,results.media_formats,results.itemurl',
        searchfilter: 'none',
        component: 'web_desktop'
    }).then(data => {
        if (!data) {
            return null;
        }
        return data.results.map(result => mapGifResult(result));
    });
}

function fetchTrendingGifsResults(limit = 50) {
    return fetchTenorResults('featured', {
        limit: String(limit),
        fields: 'results.id,results.title,results.media_formats,results.itemurl'
    }).then(data => {
        if (!data) {
            return null;
        }
        return data.results.map(result => mapGifResult(result));
    });
}

function fetchTrendingSearchResults() {
    return fetchTenorResults('categories', {
        type: 'trending',
        limit: '50',
    }).then(data => {
        if (!data) {
            return null;
        }
        return data.tags.map(result => ({
            name: result.searchterm,
            src: result.image
        }));
    });
}