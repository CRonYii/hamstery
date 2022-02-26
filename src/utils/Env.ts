import * as dotenv from "dotenv";
import fs from 'fs';
import path from 'path';
import { isSubdir, isValidDirectory, isValidFile, toPathObject } from "./FileUtil.js";
import logger from "./Logger.js";

interface EnvVar {
    key: string,
    defaultValue?: string,
    dependsOn?: { key: string, value: string }
    handler?: (value: string) => Promise<[boolean, any]>
}

const environmentVariables: EnvVar[] = [
    { key: "NODE_ENV" },
    { key: "PORT" },
    { key: "SECRET" },
    { key: "MONGODB_URL" },
    {
        key: "AVAILABLE_DRIVES",
        handler: async (value: string) => {
            let drives = JSON.parse(value);
            const valid = (await Promise.all(drives.map(async (drive) => {
                const isValid = await isValidDirectory(path.resolve(drive));
                if (!isValid)
                    logger.error(`${drive} is not a valid directory`);
                return isValid;
            }))).every(isValid => isValid === true);
            if (!valid)
                return [false, null]
            drives = drives.map(toPathObject);
            return [valid, drives];
        }
    },
    { key: "PLEX_SUPPORT", defaultValue: "disable" },
    { key: "PLEX_URL", dependsOn: { key: "PLEX_SUPPORT", value: "enable" } },
    { key: "PLEX_TOKEN", dependsOn: { key: "PLEX_SUPPORT", value: "enable" } },
];

export const env: any = {};

export default async function () {
    logger.info('Initializing Environment Variables...');

    let success = true;

    dotenv.config({ path: ".env" });

    const checkLater = [];
    await Promise.all(environmentVariables.map(async (envVar) => {
        const { key, defaultValue, handler, dependsOn } = envVar;

        let val = process.env[key] || defaultValue;
        if (!val) {
            // we check depends on later
            if (dependsOn)
                return checkLater.push(envVar);
            logger.error(`Missing environment variable ${key}`);
            success = false;
            return;
        }
        if (handler) {
            try {
                const [handledSuccess, processedVal] = await handler(val);
                if (!handledSuccess) {
                    success = false;
                    return;
                }
                val = processedVal;
            } catch (e) {
                logger.error(e);
                return;
            }
        }
        env[key] = val;
    }));
    checkLater.forEach(({ key, dependsOn }) => {
        if (env[dependsOn.key] === dependsOn.value) {
            logger.error(`Environment variable ${key} is required when ${dependsOn.key} is ${dependsOn.value}`);
            success = false;
        }
    });

    return success;
}

export const pathIsAllowed = (dir: string) => {
    for (const parent of env.AVAILABLE_DRIVES) {
        if (isSubdir(parent.path, dir))
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