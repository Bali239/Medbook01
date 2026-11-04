import { AppError } from '../errors/AppError.js';

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (!err.isOperational) console.error('Unhandled API error', err);
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.isOperational ? err.message : 'We could not complete your request. Please try again.',
    ...(err.isOperational && err.code ? { code: err.code } : {}),
    ...(err.isOperational && err.role ? { role: err.role } : {}),
  });
};

export default errorHandler;
