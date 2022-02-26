import { Request, Response, Router } from 'express';
import { body, oneOf, param } from 'express-validator';
import { TVShowsLibrary } from '../../models/TVShowsLibrary.js';
import { isVideoFile } from '../../utils/FileUtil.js';
import logger from '../../utils/Logger.js';
import { paramIsValidDirectory, paramIsValidFile, validate } from '../../utils/RouterUtil.js';
import { ArrayOp } from '../Service.js';

const libraryRouter = Router();

/* get all libraries */
libraryRouter.get('/', async (req: Request, res: Response) => {
    return res.status(200).json(await TVShowsLibrary.getAll());
});

/* Add Library */
libraryRouter.post('/', validate([
    body('name')
        .isString()
        .isLength({ min: 1 }),
    body('storage').isArray(),
    paramIsValidDirectory(body, 'storage.*')
]), async (req: Request, res: Response) => {
    let { name, storage } = req.body;
    storage = storage.map((directory: string) => ({ directory }));
    try {
        await new TVShowsLibrary({ name, storage }).save();
        return res.status(200).json({ result: 'success' });
    } catch (e) {
        logger.error(e);
        return res.status(400).json({ result: 'error', reason: e.message });
    }
});

/* Remove Library */
libraryRouter.delete('/:name',
    async (req: Request, res: Response) => {
        const { name } = req.params;
        try {
            await TVShowsLibrary.deleteOne({ name });
            return res.status(200).json({ result: 'success' });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Get a Library by name */
libraryRouter.get('/:name',
    async (req: Request, res: Response) => {
        const { name } = req.params;
        try {
            const lib = await TVShowsLibrary.findOne({ name });
            if (lib)
                return res.status(200).json(lib);
            return res.status(400).json({ result: 'error', reason: `Library ${name} does not exist` });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Change name/storage or refresh a library */
libraryRouter.put('/:name', validate([
    body('refresh').optional().isBoolean(),
    body('name').optional().isString(),
    body('storage').optional().isArray(),
    body('storage.*.action').isInt({ min: ArrayOp.Add, max: ArrayOp.Remove }),
    paramIsValidDirectory(body, 'storage.*.directory')
]),
    async (req: Request, res: Response) => {
        const { name } = req.params;
        const { refresh, name: newName, storage } = req.body;
        try {
            const lib = await TVShowsLibrary.findOne({ name });
            if (!lib)
                return res.status(400).json({ result: 'error', reason: `Library ${name} does not exist` });
            if (newName) {
                lib.name = newName;
            }
            if (storage) {
                for (const s of storage) {
                    const idx = lib.storage.findIndex((s1) => s1.directory == s.directory);
                    if (s.action == ArrayOp.Remove) {
                        if (idx != -1)
                            lib.storage.splice(idx, 1);
                    } else if (s.action == ArrayOp.Add) {
                        if (idx == -1)
                            lib.storage.push({ directory: s.directory });
                    }
                }
            }
            if (!storage && refresh) {
                await lib.refresh();
            }
            await lib.save();
            return res.status(200).json({ result: 'success' });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Get a show from a library */
libraryRouter.get('/:name/:show_id',
    async (req: Request, res: Response) => {
        const { name, show_id, } = req.params;
        try {
            const lib = await TVShowsLibrary.findOne({ name });
            if (!lib)
                return res.status(400).json({ result: 'error', reason: `Library ${name} does not exist` });
            const show = lib.shows.id(show_id);
            if (show)
                return res.status(200).json(show);
            return res.status(400).json({ result: 'error', reason: `Show does not exist` });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Add a show to lirabry storage */
libraryRouter.post('/:name/:storage_id', validate([
    body('tmdb_id').isNumeric(),
    body('language').optional().isString(),
]),
    async (req: Request, res: Response) => {
        const { name, storage_id } = req.params;
        try {
            const lib = await TVShowsLibrary.findOne({ name });
            if (!lib)
                return res.status(400).json({ result: 'error', reason: `Library ${name} does not exist` });

            const { tmdb_id, language } = req.body;
            const [msg, id] = await lib.addShow(storage_id, tmdb_id, language);
            if (msg == 'success')
                return res.status(200).json({ result: 'success', id });
            else
                return res.status(400).json({ result: 'error', reason: msg });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* 1. specify an episode video file in local disk 
 * 2. download an episode from magnet link */
libraryRouter.put('/:name/:show_id/:season_number/:episode_number',
    oneOf([
        paramIsValidFile(body('filename'))
            .custom(async (filename: string) => {
                if (!isVideoFile(filename))
                    return Promise.reject(`Invalid Video file '${filename}'`);
                return true;
            }),
        body('magnet_link').matches(/^magnet:\?xt=/)
    ]),
    validate([
        param('season_number').isInt({ min: 0 }),
        param('episode_number').isInt({ min: 1 }),
    ]),
    async (req: Request, res: Response) => {
        let { name, show_id, season_number, episode_number } = req.params;
        const seasonNumber = Number(season_number);
        const episodeNumber = Number(episode_number);
        try {
            const lib = await TVShowsLibrary.findOne({ name });
            if (!lib)
                return res.status(400).json({ result: 'error', reason: `Library ${name} does not exist` });
            const { filename, magnet_link } = req.body;
            if (filename) {
                const msg = await lib.addEpisodeFromLocalFile(filename, show_id, seasonNumber, episodeNumber);
                if (msg == 'success')
                    return res.status(200).json({ result: 'success' });
                else
                    return res.status(400).json({ result: 'error', reason: msg });
            } else if (magnet_link) {
                const [checkResult, episode] = lib.checkEpisode(show_id, seasonNumber, episodeNumber);
                if (checkResult !== 'success')
                    return res.status(400).json({ result: 'error', reason: checkResult });
                console.log(`Download to ${episode.episodeNumber}`);
                return res.status(200).json({ result: 'success' });
            }
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

export default libraryRouter;