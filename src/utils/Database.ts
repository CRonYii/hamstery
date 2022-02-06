import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low, JSONFile } from 'lowdb';

import logger from './Logger.js';

type Library = {
    name: string,
    directories: string[]
};

type HamsteryData = {
    libs: Library[]
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const file = join(__dirname, 'db.json');
const adapter = new JSONFile<HamsteryData>(file);
const db = new Low(adapter);

export const initializeDatabase = async () => {
    logger.info(`Loading database from ${file}`);
    await db.read();
    db.data = db.data || { libs: [] };
};

export const data = db.data;