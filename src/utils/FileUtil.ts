import * as fs from 'fs';

export const isValidDirectory = async (dir: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        fs.stat(dir, (err, s) => {
            if (err) {
                reject(`Invalid directory ${dir}`);
                return;
            }
            resolve(s.isDirectory());
        })
    })
}

export const listDirectory = async (dir: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, nodes) => {
            if (err) {
                reject(`Invalid directory ${dir}`);
                return;
            }
            resolve(nodes);
        })
    })
}