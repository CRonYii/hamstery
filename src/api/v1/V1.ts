import { Router } from "express";
import libraryRouter from './LibraryRouter.js'

export default (authentication) => {
    const apiv1 = Router();

    apiv1.use('/library', authentication, libraryRouter);
    
    return apiv1;
};