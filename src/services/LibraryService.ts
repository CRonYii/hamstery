import path from 'path';
import fs from 'fs';

import { data, save } from '../utils/Database.js'
import { getSeasonEpisodeLabel, isVideoFile, isValidDirectory, listDirectory, getSeasonFolderName, createDirIfNotExist } from '../utils/FileUtil.js';
import { getTVShowDetails, searchTVShowsAll } from '../utils/TMDB.js';
import { ArrayOp } from './Service.js';

export type LibraryStorage = {
    directory: string,
    shows: ShowMap
};

export enum LibraryType {
    Show,
    Movie
};
export enum SourceType {
    TMDB
};

export type Season = {
    seasonNumber: number,
    episodes: Array<null | string>
};

export type MetaSource = {
    type: SourceType,
    id: string
};

interface SeasonwMap { [key: string]: Season; };

export type Show = {
    name: string,
    localPath: string,
    metaSource: MetaSource,
    seasons: SeasonwMap
};

export type Movie = {
    name: string,
    metaSource: MetaSource,
    localPath: string,
};

interface StorageMap { [key: string]: LibraryStorage; };
interface ShowMap { [key: string]: Show; };
interface MovieMap { [key: string]: Movie; };

export type Library = {
    name: string,
    type: LibraryType,
    storage: StorageMap,
};

const showTitleRegex = /^(.*?) ?\((\d{4})\)$/;

export type LibraryUpdateArgs = {
    name?: string,
    storage?: Array<{ action: ArrayOp; directory: string }>,
    refresh?: boolean,
};

const getAll = (): Library[] => {
    return [...Object.values(data.libs)];
};

const get = (name: string) => {
    if (!data.libs[name])
        return null;
    return data.libs[name];
};

type ValidContentDirectory = { localPath: string, name: string, yearReleased: string };

const updateShowContents = async (previousContent: ShowMap, contents: ValidContentDirectory[]): Promise<ShowMap> => {
    const results: Show[] = await Promise.all(contents.map(async (c) => {
        const source: MetaSource = { type: SourceType.TMDB, id: '' };
        const previous = previousContent[c.localPath];
        if (previous?.metaSource.type == SourceType.TMDB) {
            source.id = previous.metaSource.id;
        } else {
            const results = await searchTVShowsAll(c.name);
            for (const r of results) {
                if (new Date(r.first_air_date).getFullYear().toString() == c.yearReleased) {
                    source.id = r.id;
                    break;
                }
            }
        }
        // Could not find this show
        if (source.id == '')
            return null;
        const data = await getTVShowDetails(source.id);
        const seasonsArr: Season[] = await Promise.all(data.seasons.map(async ({ season_number, episode_count }): Promise<Season> => {
            const seasonName = getSeasonFolderName(season_number);
            const locaFiles = (await listDirectory(path.resolve(c.localPath, seasonName))).filter(isVideoFile);
            return {
                seasonNumber: season_number,
                episodes: new Array(episode_count).fill('').map((_, i) => {
                    return locaFiles.find(f => f.includes(getSeasonEpisodeLabel(season_number, i + 1)))
                })
            };
        }));
        const seasons = {};
        for (const season of seasonsArr) {
            seasons[season.seasonNumber] = season;
        }
        return {
            name: c.name,
            localPath: c.localPath,
            metaSource: source,
            seasons
        };
    }));
    const shows = {};
    for (const show of results) {
        shows[show.name] = show;
    }
    return shows;
}

const scanLibrarySingle = async (lib: Library, storage: LibraryStorage) => {
    // scan
    let dirs = await listDirectory(storage.directory);
    dirs = dirs.filter((n) => n.match(showTitleRegex) != null);
    const contents: ValidContentDirectory[] = [];
    for (const d of dirs) {
        const localPath = path.resolve(storage.directory, d);
        if (await isValidDirectory(localPath)) {
            const result = d.match(showTitleRegex);
            contents.push({ localPath, name: result[1], yearReleased: result[2] });
        }
    }
    if (lib.type == LibraryType.Show) {
        storage.shows = await updateShowContents(storage.shows, contents);
    } // TODO Moive
    save();
}

const scanLibraryAll = (lib: Library) => {
    return Promise.all(Object.values(lib.storage).map(l => scanLibrarySingle(lib, l)));
}

const libAddDirectory = async (lib: Library, dir: string) => {
    if (lib.storage[dir])
        return;
    const storage = { directory: dir, shows: {} };
    lib.storage[dir] = storage;

    await scanLibrarySingle(lib, storage);
}

const libRemoveDirectory = (lib: Library, dir: string) => {
    if (!lib.storage[dir])
        return;
    delete lib.storage[dir];
}

const add = async (args: { name: string, type: LibraryType, storage: string[] }) => {
    if (data.libs[args.name]) {
        return;
    }
    const lib: Library = { name: args.name, type: args.type, storage: {} };

    for (const s of args.storage) {
        await libAddDirectory(lib, s);
    }
    data.libs[lib.name] = lib;
    save();
};

const remove = (name: string) => {
    if (!data.libs[name]) {
        return;
    }
    delete data.libs[name];
    save();
};

const update = async (name: string, args: LibraryUpdateArgs) => {
    if (!data.libs[name]) {
        return;
    }
    const lib: Library = { ...data.libs[name] };
    if (args.refresh == true) {
        await scanLibraryAll(lib);
    }
    if (args.storage) {
        for (const s of args.storage) {
            if (s.action == ArrayOp.Remove) {
                libRemoveDirectory(lib, s.directory);
            } else if (s.action == ArrayOp.Add) {
                await libAddDirectory(lib, s.directory);
            }
        }
    }
    if (args.name && args.name != name) {
        lib.name = args.name;
        delete data.libs[name];
    }
    data.libs[lib.name] = lib;
    save();
}

const addEpisodeToShow = async (show: Show, season_number: string, episode_number: string, localPath: string) => {
    const seasonFolderName = getSeasonFolderName(Number(season_number));
    const epLabel = getSeasonEpisodeLabel(Number(season_number), Number(episode_number));
    let filename = path.basename(localPath);
    if (!filename.includes(epLabel)) {
        filename = `[${epLabel}] ${filename}`
    }

    const newPath = path.resolve(show.localPath, seasonFolderName);
    await createDirIfNotExist(newPath);
    await fs.promises.rename(localPath, path.resolve(newPath, filename));
    show.seasons[season_number].episodes[Number(episode_number) - 1] = filename;
    save();
}

export const LibraryService = {
    getAll,
    add,
    remove,
    get,
    update,
    scanLibraryAll,
    addEpisodeToShow
};