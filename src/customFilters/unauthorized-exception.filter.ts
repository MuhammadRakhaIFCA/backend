import { ExceptionFilter, Catch, UnauthorizedException, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';

@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
    catch(exception: UnauthorizedException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        // Check if the exception response has custom properties
        const exceptionResponse = exception.getResponse();
        const isCustomResponse =
            typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            'statusCode' in exceptionResponse;

        if (isCustomResponse) {
            // Use the custom response if provided
            response.status(Number(exceptionResponse['statusCode'])).json(exceptionResponse);
        } else {
            // Default response for empty UnauthorizedException
            response.status(401).json({
                statusCode: 401,
                message: 'Unauthorized',
                data: []
            });
        }
    }
}
