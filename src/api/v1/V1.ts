import { Router } from "express";
import TVShowsLibraryRouter from './TVShowsLibraryRouter.js'

export default (authentication) => {
    const apiv1 = Router();

    apiv1.post('/', authentication, (req, res) => {
        res.status(200).send({ result: 'success' });
    });

    apiv1.use('/tvshows', authentication, TVShowsLibraryRouter);

    return apiv1;
};