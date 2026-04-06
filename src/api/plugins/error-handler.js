import fp from 'fastify-plugin';

import { AppError } from '../../lib/errors.js';

async function errorHandlerPlugin(fastify) {
  fastify.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        success: false,
        statusCode: err.statusCode,
        message: err.message,
        data: err.data,
      });
    }

    if (err.validation) {
      return reply.status(400).send({
        success: false,
        statusCode: 400,
        message: 'Validation error',
        data: err.validation,
      });
    }

    request.log.error(err);

    return reply.status(500).send({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      data: undefined,
    });
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
