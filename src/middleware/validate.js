export const validate = (schema) => {
  return (req, res, next) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        const parsedQuery = schema.query.parse(req.query);
        // Express 5 exposes req.query through a getter, so replace its
        // contents instead of assigning to req.query.
        Object.keys(req.query).forEach((key) => delete req.query[key]);
        Object.assign(req.query, parsedQuery);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      const issues = error?.issues || error?.errors || [];
      if (!issues.length) return next(error);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: issues.map((issue) => ({
          path: issue.path?.join('.') || 'request',
          message: issue.message || 'Invalid value',
          code: issue.code,
          ...(issue.expected ? { expected: issue.expected } : {}),
          ...(issue.received ? { received: issue.received } : {}),
        })),
      });
    }
  };
};
