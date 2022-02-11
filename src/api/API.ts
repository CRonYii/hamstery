import { Router } from "express";
import apiv1 from "./v1/V1.js";

export default (authentication) => {
    const api = Router();

    api.use('/v1', apiv1(authentication));

    return api;
};