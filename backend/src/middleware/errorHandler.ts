import type { ErrorRequestHandler } from "express";

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler: ErrorRequestHandler = (err: ApiError, _req, res, _next) => {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;

  if (statusCode === 500) {
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.code && { code: err.code }),
  });
};
