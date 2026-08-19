import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{
      organizationId?: string;
    }>();
    return request.organizationId;
  },
);
