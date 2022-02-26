import axios from "axios";
import { env } from "./Env.js";
import { isSubdir } from "./FileUtil.js";
import logger from "./Logger.js";

const getPlexLibraries = async () => {
    try {
        const { data } = await axios.get(`${env.PLEX_URL}/library/sections?X-Plex-Token=${env.PLEX_TOKEN}`, { headers: { Accept: 'application/json' } });
        return data?.MediaContainer?.Directory || [];
    } catch (e) {
        logger.error(e);
        return [];
    }
}

const getPlexLibraryHasLocation = async (type: 'movie' | 'show', path: string) => {
    const libs = await getPlexLibraries();
    return libs.find((lib) => {
        if (lib.type !== type)
            return false;
        return lib.Location.some((l) => isSubdir(l.path, path));
    });
}

export const refreshPlexLibraryPartially = async (type: 'movie' | 'show', path: string) => {
    if (env.PLEX_SUPPORT !== 'enable')
        return;
    const lib = await getPlexLibraryHasLocation(type, path);
    if (!lib)
        return;
    try {
        await axios.get(`${env.PLEX_URL}/library/sections/${lib.key}/refresh?path=${encodeURI(path)}&X-Plex-Token=${env.PLEX_TOKEN}`, { headers: { Accept: 'application/json' } });
        logger.info(`Refresh Plex Library "${lib.title}" partially path="${path}"`);
    } catch (e) {
        logger.error(e);
    }
}