import * as winston from 'winston';

const errorStackFormat = winston.format(info => {
    if (info.level === 'error' && info.stack) {
        return Object.assign({}, info, {
            message: info.stack,
        })
    }
    return info;
})

const logFormat = winston.format.combine(
    errorStackFormat(),
    winston.format.timestamp(),
    winston.format.printf((info) => {
        return `${info.timestamp} ${info.level}: ${info.message}`;
    })
);

const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});
;

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize({
                colors: {
                    info: 'bold blue',
                    warn: 'italic yellow',
                    error: 'bold red',
                    debug: 'green'
                }
            }),
            logFormat
        )
    }));
}

export default logger;