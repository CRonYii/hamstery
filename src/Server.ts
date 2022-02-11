import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import initializeEnv from './utils/Env.js';
import { initializeDatabase } from './utils/Database.js';
import logger from "./utils/Logger.js";
import api from "./api/API.js";
import { authenticationChecker } from './utils/RouterUtil.js';

async function startServer() {
    const app = express();

    app.use(express.json());

    app.use("/api", api(authenticationChecker(process.env.SECRET)));

    app.listen(process.env.PORT, () => {
        logger.info(`Hamstery running at port ${process.env.PORT}`);
    });
};

async function loadDatabase() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dbfile = join(__dirname, 'db.json');

    await initializeDatabase(dbfile);
};

(async () => {
    if (!initializeEnv()) {
        logger.error(`Server failed to start up: Missing Environment Variable`);
        return;
    }

    await loadDatabase();

    startServer();
})();
