import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

import { getSeasonEpisodeLabel, isVideoFile, isValidDirectory, listDirectory, getSeasonFolderName, createDirIfNotExist, getShowFolderName, isAudioFile, isSubtitleFile, makeValidDirectoryName, saveHamsteryJSON, readHamsteryJSON } from '../utils/FileUtil.js';
import { getTVShowDetails, searchTVShowsAll, TMDB_IMAGE185_URL } from '../utils/TMDB.js';
import logger from '../utils/Logger.js';
import { refreshPlexLibraryPartially } from '../utils/Plex.js';
import { DowndloadTask } from './DownloadTask.js';

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
export interface IEpisode extends mongoose.Types.Subdocument {
    status: EpisodeStatus
    episodeNumber: number,
    path: string,
}
export interface ISeason extends mongoose.Types.Subdocument {
    seasonNumber: number,
    episodes: mongoose.Types.DocumentArray<IEpisode>
};

export interface IMetaSource {
    type: SourceType,
    id: string
};

export interface ITVShow extends mongoose.Types.Subdocument {
    localPath: string,
    name: string,
    firstAirDate: string,
    yearReleased: number,
    metaSource: IMetaSource,
    poster?: string,
    seasons: mongoose.Types.DocumentArray<ISeason>
};

export interface IStorage extends mongoose.Types.Subdocument {
    directory: string,
};

export interface ITVShowsLibrary extends mongoose.Document {
    name: string,
    storage: mongoose.Types.DocumentArray<IStorage>,
    shows: mongoose.Types.DocumentArray<ITVShow>,
    refresh: () => Promise<void>,
    getStorage: (this: ITVShowsLibrary, storage_id: string) => IStorage,
    addShow: (this: ITVShowsLibrary, storage_id: string, tmdb_id: string, language: string) => Promise<string>,
    getShow: (this: ITVShowsLibrary, show_id: string) => ITVShow,
    getSeason: (this: ITVShowsLibrary, show_id: string, season_number: number) => ISeason,
    getEpisode: (this: ITVShowsLibrary, show_id: string, season_number: number, episode_number: number) => IEpisode,
    checkEpisode: (this: ITVShowsLibrary, show_id: string, season_number: number, episode_number: number, status: EpisodeStatus) => [string, IEpisode],
    setEpisode: (this: ITVShowsLibrary, status: EpisodeStatus, path: string, show_id: string, season_number: number, episode_number: number) => Promise<void>,
    addEpisodeFromLocalFile: (this: ITVShowsLibrary, filename: string, show_id: string, season_number: number, episode_number: number, status: EpisodeStatus) => Promise<string>,
    addEpisodeFromMagnet: (this: ITVShowsLibrary, magnet_link: string, show_id: string, season_number: number, episode_number: number) => Promise<[string, string]>,
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
    firstAirDate: String,
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

// Known issue: refresh will cause downloading tasks to fail
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
                const json = await readHamsteryJSON(fullShowDirectory);
                return {
                    fullShowDirectory, name: result[1], yearReleased: result[2],
                    metaSource: {
                        id: json?.id || '',
                        type: json?.type || SourceType.TMDB,
                    }
                };
            })))
            .filter((showDirectory) => showDirectory != null);
    }))).flat();

    /* Retrieve TV Show data from TMDB and save in database */
    await Promise.all(shows.map(async (showDetails) => {
        const { fullShowDirectory, name, yearReleased, metaSource } = showDetails;

        try {
            if (!metaSource.id) {
                if (metaSource.type === SourceType.TMDB) {
                    const results = await searchTVShowsAll(name);
                    metaSource.id = results.find((r) => new Date(r.first_air_date).getFullYear().toString() == yearReleased)?.id;
                }
            }

            // Could not find this show
            if (!metaSource.id)
                return;
            if (metaSource.type === SourceType.TMDB) {
                const data = await getTVShowDetails(metaSource.id);
                const poster = data.poster_path ? TMDB_IMAGE185_URL + data.poster_path : undefined;
                const show = this.shows.create({
                    localPath: fullShowDirectory,
                    name,
                    yearReleased,
                    firstAirDate: data.first_air_date,
                    metaSource,
                    seasons: [],
                    poster
                });

                await Promise.all(data.seasons.map(async ({ season_number, episode_count }) => {
                    const seasonName = getSeasonFolderName(season_number);
                    const locaFiles = (await listDirectory(path.resolve(fullShowDirectory, seasonName))).filter(isVideoFile);
                    const season = show.seasons.create({ seasonNumber: season_number, episodes: [] });
                    new Array(episode_count).fill('').forEach((_, i) => {
                        const path = locaFiles.find(f => f.includes(getSeasonEpisodeLabel(season_number, i + 1))) || ''
                        season.episodes.push({
                            episodeNumber: i + 1,
                            path,
                            status: path === '' ? EpisodeStatus.MISSING : EpisodeStatus.DOWNLOAED
                        });
                    });
                    show.seasons.push(season);
                }));

                this.shows.push(show);
            }
        } catch (e) { 
            logger.error('Failed to scan directory: ' + e?.message);
        }
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
    return season?.episodes[episode_idx];
}

TVShowsLibraryMongoSchema.methods.checkEpisode = function (this: ITVShowsLibrary, show_id: string, season_number: number, episode_number: number, status: EpisodeStatus) {
    const episode = this.getEpisode(show_id, season_number, episode_number);
    if (!episode)
        return ['Episode does not exist'];
    if (episode.status !== status)
        return ['Episode cannot be modified'];
    return ['success', episode];
}

TVShowsLibraryMongoSchema.methods.setEpisode = function (this: ITVShowsLibrary, status: EpisodeStatus, path: string, show_id: string, season_number: number, episode_number: number) {
    const episode = this.getEpisode(show_id, season_number, episode_number);
    if (!episode)
        return;
    episode.status = status;
    episode.path = path;
    this.save();
}

TVShowsLibraryMongoSchema.methods.addShow = async function (this: ITVShowsLibrary, storage_id: string, tmdb_id: string, language: string) {
    const storage = this.getStorage(storage_id);
    if (!storage)
        return ['Storage does not exist'];
    const data = await getTVShowDetails(tmdb_id, language);

    const localPath = path.resolve(storage.directory, makeValidDirectoryName(getShowFolderName(data.name, data.first_air_date)));

    if (this.shows.findIndex(show => show.localPath == localPath) != -1)
        return ['Show already existed'];

    /* Prepare show metadata */
    const yearReleased = new Date(data.first_air_date).getFullYear().toString();
    const poster = data.poster_path ? TMDB_IMAGE185_URL + data.poster_path : undefined;
    const show = this.shows.create({
        localPath,
        name: data.name,
        firstAirDate: data.first_air_date,
        yearReleased,
        metaSource: {
            type: SourceType.TMDB,
            id: tmdb_id
        },
        seasons: [],
        poster
    });
    await Promise.all(data.seasons.map(async ({ season_number, episode_count }) => {
        show.seasons.push({
            seasonNumber: season_number,
            episodes: new Array(episode_count).fill('').map((_, i) => {
                return { episodeNumber: i + 1, status: EpisodeStatus.MISSING, path: '' }
            })
        });
    }));

    await createDirIfNotExist(localPath);
    await saveHamsteryJSON(localPath, show.metaSource);
    this.shows.push(show);
    this.save();
    return ['success', show._id];
}

TVShowsLibraryMongoSchema.methods.addEpisodeFromLocalFile =
    async function (this: ITVShowsLibrary, filename: string, show_id: string, season_number: number, episode_number: number, status: EpisodeStatus) {
        const [checkResult, episode] = this.checkEpisode(show_id, season_number, episode_number, status);
        if (checkResult !== 'success')
            return checkResult;
        const season = episode.parent() as ISeason;
        const show = season.parent() as ITVShow;
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
            const newFilename = `${show.name} - ${epLabel}.${path.extname(f)}`;
            /* XXX: Consider using symbolic link instead? */
            await fs.promises.rename(path.resolve(fileDir, f), path.resolve(newPath, newFilename));
            return newFilename;
        }));
        /* Save in database */
        episode.status = EpisodeStatus.DOWNLOAED;
        episode.path = movedVideoPath;
        refreshPlexLibraryPartially('show', newPath);
        this.save();
        return "success";
    }

TVShowsLibraryMongoSchema.methods.addEpisodeFromMagnet =
    async function (this: ITVShowsLibrary, magnet_link: string, show_id: string, season_number: number, episode_number: number) {
        const [checkResult, episode] = this.checkEpisode(show_id, season_number, episode_number, EpisodeStatus.MISSING);
        if (checkResult !== 'success')
            return [checkResult];
        const id = await DowndloadTask.magnetDownloadTVShowEpisode(magnet_link, this.name, show_id, season_number, episode_number);
        episode.status = EpisodeStatus.DOWNLOADING;
        episode.path = id;
        await this.save();
        return ['success', id];
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