import { Request, Response, Router } from 'express';
import { body, param } from 'express-validator';
import path from 'path';


import { LibraryService, LibraryType, Season, Show } from '../../services/LibraryService.js'
import { ArrayOp } from '../../services/Service.js';
import { isVideoFile } from '../../utils/FileUtil.js';
import { paramIsValidDirectory, paramIsValidFile, validate } from '../../utils/RouterUtil.js';

const libraryRouter = Router();

libraryRouter.get('/', (req: Request, res: Response) => {
    res.status(200).json(LibraryService.getAll());
});

libraryRouter.post('/', validate([
    body('name')
        .isString()
        .isLength({ min: 1 })
        .custom((name) => {
            if (LibraryService.get(name) !== null) {
                throw new Error(`Library '${name}' already exist`);
            }
            return true;
        }),
    body('type').isInt({ min: LibraryType.Show, max: LibraryType.Movie }),
    body('storage').isArray(),
    paramIsValidDirectory(body, 'storage.*')
]), async (req: Request, res: Response) => {
    const { name, type, storage } = req.body;
    await LibraryService.add({ name, type, storage });
    res.status(200).json({ result: 'success' });
});

const shouldHaveLibrary = param('name')
    .custom((name) => {
        if (LibraryService.get(name) == null) {
            throw new Error(`Library '${name}' does not exist`);
        }
        return true;
    });

libraryRouter.delete('/:name', validate([shouldHaveLibrary]),
    (req: Request, res: Response) => {
        const { name } = req.params;
        LibraryService.remove(name);
        res.status(200).json({ result: 'success' });
    });

libraryRouter.get('/:name', validate([shouldHaveLibrary]),
    (req: Request, res: Response) => {
        const { name } = req.params;
        res.status(200).json(LibraryService.get(name));
    });

libraryRouter.put('/:name', validate([shouldHaveLibrary,
    body('refresh').optional().isBoolean(),
    body('name').optional().isString(),
    body('storage').optional().isArray(),
    body('storage.*.action').isInt({ min: ArrayOp.Add, max: ArrayOp.Remove }),
    paramIsValidDirectory(body, 'storage.*.directory')
]),
    async (req: Request, res: Response) => {
        const { name } = req.params;
        const { refresh, name: newName, storage } = req.body;
        await LibraryService.update(name, { name: newName, storage, refresh });
        res.status(200).json({ result: 'success' });
    });

libraryRouter.get('/:name/:storage/:show_name', validate([
    shouldHaveLibrary,
]),
    async (req: Request, res: Response) => {
        const { name, storage, show_name, } = req.params;
        const lib = LibraryService.get(name);

        const show: Show = lib.storage[path.normalize(storage)]?.shows[show_name];
        if (!show) {
            res.status(400).json({ result: 'error', reason: 'Show does not exist' });
            return;
        }

        res.status(200).json(show);
    });

libraryRouter.put('/:name/:storage/:show_name/:season_number/:episode_number', validate([
    shouldHaveLibrary,
    param('episode_number').isInt({ min: 1 }),
    paramIsValidFile(body, 'filename')
]),
    async (req: Request, res: Response) => {
        const { name, storage, show_name, season_number, episode_number } = req.params;
        const lib = LibraryService.get(name);

        const show: Show = lib.storage[path.normalize(storage)]?.shows[show_name];
        const season: Season = show?.seasons[season_number];
        if (!season) {
            res.status(400).json({ result: 'error', reason: 'Episode does not exist' });
            return;
        }
        if (season.episodes.length < Number(episode_number)) {
            res.status(400).json({ result: 'error', reason: 'Episode does not exist' });
            return;
        }
        if (season.episodes[Number(episode_number) - 1] != null) {
            res.status(400).json({ result: 'error', reason: `Episode already exist - ${season.episodes[Number(episode_number) - 1]}` });
            return;
        }

        const { filename } = req.body;
        if (!isVideoFile(filename)) {
            res.status(400).json({ result: 'error', reason: `${filename} is not a video` });
            return;
        }
        try {
            await LibraryService.addEpisodeToShow(show, season_number, episode_number, filename);
        } catch (e) {
            res.status(400).json({ result: 'error', reason: e });
            return;
        }

        res.status(200).json({ result: 'success' });
    });

export default libraryRouter;