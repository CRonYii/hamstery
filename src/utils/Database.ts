import { Low, JSONFile } from 'lowdb';
import { Library } from '../services/LibraryService.js';

import logger from './Logger.js';

interface LibraryMap { [key: string]: Library; }

type HamsteryData = {
    libs: LibraryMap
};

export let data: HamsteryData;

export let save: () => void;

export const initializeDatabase = async (file) => {
    logger.info(`Loading database from ${file}`);
    const adapter = new JSONFile<HamsteryData>(file);
    const db = new Low(adapter);
    await db.read();
    db.data = db.data || { libs: {} };
    /* exports */
    data = db.data;
    save = () => db.write();
};

