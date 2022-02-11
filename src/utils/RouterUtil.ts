import { Request, Response, NextFunction, RequestHandler } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import path from 'path'

import { isValidDirectory, isValidFile } from './FileUtil.js';

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

export const paramIsValidDirectory = (checker, key: string) => {
    return checker(key)
        .isString()
        .bail()
        .customSanitizer((value) => {
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!await isValidDirectory(dir))
                return Promise.reject(`Invalid directory '${dir}'`);
            return true;
        });
}

export const paramIsValidFile = (checker, key: string) => {
    return checker(key)
        .isString()
        .bail()
        .customSanitizer((value) => {
            return path.normalize(value);
        })
        .custom(async (dir) => {
            if (!await isValidFile(dir))
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