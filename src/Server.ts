import * as express from 'express';
import initializeEnv from './utils/Env';
import logger from "./utils/Logger";

async function startServer() {
    const app = express();

    app.listen(process.env.PORT, () => {
        logger.info(`Hamstery running at port ${process.env.PORT}`);
    });
}

if (initializeEnv()) {
    startServer();
} else {
    logger.error(`Server failed to start up: Missing Environment Variable`);
}
