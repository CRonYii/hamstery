import * as dotenv from "dotenv";
import logger from "./Logger.js";

const environmentVariables: string[] = [
    "NODE_ENV",
    "PORT",
    "SECRET",
    "MONGODB_URL"
];

export default function () {
    logger.info('Initializing Environment Variables...');
    
    let success = true;

    dotenv.config({ path: ".env" });

    environmentVariables.forEach((key: string) => {
        if (!process.env[key]) {
            logger.error(`Missing environment variable ${key}`);
            success = false;
        }
    });

    return success;
}
