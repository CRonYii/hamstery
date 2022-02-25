import express from 'express';
import mongoose from 'mongoose';
import api from "./api/API.js";
import initializeEnv from './utils/Env.js';
import logger from "./utils/Logger.js";
import { authenticationChecker } from './utils/RouterUtil.js';

async function startServer() {
    const app = express();

    app.use(express.json());

    app.use("/api", api(authenticationChecker(process.env.SECRET)));

    app.listen(process.env.PORT, () => {
        logger.info(`Hamstery running at port ${process.env.PORT}`);
    });
};

async function connectMongoDB() {
    return new Promise(resolve => {
        // connect to MongoDB
        const mongodbURL = process.env.MONGODB_URL;

        mongoose.connect(mongodbURL);

        mongoose.connection.on('error', (e) => {
            logger.error('MongoDB connection error. ' + e);
            resolve(false);
        });

        mongoose.connection.once('open', async () => {
            logger.info('Connected to MongoDB at ' + mongodbURL);
            resolve(true);
        });
    });
};

(async () => {
    if (!await initializeEnv()) {
        logger.error(`Server failed to start up due to Environment Variable initialization failure.`);
        return;
    }

    await connectMongoDB();
    startServer();
})();
