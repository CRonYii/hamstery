import { Request, Response, Router } from 'express';
import { param, query } from 'express-validator';
import path from 'path';
import { DMHYSearchAll, SEARCH_ID } from '../../utils/DMHY.js';
import { env, listAllowedDirectory, listAllowedFiles } from '../../utils/Env.js';
import { fromBase64 } from '../../utils/FileUtil.js';
import logger from '../../utils/Logger.js';
import { validate } from '../../utils/RouterUtil.js';

const mediaRouter = Router();

/* List available drives */
mediaRouter.get('/list/',
    async (req: Request, res: Response) => {
        try {
            return res.status(200).json({ path: env.AVAILABLE_DRIVES });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* List contents under a directory */
mediaRouter.get('/list/:directory',
    validate([
        param('directory')
            .isBase64()
    ]),
    async (req: Request, res: Response) => {
        try {
            let { directory } = req.params;
            directory = path.normalize(fromBase64(directory));

            return res.status(200).json({ path: await listAllowedDirectory(directory), file: await listAllowedFiles(directory) });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Search resources from remote sites */
mediaRouter.get('/search/:source/:keyword',
    validate([query('limit').optional().isInt({ min: 0 })]),
    async (req: Request, res: Response) => {
        try {
            const { source, keyword } = req.params;
            const limit = Number(req.query.limit || 1);
            if (source === 'dmhy') {
                const results = await DMHYSearchAll(keyword, SEARCH_ID.ANIME, limit);

                return res.status(200).json(results);
            }
            return res.status(400).json({ result: 'error', reason: 'No such source.' });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

export default mediaRouter;