
import logger from './Logger.js';
import _ from 'lodash';
import { DowndloadTask } from '../models/DownloadTask.js';

let aria2: any;
let connectionPromise: Promise<void> = Promise.resolve();

enum Aria2Status {
    CLOSED,
    CONNECTED,
}

export const Aria2 = {
    status: Aria2Status.CLOSED,
    __connect: _.throttle(function () {
        if (!aria2.socket || aria2.socket.readyState === aria2.WebSocket.CLOSED) {
            connectionPromise = aria2.open();
            connectionPromise
                .catch(() => { /* do nothing*/ });
        }
    }, 10000), /* Throttle re-connection to 10 secs each time */
    connect: function () {
        /* Re-connect */
        Aria2.__connect();
        return connectionPromise;
    },
    sync: async function () {
        /*  For each download task,
         *    - stop task if download failed or download does not exist
         *    - finish task if downlaod is already completed */
        const tasks = await DowndloadTask.find().exec();
        await Promise.all(tasks.map(async (task) => {
            try {
                const { status } = await Aria2.tellStatus(task.gid, ['status']);
                if (status === 'error') {
                    task.fail();
                } else if (status === 'removed') {
                    task.cancel();
                } else if (status === 'complete') {
                    task.success();
                }
            } catch (e) {
                if (e.message.includes('is not found')) {
                    task.cancel();
                } else {
                    Promise.reject(e);
                }
            }
        }));
    },
    call: async function (method: string, ...args: any[]) {
        /* always check connection, re-connect if not connected */
        if (aria2.socket.readyState !== aria2.WebSocket.OPEN) {
            await Aria2.connect();
        }
        return aria2.call(method, ...args);
    },
    tellStatus: function (gid: string, keys?: string[]) {
        return Aria2.call('tellStatus', gid, keys);
    },
    tellActive: function (keys?: string[]) {
        return Aria2.call('tellActive', keys);
    },
    tellWaiting: function (offset: number, num: number, keys?: string[]) {
        return Aria2.call('tellWaiting', offset, num, keys);
    },
    tellStopped: function (offset: number, num: number, keys?: string[]) {
        return Aria2.call('tellStopped', offset, num, keys);
    },
};

export const initializeAria = async (aria2Client) => {
    aria2 = aria2Client;

    aria2.on('open', () => {
        Aria2.status = Aria2Status.CONNECTED;
        logger.info('aria2 websocket connected');
        Aria2.sync();
    });

    aria2.on('close', () => {
        if (Aria2.status === Aria2Status.CONNECTED)
            logger.warn('aria2 websocket closed, try re-connect');
        Aria2.status = Aria2Status.CLOSED;
        Aria2.connect();
    });

    aria2.on('onDownloadComplete', async ([gid]) => {
        const task = await DowndloadTask.findOne({ gid }).exec();
        task?.success();
    });

    aria2.on('onBtDownloadComplete', async ([gid]) => {
        const task = await DowndloadTask.findOne({ gid }).exec();
        task?.success();
    });

    aria2.on('onDownloadStop', async ([gid]) => {
        const task = await DowndloadTask.findOne({ gid }).exec();
        task?.cancel();
    });

    aria2.on('onDownloadError', async ([gid]) => {
        const task = await DowndloadTask.findOne({ gid }).exec();
        task?.fail();
    });
    try {
        await Aria2.connect();
    } catch (e) {
        logger.error('Connect aria2 failed', e);
    }
};