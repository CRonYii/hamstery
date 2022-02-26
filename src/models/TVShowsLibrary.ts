import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

import { getSeasonEpisodeLabel, isVideoFile, isValidDirectory, listDirectory, getSeasonFolderName, createDirIfNotExist, getShowFolderName, isAudioFile, isSubtitleFile } from '../utils/FileUtil.js';
import { getTVShowDetails, searchTVShowsAll, TMDB_IMAGE185_URL } from '../utils/TMDB.js';
import logger from '../utils/Logger.js';
import { refreshPlexLibraryPartially } from '../utils/Plex.js';

const showTitleRegex = /^(.*?) ?\((\d{4})\)$/;

export enum SourceType {
    TMDB = "TMDB"
};

export enum EpisodeStatus {
    DOWNLOAED = 'downloaded',
    DOWNLOADING = 'downloading',
    MISSING = 'missing',
};

/* Typescript types definition */
interface IEpisode {
    status: EpisodeStatus
    episodeNumber: number,
    path: string,
}
interface ISeason {
    seasonNumber: number,
    episodes: IEpisode[]
};

interface IMetaSource {
    type: SourceType,
    id: string
};

interface ITVShow {
    localPath: string,
    name: string,
    yearReleased: number,
    metaSource: IMetaSource,
    poster?: string,
    seasons: mongoose.Types.DocumentArray<ISeason>
};

interface IStorage {
    directory: string,
};

interface ITVShowsLibrary extends mongoose.Document {
    name: string,
    storage: mongoose.Types.DocumentArray<IStorage>,
    shows: mongoose.Types.DocumentArray<ITVShow>,
    refresh: () => Promise<void>,
    getStorage: (this: ITVShowsLibrary, storage_id: string) => IStorage,
    addShow: (this: ITVShowsLibrary, storage_id: string, tmdb_id: string, language: string) => Promise<string>,
    getShow: (this: ITVShowsLibrary, show_id: string) => ITVShow,
    getSeason: (this: ITVShowsLibrary, show_id: string, season_number: number) => ISeason,
    getEpisode: (this: ITVShowsLibrary, show_id: string, season_number: number, episode_number: number) => string,
    addEpisodeFromLocalFile: (this: ITVShowsLibrary, filename: string, show_id: string, season_number: number, episode_number: number) => Promise<string>,
};

interface TVShowsLibraryModel extends mongoose.Model<ITVShowsLibrary> {
    getAll: () => Promise<[ITVShowsLibrary]>;
};

/* Schema */
const EpisodeSchema = {
    status: { type: String, enum: EpisodeStatus, required: true },
    episodeNumber: { type: Number, required: true },
    path: String,
};

const SeasonSchema = {
    seasonNumber: { type: Number, required: true },
    episodes: [EpisodeSchema]
};

const MetaSourceSchema = {
    type: { type: String, enum: SourceType, reuqired: true },
    id: { type: String, required: true }
};

const TVShowSchema = {
    localPath: { type: String, required: true },
    name: { type: String, required: true },
    yearReleased: Number,
    metaSource: MetaSourceSchema,
    poster: String,
    seasons: [SeasonSchema]
};

const StorageSchema = {
    directory: { type: String, required: true },
};

const TVShowsLibrarySchema = {
    name: { type: String, index: true, unique: true, required: true },
    storage: [StorageSchema],
    shows: [TVShowSchema]
};

const TVShowsLibraryMongoSchema = new mongoose.Schema<ITVShowsLibrary, TVShowsLibraryModel>(TVShowsLibrarySchema);

TVShowsLibraryMongoSchema.methods.refresh = async function (this: ITVShowsLibrary) {
    logger.info(`Refresh Library "${this.name}": ${this.storage.map(s => s.directory)}`);

    /* Clear shows before */
    this.shows.splice(0, this.shows.length);
    /* scan each directory to get shows diretory */
    const shows = (await Promise.all(this.storage.map(async ({ directory }) => {
        return (await Promise.all((await listDirectory(directory))
            .map(async (showDirectory) => {
                const fullShowDirectory = path.resolve(directory, showDirectory);
                const result = showDirectory.match(showTitleRegex);
                if (!(await isValidDirectory(fullShowDirectory)) || result == null)
                    return null;
                return { fullShowDirectory, name: result[1], yearReleased: result[2] };
            })))
            .filter((showDirectory) => showDirectory != null);
    }))).flat();

    /* Retrieve TV Show data from TMDB and save in database */
    await Promise.all(shows.map(async (showDetails) => {
        const { fullShowDirectory, name, yearReleased } = showDetails;
        const metaSource: IMetaSource = { type: SourceType.TMDB, id: '' };

        const results = await searchTVShowsAll(name);
        metaSource.id = results.find((r) => new Date(r.first_air_date).getFullYear().toString() == yearReleased)?.id;

        // Could not find this show
        if (!metaSource.id)
            return;
        const data = await getTVShowDetails(metaSource.id);

        const seasons: ISeason[] = await Promise.all(data.seasons.map(async ({ season_number, episode_count }): Promise<ISeason> => {
            const seasonName = getSeasonFolderName(season_number);
            const locaFiles = (await listDirectory(path.resolve(fullShowDirectory, seasonName))).filter(isVideoFile);
            return {
                seasonNumber: season_number,
                episodes: new Array(episode_count).fill('').map((_, i) => {
                    const path = locaFiles.find(f => f.includes(getSeasonEpisodeLabel(season_number, i + 1))) || ''
                    return {
                        episodeNumber: i + 1,
                        path,
                        status: path === '' ? EpisodeStatus.MISSING : EpisodeStatus.DOWNLOAED
                    };
                })
            };
        }));
        const poster = data.poster_path ? TMDB_IMAGE185_URL + data.poster_path : undefined;
        this.shows.push({
            localPath: fullShowDirectory,
            name,
            yearReleased,
            metaSource,
            seasons,
            poster
        });
    }));
};

TVShowsLibraryMongoSchema.methods.getStorage = function (this: ITVShowsLibrary, storage_id: string) {
    return this.storage.id(storage_id);
}

TVShowsLibraryMongoSchema.methods.getShow = function (this: ITVShowsLibrary, show_id: string) {
    return this.shows.id(show_id);
}

TVShowsLibraryMongoSchema.methods.getSeason = function (this: ITVShowsLibrary, show_id: string, season_number: number) {
    const show = this.getShow(show_id);
    return show?.seasons.find(s => s.seasonNumber == season_number);
}

TVShowsLibraryMongoSchema.methods.getEpisode = function (this: ITVShowsLibrary, show_id: string, season_number: number, episode_number: number) {
    const season = this.getSeason(show_id, season_number);
    const episode_idx = episode_number - 1;
    if (!season)
        return '';
    if (season.episodes.length < episode_idx)
        return '';
    return season.episodes.length[episode_idx];
}

TVShowsLibraryMongoSchema.methods.addShow = async function (this: ITVShowsLibrary, storage_id: string, tmdb_id: string, language: string) {
    const storage = this.getStorage(storage_id);
    if (!storage)
        return ['Storage does not exist'];
    const data = await getTVShowDetails(tmdb_id, language);

    const localPath = path.resolve(storage.directory, getShowFolderName(data.name, data.first_air_date));

    if (this.shows.findIndex(show => show.localPath == localPath) != -1)
        return ['Show already existed'];

    /* Prepare show metadata */
    const seasons: ISeason[] = await Promise.all(data.seasons.map(async ({ season_number, episode_count }): Promise<ISeason> => {
        return {
            seasonNumber: season_number,
            episodes: new Array(episode_count).fill('').map((_, i) => {
                return null
            })
        };
    }));
    const yearReleased = new Date(data.first_air_date).getFullYear().toString();
    const poster = data.poster_path ? TMDB_IMAGE185_URL + data.poster_path : undefined;

    await createDirIfNotExist(localPath);
    const show = this.shows.create({
        localPath,
        name: data.name,
        yearReleased,
        metaSource: {
            type: SourceType.TMDB,
            id: tmdb_id
        },
        seasons,
        poster
    });
    this.shows.push(show);
    this.save();
    return ['success', show._id];
}

TVShowsLibraryMongoSchema.methods.addEpisodeFromLocalFile =
    async function (this: ITVShowsLibrary, filename: string, show_id: string, season_number: number, episode_number: number) {
        const show = this.getShow(show_id);
        if (!show)
            return 'Show does not exist';
        const season = this.getSeason(show_id, season_number);
        if (!season)
            return 'Season does not exist';
        const episode_idx = episode_number - 1;
        if (season.episodes.length < episode_idx)
            return 'Episode does not exist';
        if (season.episodes[episode_idx].status !== EpisodeStatus.MISSING)
            return 'Episode already exist';
        let basename = path.basename(filename, path.extname(filename));
        /* Get all related video/audio/subtitle files */
        const fileDir = path.dirname(filename);
        let files = await listDirectory(fileDir);
        files = [path.basename(filename), ...files.filter((f) => {
            return f.startsWith(basename) && (isAudioFile(f) || isSubtitleFile(f));
        })];
        /* Populate Season EP label */
        const epLabel = getSeasonEpisodeLabel(Number(season_number), Number(episode_number));
        /* Create Season Folder */
        const seasonFolderName = getSeasonFolderName(Number(season_number));
        const newPath = path.resolve(show.localPath, seasonFolderName);
        await createDirIfNotExist(newPath);
        /* Move all files to destination folder */
        const [movedVideoPath] = await Promise.all(files.map(async (f) => {
            let newFilename = f;
            if (!newFilename.includes(epLabel)) {
                newFilename = `[${epLabel}] ${newFilename}`
            }
            await fs.promises.rename(path.resolve(fileDir, f), path.resolve(newPath, newFilename));
            return newFilename;
        }));
        /* Save in database */
        season.episodes[episode_idx] = { path: movedVideoPath, episodeNumber: episode_number, status: EpisodeStatus.DOWNLOAED };
        refreshPlexLibraryPartially('show', newPath);
        this.save();
        return "success";
    }

TVShowsLibraryMongoSchema.statics.getAll = async function () {
    return await this.find().exec();
};

TVShowsLibraryMongoSchema.post<ITVShowsLibrary>('validate', async function () {
    if (!this.isNew && !this.isModified('storage'))
        return;
    await this.refresh();
});

const TVShowsLibrary = mongoose.model<ITVShowsLibrary, TVShowsLibraryModel>('TVShowsLibrary', TVShowsLibraryMongoSchema);

export { TVShowsLibrary, TVShowsLibrarySchema };