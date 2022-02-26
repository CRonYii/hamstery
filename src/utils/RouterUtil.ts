import { Request, Response, NextFunction, RequestHandler } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import path from 'path'
import { pathIsAllowed } from './Env.js';

import { fromBase64, isValidDirectory, isValidFile } from './FileUtil.js';

// parallel processing
export const validate = (validations: ValidationChain[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        await Promise.all(validations.map((validation: ValidationChain) => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        res.status(400).json({ result: 'error', errors: errors.array() });
    };
};

export const authenticationChecker = (key: string): RequestHandler => (req, res, next) => {
    if (req.headers.authorization === key)
        return next();

    return res.status(400).json({ result: "Unauthorized" });
};

export const paramIsValidDirectory = (checker, key: string) => {
    return checker(key)
        .isBase64()
        .bail()
        .customSanitizer((value) => {
            value = fromBase64(value);
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!await isValidDirectory(dir))
                return Promise.reject(`Invalid directory '${dir}'`);
            return true;
        });
}

export const paramIsValidFile = (checker: any) => {
    return checker
        .isBase64()
        .bail()
        .customSanitizer((value) => {
            value = fromBase64(value);
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!pathIsAllowed(dir) || !await isValidFile(dir))
                return Promise.reject(`Invalid file '${dir}'`);
            return true;
        });
}

export const localhostOnly: RequestHandler = (req, res, next) => {
    const ip = req.ip;

    if (ip === "127.0.0.1" || ip === "::ffff:127.0.0.1" || ip === "::1")
        return next();

    res.send(400).json({ result: "error" });
}