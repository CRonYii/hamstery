import { Request, Response, Router } from 'express';
import { param } from 'express-validator';
import { DowndloadTask } from '../../models/DownloadTask.js';
import { env } from '../../utils/Env.js';
import logger from '../../utils/Logger.js';
import { validate } from '../../utils/RouterUtil.js';

const downloadRouter = Router();

/* Get download task status */
downloadRouter.get('/:id',
    validate([
        param('id')
            .isString()
            .isLength({ min: 24 })
    ]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const task = await DowndloadTask.findById(id);
            if (!task)
                return res.status(422).json('Task does not exist');
            const { totalLength, completedLength, downloadSpeed } = await task.status(['totalLength', 'completedLength', 'downloadSpeed'])
            return res.status(200).json({
                totalLength: Number(totalLength),
                completedLength: Number(completedLength),
                downloadSpeed: Number(downloadSpeed),
            });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

/* Cancel download task */
downloadRouter.delete('/:id',
    validate([
        param('id')
            .isString()
            .isLength({ min: 24 })
    ]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const task = await DowndloadTask.findById(id);
            if (!task)
                return res.status(422).json('Task does not exist');
            await task.cancel();
            return res.status(200).json({ result: 'success' });
        } catch (e) {
            logger.error(e);
            return res.status(400).json({ result: 'error', reason: e.message });
        }
    });

export default downloadRouter;