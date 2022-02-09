import { Request, Response, Router } from 'express';
import { body, param } from 'express-validator';
import * as path from 'path';


import { LibraryService, LibraryType } from '../../services/LibraryService.js'
import { ArrayOp } from '../../services/Service.js';
import { isValidDirectory } from '../../utils/FileUtil.js';
import { validate } from '../../utils/RouterUtil.js';

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
    body('storage.*')
        .isString()
        .customSanitizer((value) => {
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!await isValidDirectory(dir))
                return Promise.reject(`Invalid directory ${dir}`);
            return true;
        })
]), async (req: Request, res: Response) => {
    const { name, type, storage } = req.body;
    await LibraryService.add({ name, type, storage });
    res.status(200).json({ result: 'success' });
});

const shouldHaveLibrary = param('name')
    .isString()
    .isLength({ min: 1 })
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
    body('name').optional().isString(),
    body('storage').optional().isArray(),
    body('storage.*.action').isInt({ min: ArrayOp.Add, max: ArrayOp.Remove }),
    body('storage.*.directory')
        .isString()
        .customSanitizer((value) => {
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!await isValidDirectory(dir))
                return Promise.reject(`Invalid directory ${dir}`);
            return true;
        })
]),
    async (req: Request, res: Response) => {
        const { name } = req.params;
        const { name: newName, storage } = req.body;
        await LibraryService.update(name, { name: newName, storage });
        res.status(200).json({ result: 'success' });
    });

export default libraryRouter;