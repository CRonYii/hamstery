import * as path from 'path';

import { data, save } from '../utils/Database.js'
import { isValidDirectory, listDirectory } from '../utils/FileUtil.js';
import { ArrayOp } from './Service.js';

export type LibraryStorage = {
    directory: string,
};

export enum LibraryType {
    Show,
    Movie
};
export enum SourceType {
    Local,
    TMDB
};

export type Season = {
    seasonNumber: number,
    episodes: Episode[]
};

export type Episode = {
    name: string,
    releaseDate?: string,
    seasonNumber: number,
    episodeNumber: number,
    localPath?: string,
};

export type MetaSource = {
    type: SourceType,
    id: string
};

export type Show = {
    name: string,
    metaSource: MetaSource,
    yearReleased: string,
    path: string,
    seasons: Season[]
};

export type Movie = {
    name: string,
    metaSource: MetaSource,
    yearReleased: string,
    localPath?: string,
};

export type Library = {
    name: string,
    type: LibraryType,
    storage: LibraryStorage[],
    contents: Show[] | Movie[]
};

const showTitleRegex = /^(.*?) ?\((\d{4})\)$/;

export type LibraryUpdateArgs = {
    name?: string,
    storage?: Array<{ action: ArrayOp; directory: string }>,
};

const getAll = (): Library[] => {
    return [...Object.values(data.libs)];
};

const get = (name: string) => {
    if (!data.libs[name]) {
        return null;
    }
    return data.libs[name];
};

type ValidContentDirectory = { localPath: string, name: string, yearReleased: string };

const updateShowContents = async (contents: ValidContentDirectory[]): Promise<Show[]> => {
    const results = await Promise.all(contents.map(async (c) => {
        /* TODO: Fetch Data from TMDB and populate contents */
        return c;
    }))
    console.log(results);
    return [];
}

const scanLibrarySingle = async (lib: Library, dir: string) => {
    // scan
    let dirs = await listDirectory(dir);
    dirs = dirs.filter((n) => n.match(showTitleRegex) != null);
    const contents: ValidContentDirectory[] = [];
    for (const d of dirs) {
        const localPath = path.resolve(dir, d);
        if (await isValidDirectory(localPath)) {
            const result = d.match(showTitleRegex);
            contents.push({ localPath, name: result[1], yearReleased: result[2] });
        }
    }
    if (lib.type == LibraryType.Show) {
        lib.contents = await updateShowContents(contents);
    } // TODO Moive
    save();
}

const scanLibraryAll = (lib: Library) => {
    lib.storage.forEach(l => scanLibrarySingle(lib, l.directory));
}

const libAddDirectory = async (lib: Library, dir: string) => {
    const i = lib.storage.findIndex((s) => s.directory == dir);
    if (i != -1)
        return;
    lib.storage.push({ directory: dir });

    scanLibrarySingle(lib, dir);
}

const libRemoveDirectory = (lib: Library, dir: string) => {
    const i = lib.storage.findIndex((s) => s.directory == dir);
    if (i != -1)
        lib.storage.splice(i, 1);
}

const add = async (args: { name: string, type: LibraryType, storage: string[] }) => {
    if (data.libs[args.name]) {
        return;
    }
    const lib: Library = { name: args.name, type: args.type, storage: [], contents: [] };

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

export const LibraryService = {
    getAll,
    add,
    remove,
    get,
    update,
    scanLibraryAll
};