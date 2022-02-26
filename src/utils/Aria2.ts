
import logger from './Logger.js';

enum Aria2Status {
    CLOSED,
    CONNECTED,
}

export const Aria2 = {
    status: Aria2Status.CLOSED,
    aria2: undefined,
    tellStatus: function (guid, keys) {
        if (Aria2.status === Aria2Status.CLOSED)
            return null;
        return Aria2.aria2.call('tellStatus', guid, keys);
    }
};

export default async function (aria2) {
    aria2.on('open', () => {
        Aria2.status = Aria2Status.CONNECTED
        logger.info('aria2 websocket connected');
    });

    aria2.on('close', () => {
        /* XXX: if closed unexpectedly, try re-connect peiordically? */
        Aria2.status = Aria2Status.CLOSED
        logger.info('aria2 websocket closed');
    });
    try {
        await aria2.open();
        Aria2.aria2 = aria2;
        return true;
    } catch (e) {
        logger.error(e);
        return false;
    }
};