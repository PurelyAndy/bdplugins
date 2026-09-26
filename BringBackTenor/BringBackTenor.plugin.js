/**
 * @name BringBackTenor
 * @author PurelyAndy
 * @description Brings back Tenor GIF search
 * @version 1.0.0
 * @authorId 702958966308601957
 * @authorLink https://github.com/PurelyAndy
 * @source https://github.com/PurelyAndy/BringBackTenor
 * @runAt idle
 */

const { Webpack, Patcher } = BdApi;
const Filters = Webpack.Filters;

const API_V2_KEY = 'AIzaSyAp4Ie-x-F5nLqwoqvDFrJGI4purWdGIVo';

const KlipyTextModule = Webpack.getMangled(
    '="Klipy"',
    { getSearchKlipyText: e => e instanceof Function && e.toString().includes('intl') },
);

const GIFPicker = Webpack.getMangled(
    'type:"GIF_PICKER_SUGGESTIONS_SUCCESS",',
    {
        foundSearch: Filters.byStrings('(){var'),
        foundTrending: Filters.byStrings('.GIFS_TRENDING_GIFS,'),
        foundTrendingCategories: Filters.byStrings('.GIFS_TRENDING,'),
    },
    { mapDeclarations: true }
);

const { GIFPickerViewStore, LocaleStore } = Webpack.Stores;
const Dispatcher = GIFPickerViewStore._dispatcher

const format = getMediaFormat(GIFPickerViewStore.getSelectedFormat());
function getMediaFormat(mediaFormat) {
    return mediaFormat === 'webm' ? 'webm' : mediaFormat === 'mp4' ? 'mp4' : mediaFormat === 'tinywebp' ? 'webp_transparent' : 'tinygif';
}

module.exports = class BringBackTenor {
    start() {
        Patcher.after('BringBackTenor', KlipyTextModule, "getSearchKlipyText", (_, __, ret) => ret.replace('Klipy', 'Tenor'))
        
        Patcher.instead('BringBackTenor', GIFPicker, "foundSearch", (_, args, __) => {
            const query = args[0];
            fetchSearchResults(query).then(results => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_QUERY_SUCCESS",
                    query: query,
                    items: results || getErrGif()
                });
            });
        });

        Patcher.instead('BringBackTenor', GIFPicker, "foundTrending", (_, __, ___) => {
            fetchTrendingGifsResults(50).then(results => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_QUERY_SUCCESS",
                    items: results || getErrGif()
                });
            });
        });

        Patcher.instead('BringBackTenor', GIFPicker, "foundTrendingCategories", (_, __, ___) => {
            Promise.all([
                fetchTrendingSearchResults(),
                fetchTrendingGifsResults(1)
            ]).then(([categories, gifs]) => {
                Dispatcher.dispatch({
                    type: "GIF_PICKER_TRENDING_FETCH_SUCCESS",
                    trendingCategories: categories || getErrTrending(),
                    trendingGIFPreview: (gifs && gifs[0]) || getErrGif()[0]
                });
            });
        });
    }
    stop() {
        Patcher.unpatchAll('BringBackTenor');
    }
};

function getErrTrending() {
    return [
        {
            name: "error getting trending gifs",
            src: "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif"
        }
    ];
};

function getErrGif() {
    return [
        {
            id: "12307037628302986948",
            title: "scrolling through errors",
            url: "https://tenor.com/view/error-windows-glitch-gif-5012719",
            src: format === 'webm'
                ? "https://media.tenor.com/qsthhHhdjsQAAAPs/error-windows.webm"
                : format === 'mp4'
                    ? "https://media.tenor.com/qsthhHhdjsQAAAPo/error-windows.mp4"
                    : format == 'webp_transparent'
                        ? "https://media.tenor.com/qsthhHhdjsQAAAAl/error-windows.webp"
                        : "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif",
            gif_src: "https://media.tenor.com/qsthhHhdjsQAAAAM/error-windows.gif",
            width: 400,
            height: 300,
            preview: "https://media.tenor.com/qsthhHhdjsQAAAAe/error-windows.png"
        }
    ];
};

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
                    return null;
                });
            }
            return res.json();
        })
        .catch(err => {
            console.error('Fetch error:', err);
            return null;
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
