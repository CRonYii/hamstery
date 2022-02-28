import mongoose from 'mongoose';
import { Aria2 } from '../utils/Aria2.js';
import { isVideoFile } from '../utils/FileUtil.js';
import logger from '../utils/Logger.js';
import { EpisodeStatus, IEpisode, ITVShowsLibrary, TVShowsLibrary } from './TVShowsLibrary.js';

export enum DownloadTaskType {
    MAGNET_SINGLE_EPISODE,
    DOWNLOAD_SINGLE_EPISODE,
};
interface DownloadTaskHandler {
    success: (task: IDownloadTask) => Promise<void>,
    fail: (task: IDownloadTask) => Promise<void>,
    cancel: (task: IDownloadTask) => Promise<void>,
}

const taskHandlers: DownloadTaskHandler[] = [];

/* Magnet Single Episode */
taskHandlers[DownloadTaskType.MAGNET_SINGLE_EPISODE] = {
    success: async (task: IDownloadTask) => {
        let { followedBy } = await Aria2.tellStatus(task.gid, ['followedBy']);
        followedBy = followedBy[0];
        const { files } = await Aria2.tellStatus(followedBy, ['files']); /* XXX: if multi, only select the video file? */
        /* Multiple or no video files exist, cannot decide, throw error */
        if (files.filter(({ path }) => isVideoFile(path)).length !== 1) {
            /* Cancel the followed task */
            Aria2.remove(followedBy, true);
            return Promise.reject('Expected one video file, but found none or more than one.');
        }
        /* Track followed task */
        const downloadTask = await new DowndloadTask({
            gid: followedBy,
            type: DownloadTaskType.DOWNLOAD_SINGLE_EPISODE,
            parameters: task.parameters
        }).save();
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);
        const lib = await TVShowsLibrary.findOne({ name: libName });
        lib.setEpisode(EpisodeStatus.DOWNLOADING, downloadTask._id, showId, seasonNumber, episodeNumber);
    },
    fail: async (task: IDownloadTask) => {
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);
        const lib = await TVShowsLibrary.findOne({ name: libName });
        lib?.setEpisode(EpisodeStatus.MISSING, '', showId, seasonNumber, episodeNumber);
    },
    cancel: async (task: IDownloadTask) => {
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);
        const lib = await TVShowsLibrary.findOne({ name: libName });
        lib?.setEpisode(EpisodeStatus.MISSING, '', showId, seasonNumber, episodeNumber);
    }
};

/* Download Single Episode */
taskHandlers[DownloadTaskType.DOWNLOAD_SINGLE_EPISODE] = {
    success: async (task: IDownloadTask) => {
        const { files } = await Aria2.tellStatus(task.gid, ['files']);

        const { path } = files.find(({ path }) => isVideoFile(path));
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);

        /* Track followed task */
        const lib = await TVShowsLibrary.findOne({ name: libName });
        if (!lib || await lib.addEpisodeFromLocalFile(path, showId, seasonNumber, episodeNumber, EpisodeStatus.DOWNLOADING) !== 'success') {
            Promise.reject('Failed to move downloaded episode to destination');
        }
    },
    fail: async (task: IDownloadTask) => {
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);
        const lib = await TVShowsLibrary.findOne({ name: libName });
        lib?.setEpisode(EpisodeStatus.MISSING, '', showId, seasonNumber, episodeNumber);
    },
    cancel: async (task: IDownloadTask) => {
        const { libName, showId, seasonNumber, episodeNumber } = JSON.parse(task.parameters);
        const lib = await TVShowsLibrary.findOne({ name: libName });
        lib?.setEpisode(EpisodeStatus.MISSING, '', showId, seasonNumber, episodeNumber);
    }
};

interface IDownloadTask extends mongoose.Document {
    gid: string,
    type: DownloadTaskType,
    parameters?: string,
    success: (this: IDownloadTask) => Promise<void>,
    fail: (this: IDownloadTask) => Promise<void>,
    cancel: (this: IDownloadTask) => Promise<void>,
    status: (this: IDownloadTask, keys?: string[]) => Promise<any>,
};

interface DownloadTaskModel extends mongoose.Model<IDownloadTask> {
    magnetDownloadTVShowEpisode: (magnetLink: string, libName: string, showId: string, seasonNumber: number, episodeNumber: number) => Promise<string>
};

/* Schema */
const DownloadTaskSchema = {
    gid: { type: String, index: true, unique: true, required: true },
    type: { type: Number, enum: DownloadTaskType, required: true },
    parameters: String
};

const DownloadTaskMongoSchema = new mongoose.Schema<IDownloadTask, DownloadTaskModel>(DownloadTaskSchema);

DownloadTaskMongoSchema.methods.success = async function (this: IDownloadTask) {
    try {
        await taskHandlers[this.type].success(this);
        logger.info(`Download task ${this.gid} completed successfully`);
        this.remove();
    } catch (e) {
        logger.error('Task success() failed: ' + e);
        this.fail();
    }
}

DownloadTaskMongoSchema.methods.fail = async function (this: IDownloadTask) {
    try {
        await taskHandlers[this.type].fail(this);
        logger.info(`Download task ${this.gid} failed`);
    } catch (e) {
        logger.error('Task fail() failed: ' + e);
    } finally {
        this.remove();
    }
}

DownloadTaskMongoSchema.methods.cancel = async function (this: IDownloadTask) {
    try {
        await taskHandlers[this.type].cancel(this);
        logger.info(`Download task ${this.gid} cancelled`);
    } catch (e) {
        logger.error('Task cancel() failed: ' + e);
    } finally {
        this.remove();
    }
}

DownloadTaskMongoSchema.methods.status = async function (this: IDownloadTask, keys?: string[]) {
    return await Aria2.tellStatus(this.gid, keys);
}

DownloadTaskMongoSchema.statics.magnetDownloadTVShowEpisode = async function (magnetLink: string, libName: string, showId: string, seasonNumber: number, episodeNumber: number) {
    const gid = await Aria2.addUri([magnetLink], { 'follow-torrent': 'mem' });
    const task = await new DowndloadTask({
        gid,
        type: DownloadTaskType.MAGNET_SINGLE_EPISODE,
        parameters: JSON.stringify({ libName, showId, seasonNumber, episodeNumber })
    }).save();
    return task._id;
};

const DowndloadTask = mongoose.model<IDownloadTask, DownloadTaskModel>('DowndloadTask', DownloadTaskMongoSchema);

export { DowndloadTask, DownloadTaskSchema };