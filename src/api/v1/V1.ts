import { Router } from "express";
import TVShowsLibraryRouter from './TVShowsLibraryRouter.js'
import MediaRouter from './MediaRouter.js'

export default (authentication) => {
    const apiv1 = Router();

    apiv1.post('/', authentication, (req, res) => {
        res.status(200).send({ result: 'success' });
    });

    apiv1.use('/tvshows', authentication, TVShowsLibraryRouter);
    apiv1.use('/media', authentication, MediaRouter);

    return apiv1;
};