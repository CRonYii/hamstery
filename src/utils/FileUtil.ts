import fs from 'fs';
import path from 'path';

export const isValidDirectory = async (dir: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        fs.stat(dir, (err, s) => {
            if (err) {
                resolve(false);
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
                resolve([]);
                return;
            }
            resolve(nodes);
        })
    })
}

const videoFormats = ['.mp4', '.mkv', '.flv', '.avi', '.rmvb', '.m4p', '.m4v']

export const getVideoFiles = (files: string[]) => {
    return files.filter((f) => {
        return videoFormats.includes(path.extname(f));
    })
};

const formatShowNumber = (n) => {
    return n.toLocaleString('en-US', {
        minimumIntegerDigits: 2
    })
}

export const getSeasonEpisodeLabel = (season_number: number, episode_number: number) => {
    season_number = formatShowNumber(season_number)
    episode_number = formatShowNumber(episode_number)
    return `S${season_number}E${episode_number}`
}