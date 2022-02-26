import Aria2Client from 'aria2';
import express from 'express';
import mongoose from 'mongoose';
import api from "./api/API.js";
import initializeAria2 from './utils/Aria2.js';
import initializeEnv, { env } from './utils/Env.js';
import logger from "./utils/Logger.js";
import { authenticationChecker } from './utils/RouterUtil.js';

async function startServer() {
    const app = express();

    app.use(express.json());

    app.use("/api", api(authenticationChecker(env.SECRET)));

    app.listen(env.PORT, () => {
        logger.info(`Hamstery running at port ${env.PORT}`);
    });
};

async function connectMongoDB() {
    return new Promise(resolve => {
        // connect to MongoDB
        const mongodbURL = env.MONGODB_URL;

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

    if (!await initializeAria2(new Aria2Client({
        host: env.ARIA2_HOST,
        port: env.ARIA2_PORT,
        secret: env.ARIA2_SECRET
    }))) {
        logger.error(`Server failed to start up due to Aria2 initialization failure.`);
        return;
    }

    if (!await connectMongoDB()) {
        logger.error(`Server failed to start up due to MongoDB initialization failure.`);
        return;
    }

    startServer();
})();
