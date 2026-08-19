import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{
      workspaceId?: string;
    }>();
    return request.workspaceId;
  },
);
