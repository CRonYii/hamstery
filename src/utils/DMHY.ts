import axios from 'axios';
import jsdom from 'jsdom';

const DMHY_BASE_URL = 'https://www.dmhy.org'
const DMHY_SEARCH_URL = 'topics/list/page'

export enum SEARCH_ID {
    ALL = 0,
    ANIME = 2,
    MANGA = 3,
    MUSIC = 4,
}

const ALL_TEAM = 0;

export const DMHYSearchByPage = async (keyword: string, search_id: SEARCH_ID, page: number) => {
    try {
        const { data } = await axios.get(`${DMHY_BASE_URL}/${DMHY_SEARCH_URL}/${page}`, {
            params: {
                keyword,
                sort_id: search_id,
                team_id: ALL_TEAM
            }
        })
        const { document } = new jsdom.JSDOM(data).window
        const results = Array.from(document.querySelectorAll('table#topic_list tbody tr'))
            .map(
                ele => {
                    const [date, category, title, link, size, seed, num_download, num_finished, uploader] = Array.from(ele.querySelectorAll('td'));
                    return {
                        date: date?.querySelector('span')?.textContent?.trim(),
                        title: Array.from(title?.querySelectorAll('a')).slice(-1)[0]?.textContent?.trim(),
                        link: link?.querySelector('a')?.getAttribute('href'),
                        size: size?.textContent?.trim(),
                        popularity: num_finished?.textContent?.trim(),
                        // category: category?.querySelector('font')?.textContent?.trim(),
                        // seed: seed?.textContent?.trim(),
                        // num_download: num_download?.textContent?.trim(),
                        // uploader: uploader?.textContent?.trim(),
                    }
                }
            );
        const footer = document.querySelector('div.table.clear div.clear div.nav_title')

        return { results, hasNext: footer?.childElementCount === 2 || footer?.children[0]?.textContent === '下一頁' };
    } catch (e) {
        console.error(e);
        return { results: [], hasNext: false };
    }
}

export const DMHYSearchAll = async (keyword: string, search_id: SEARCH_ID, limit = 0) => {
    let page = 1;
    let { results, hasNext } = await DMHYSearchByPage(keyword, search_id, page);

    while (hasNext === true && (limit === 0 || results.length < limit)) {
        page++;
        const subpage = await DMHYSearchByPage(keyword, search_id, page);
        hasNext = subpage.hasNext;
        results = [...results, ...subpage.results];
    }
    return results
}