import * as dotenv from "dotenv";
import path from 'path';
import { isValidDirectory, isValidFile, isVideoFile, toPathObject } from "./FileUtil.js";
import logger from "./Logger.js";
import fs from 'fs';

const environmentVariables: string[] = [
    "NODE_ENV",
    "PORT",
    "SECRET",
    "MONGODB_URL",
    "AVAILABLE_DRIVES"
];

export const env = {
    drives: []
};

export default async function () {
    logger.info('Initializing Environment Variables...');

    let success = true;

    dotenv.config({ path: ".env" });

    environmentVariables.forEach((key: string) => {
        if (!process.env[key]) {
            logger.error(`Missing environment variable ${key}`);
            success = false;
        }
    });

    try {
        env.drives = JSON.parse(process.env.AVAILABLE_DRIVES);
        const valid = (await Promise.all(env.drives.map(async (drive) => {
            const isValid = await isValidDirectory(path.resolve(drive));
            if (!isValid)
                logger.error(`${drive} is not a valid directory`);
            return isValid;
        }))).every(isValid => isValid === true);
        if (!valid)
            return false;
        env.drives = env.drives.map(toPathObject);
        return true;
    } catch {
        return false;
    }
}

export const pathIsAllowed = (dir: string) => {
    for (const parent of env.drives) {
        const relative = path.relative(parent.path, dir);
        const isSubdir = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (isSubdir || relative === '')
            return true;
    }
    return false;
}

export const listAllowedDirectory = async (dir: string) => {
    if (!pathIsAllowed(dir))
        throw Error('No permission to access ' + dir);
    let paths = await fs.promises.readdir(dir);
    paths = paths.map((p) => path.resolve(dir, p));
    
    const isDirectory = await Promise.all(paths.map(p => isValidDirectory(p)));
    
    return paths.filter((_, idx) => isDirectory[idx]).map(toPathObject);
}

export const listAllowedFiles = async (dir: string) => {
    if (!pathIsAllowed(dir))
        throw Error('No permission to access ' + dir);
    let paths = await fs.promises.readdir(dir);
    paths = paths.map((p) => path.resolve(dir, p));
    
    const isFile = await Promise.all(paths.map(p => isValidFile(p)));
    
    return paths.filter((_, idx) => isFile[idx]).map(toPathObject);
}