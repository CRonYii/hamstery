import express from 'express';

import initializeEnv from './utils/Env.js';
import { initializeDatabase } from './utils/Database.js';
import logger from "./utils/Logger.js";

async function startServer() {
    const app = express();

    app.listen(process.env.PORT, () => {
        logger.info(`Hamstery running at port ${process.env.PORT}`);
    });
};

(async () => {
    if (!initializeEnv()) {
        logger.error(`Server failed to start up: Missing Environment Variable`);
    }
    await initializeDatabase();
    startServer();
})();
