import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const loggers = new Map();

export function getLogger(tenantId = "system") {
  if (loggers.has(tenantId)) {
    return loggers.get(tenantId);
  }

  const transport = new DailyRotateFile({
    filename: path.join("logs", tenantId, "%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d",
  });

  const logger = winston.createLogger({
    level: "info",
    format: logFormat,
    defaultMeta: { tenantId },
    transports: [
      transport,
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });

  loggers.set(tenantId, logger);
  return logger;
}
