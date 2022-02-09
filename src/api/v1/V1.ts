import { Router } from "express";
import libraryRouter from './LibraryRouter.js'

const apiv1 = Router();

apiv1.use('/library', libraryRouter)

export default apiv1;