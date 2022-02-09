import { Router } from "express";
import apiv1 from "./v1/V1.js";

const api = Router();

api.use('/v1', apiv1);

export default api;