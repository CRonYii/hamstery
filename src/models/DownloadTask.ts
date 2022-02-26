import mongoose from 'mongoose';
import logger from '../utils/Logger';

interface IDownloadTask extends mongoose.Document {
    gid: string,
    success: (this: IDownloadTask) => void,
    fail: (this: IDownloadTask) => void,
    cancel: (this: IDownloadTask) => void,
};

interface DownloadTaskModel extends mongoose.Model<IDownloadTask> {

};

/* Schema */
const DownloadTaskSchema = {
    gid: { type: String, index: true, unique: true, required: true },
};

const DownloadTaskMongoSchema = new mongoose.Schema<IDownloadTask, DownloadTaskModel>(DownloadTaskSchema);

DownloadTaskMongoSchema.methods.success = async function (this: IDownloadTask) {
    logger.info(`Download task ${this.gid} completed successfully`);
    this.remove();
}

DownloadTaskMongoSchema.methods.fail = async function (this: IDownloadTask) {
    logger.info(`Download task ${this.gid} failed`);
    this.remove();
}

DownloadTaskMongoSchema.methods.cancel = async function (this: IDownloadTask) {
    logger.info(`Download task ${this.gid} cancelled`);
    this.remove();
}

const DowndloadTask = mongoose.model<IDownloadTask, DownloadTaskModel>('DowndloadTask', DownloadTaskMongoSchema);

export { DowndloadTask, DownloadTaskSchema };