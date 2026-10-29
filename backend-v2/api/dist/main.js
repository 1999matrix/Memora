var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// src/bootstrap/env.ts
import "dotenv/config";

// src/domain/config/env.validation.ts
import * as Joi from "joi";
var validationSchema = Joi.object({
  PORT: Joi.number().default(3e3),
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  APP_NAME: Joi.string().required(),
  APP_VERSION: Joi.string().required(),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().optional().allow(""),
  REDIS_HOST: Joi.string().default("127.0.0.1"),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(""),
  UPSTASH_REDIS_REST_URL: Joi.string().uri().optional().allow(""),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().optional().allow(""),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),
  AI_PROVIDER: Joi.string().valid("stub", "openai", "auto").default("auto"),
  OPENAI_API_KEY: Joi.when("AI_PROVIDER", {
    is: Joi.valid("openai"),
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional().allow("")
  }),
  OPENAI_CHAT_MODEL: Joi.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: Joi.string().default("text-embedding-3-small"),
  OPENAI_SUMMARY_MODEL: Joi.string().default("gpt-4o-mini"),
  EMBEDDING_DIMENSIONS: Joi.number().default(1536),
  STORAGE_ROOT: Joi.string().optional()
});

// src/bootstrap/env.ts
function loadEnv() {
  const { error } = validationSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true
  });
  if (error) {
    throw new Error(`Invalid environment: ${error.message}`);
  }
}

// src/app.ts
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

// src/http/middleware/correlation-id.ts
import { randomUUID } from "node:crypto";
function correlationId(req, res, next) {
  const incoming = req.headers["x-correlation-id"];
  const id = typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();
  req.headers["x-correlation-id"] = id;
  res.setHeader("x-correlation-id", id);
  res.locals.correlationId = id;
  next();
}

// src/lib/http-errors.ts
var HttpException = class extends Error {
  constructor(response, status) {
    const msg = typeof response === "string" ? response : Array.isArray(response.message) ? response.message.join(", ") : String(response.message);
    super(msg);
    this.response = response;
    this.status = status;
    this.name = new.target.name;
  }
  getStatus() {
    return this.status;
  }
  getResponse() {
    return this.response;
  }
};
var BadRequestException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Bad Request", 400);
  }
};
var UnauthorizedException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Unauthorized", 401);
  }
};
var ForbiddenException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Forbidden", 403);
  }
};
var NotFoundException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Not Found", 404);
  }
};
var ConflictException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Conflict", 409);
  }
};
var ServiceUnavailableException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Service Unavailable", 503);
  }
};
var TooManyRequestsException = class extends HttpException {
  constructor(objectOrError) {
    super(objectOrError ?? "Too Many Requests", 429);
  }
};

// src/http/middleware/error-handler.ts
function errorHandler(err, req, res, _next) {
  const status = err instanceof HttpException ? err.getStatus() : 500;
  let message = "Internal Server Error";
  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === "string") message = body;
    else if (typeof body === "object" && body && "message" in body) {
      message = body.message;
    }
  } else if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    message = err.message;
  }
  res.status(status).json({
    success: false,
    statusCode: status,
    path: req.url,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    message
  });
}

// src/lib/redis-rate-limit.ts
async function consume(redis, key, opts) {
  const redisKey = `ratelimit:${opts.prefix}:${key}`;
  const hits = await redis.incr(redisKey);
  if (hits === 1) {
    await redis.pexpire(redisKey, opts.windowMs);
  }
  const ttlMs = await redis.pttl(redisKey);
  const retryAfterSec = ttlMs > 0 ? Math.ceil(ttlMs / 1e3) : Math.ceil(opts.windowMs / 1e3);
  return { allowed: hits <= opts.limit, retryAfterSec };
}
function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}
function redisRateLimit(redis, opts) {
  return async (req, res, next) => {
    try {
      const { allowed, retryAfterSec } = await consume(redis, clientKey(req), opts);
      if (!allowed) {
        res.setHeader("Retry-After", String(retryAfterSec));
        next(new TooManyRequestsException("Too many requests"));
        return;
      }
      next();
    } catch {
      next();
    }
  };
}

// src/http/middleware/wrap-response.ts
function jsonEnvelope(req, res, next) {
  const skip = res.locals.skipResponseWrap === true;
  if (skip) {
    next();
    return;
  }
  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.locals.skipResponseWrap) {
      return original(body);
    }
    return original({ success: true, data: body });
  };
  next();
}

// src/http/routes.ts
import { Router } from "express";
import multer from "multer";

// src/domain/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from "class-validator";
var LoginDto = class {
  email;
  password;
};
__decorateClass([
  IsEmail()
], LoginDto.prototype, "email", 2);
__decorateClass([
  IsString(),
  MinLength(8)
], LoginDto.prototype, "password", 2);

// src/domain/modules/auth/dto/register.dto.ts
import { IsEmail as IsEmail2, IsString as IsString2, MinLength as MinLength2 } from "class-validator";
var RegisterDto = class {
  email;
  password;
  firstName;
  lastName;
};
__decorateClass([
  IsEmail2()
], RegisterDto.prototype, "email", 2);
__decorateClass([
  IsString2(),
  MinLength2(8)
], RegisterDto.prototype, "password", 2);
__decorateClass([
  IsString2(),
  MinLength2(1)
], RegisterDto.prototype, "firstName", 2);
__decorateClass([
  IsString2(),
  MinLength2(1)
], RegisterDto.prototype, "lastName", 2);

// src/lib/async-handler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

// src/lib/validate-dto.ts
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
function validateBody(Dto) {
  return async (req, _res, next) => {
    const instance = plainToInstance(Dto, req.body);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true
    });
    if (errors.length) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      next(new BadRequestException({ message: messages }));
      return;
    }
    req.body = instance;
    next();
  };
}

// src/domain/common/utils/user.util.ts
function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

// src/lib/jwt-service.ts
import jwt from "jsonwebtoken";
var JwtService = class {
  signAsync(payload, options) {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        options.secret,
        { expiresIn: options.expiresIn ?? "15m" },
        (err, token) => {
          if (err || !token) reject(err ?? new Error("JWT sign failed"));
          else resolve(token);
        }
      );
    });
  }
  verifyAsync(token, options) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, options.secret, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      });
    });
  }
};

// src/http/middleware/auth.ts
var jwt2 = new JwtService();
function requireAuth(container) {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedException("Missing bearer token"));
      return;
    }
    const token = header.slice(7);
    try {
      const payload = await jwt2.verifyAsync(token, {
        secret: container.config.getOrThrow("jwt.accessSecret")
      });
      const user = await container.users.findById(payload.sub);
      if (!user.isActive) {
        next(new UnauthorizedException("Account is inactive"));
        return;
      }
      req.user = toSafeUser(user);
      next();
    } catch {
      next(new UnauthorizedException("Invalid token"));
    }
  };
}
function requireSuperAdmin(req, _res, next) {
  if (req.user?.role !== "SUPER_ADMIN") {
    next(new UnauthorizedException("Forbidden"));
    return;
  }
  next();
}

// src/http/routes.ts
var upload = multer({ storage: multer.memoryStorage() });
function p(value) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
function pageLimit(query) {
  return {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20
  };
}
function registerRoutes(container) {
  const api = Router();
  const auth = requireAuth(container);
  const authRateLimit = redisRateLimit(container.redis, {
    prefix: "auth",
    windowMs: 6e4,
    limit: 20
  });
  api.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.locals.skipResponseWrap = true;
      res.json(await container.health.check());
    })
  );
  api.get("/health/live", (_req, res) => {
    res.locals.skipResponseWrap = true;
    res.json(container.health.live());
  });
  api.get(
    "/health/ready",
    asyncHandler(async (_req, res) => {
      res.locals.skipResponseWrap = true;
      res.json(await container.health.ready());
    })
  );
  const v1 = Router();
  v1.post(
    "/auth/register",
    authRateLimit,
    validateBody(RegisterDto),
    asyncHandler(async (req, res) => {
      res.json(await container.auth.register(req.body));
    })
  );
  v1.post(
    "/auth/login",
    authRateLimit,
    validateBody(LoginDto),
    asyncHandler(async (req, res) => {
      res.json(await container.auth.login(req.body));
    })
  );
  v1.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      res.json(await container.auth.refresh(req.body.refreshToken));
    })
  );
  v1.post(
    "/auth/logout",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.auth.logout(user.id));
    })
  );
  v1.get(
    "/auth/me",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.auth.me(user.id));
    })
  );
  v1.get(
    "/users/me",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.users.findSafeById(user.id));
    })
  );
  v1.patch(
    "/users/me",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.users.updateMe(user.id, req.body));
    })
  );
  v1.get(
    "/users/:id",
    auth,
    asyncHandler(async (req, res) => {
      res.json(await container.users.findSafeById(p(req.params.id)));
    })
  );
  v1.post(
    "/organizations",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.organizations.create(user.id, req.body));
    })
  );
  v1.get(
    "/organizations",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const { page, limit } = pageLimit(req.query);
      res.json(await container.organizations.findAllForUser(user.id, page, limit));
    })
  );
  v1.get(
    "/organizations/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.organizations.findOne(user.id, p(req.params.id)));
    })
  );
  v1.patch(
    "/organizations/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.organizations.update(user.id, p(req.params.id), req.body)
      );
    })
  );
  v1.delete(
    "/organizations/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.organizations.remove(user.id, p(req.params.id)));
    })
  );
  v1.get(
    "/organizations/:id/members",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.organizations.listMembers(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/organizations/:id/members",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.organizations.addMember(user.id, p(req.params.id), req.body)
      );
    })
  );
  v1.patch(
    "/organizations/:id/members/:userId",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.organizations.updateMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
          req.body
        )
      );
    })
  );
  v1.delete(
    "/organizations/:id/members/:userId",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.organizations.removeMember(
          user.id,
          p(req.params.id),
          p(req.params.userId)
        )
      );
    })
  );
  v1.post(
    "/workspaces",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.workspaces.create(user.id, req.body));
    })
  );
  v1.get(
    "/workspaces",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const { page, limit } = pageLimit(req.query);
      res.json(await container.workspaces.findAllForUser(user.id, page, limit));
    })
  );
  v1.get(
    "/workspaces/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.workspaces.findOne(user.id, p(req.params.id)));
    })
  );
  v1.patch(
    "/workspaces/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.workspaces.update(user.id, p(req.params.id), req.body));
    })
  );
  v1.delete(
    "/workspaces/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.workspaces.remove(user.id, p(req.params.id)));
    })
  );
  v1.get(
    "/workspaces/:id/members",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.workspaces.listMembers(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/workspaces/:id/members",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.workspaces.addMember(user.id, p(req.params.id), req.body)
      );
    })
  );
  v1.patch(
    "/workspaces/:id/members/:userId",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.workspaces.updateMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
          req.body
        )
      );
    })
  );
  v1.delete(
    "/workspaces/:id/members/:userId",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.workspaces.removeMember(
          user.id,
          p(req.params.id),
          p(req.params.userId)
        )
      );
    })
  );
  v1.post(
    "/workspaces/:workspaceId/documents",
    auth,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.documents.upload(
          user.id,
          p(req.params.workspaceId),
          req.file
        )
      );
    })
  );
  v1.get(
    "/workspaces/:workspaceId/documents",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const { page, limit } = pageLimit(req.query);
      res.json(
        await container.documents.findAll(
          user.id,
          p(req.params.workspaceId),
          page,
          limit
        )
      );
    })
  );
  v1.get(
    "/documents/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.documents.findOne(user.id, p(req.params.id)));
    })
  );
  v1.delete(
    "/documents/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.documents.remove(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/documents/:id/reprocess",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.documents.reprocess(user.id, p(req.params.id)));
    })
  );
  v1.get("/connectors/types", auth, (_req, res) => {
    res.json(container.connectors.listTypes());
  });
  v1.post(
    "/workspaces/:workspaceId/connectors",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.connectors.create(
          user.id,
          p(req.params.workspaceId),
          req.body
        )
      );
    })
  );
  v1.get(
    "/workspaces/:workspaceId/connectors",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.connectors.findAll(user.id, p(req.params.workspaceId))
      );
    })
  );
  v1.get(
    "/connectors/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.connectors.findOne(user.id, p(req.params.id)));
    })
  );
  v1.patch(
    "/connectors/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.connectors.update(user.id, p(req.params.id), req.body));
    })
  );
  v1.delete(
    "/connectors/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.connectors.remove(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/connectors/:id/test",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.connectors.testConnection(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/connectors/:id/sync",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.connectors.enqueueSync(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/workspaces/:workspaceId/retrieval/search",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const { query, topK } = req.body;
      res.json(
        await container.retrieval.search(
          user.id,
          p(req.params.workspaceId),
          query,
          topK
        )
      );
    })
  );
  v1.post(
    "/workspaces/:workspaceId/chat",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const { message, conversationId } = req.body;
      res.locals.skipResponseWrap = true;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      try {
        for await (const event of container.chat.streamChat(
          user.id,
          p(req.params.workspaceId),
          message,
          conversationId
        )) {
          res.write(`data: ${JSON.stringify(event)}

`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Chat failed";
        res.write(`data: ${JSON.stringify({ type: "error", message: msg })}

`);
      }
      res.end();
    })
  );
  v1.get(
    "/workspaces/:workspaceId/conversations",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.chat.listConversations(user.id, p(req.params.workspaceId))
      );
    })
  );
  v1.get(
    "/conversations/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.chat.getConversation(user.id, p(req.params.id)));
    })
  );
  v1.get(
    "/conversations/:id/memory",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.chat.getMemory(user.id, p(req.params.id)));
    })
  );
  v1.delete(
    "/conversations/:id",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(await container.chat.deleteConversation(user.id, p(req.params.id)));
    })
  );
  v1.post(
    "/messages/:messageId/feedback",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.feedback.create(user.id, p(req.params.messageId), req.body)
      );
    })
  );
  v1.get(
    "/workspaces/:workspaceId/feedback",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.feedback.listForWorkspace(user.id, p(req.params.workspaceId))
      );
    })
  );
  v1.get(
    "/workspaces/:workspaceId/summaries",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.summaries.listForWorkspace(user.id, p(req.params.workspaceId))
      );
    })
  );
  v1.post(
    "/workspaces/:workspaceId/summaries/refresh",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.summaries.enqueueWorkspace(
          user.id,
          p(req.params.workspaceId)
        )
      );
    })
  );
  v1.post(
    "/connectors/:id/summaries/refresh",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.summaries.enqueueConnector(user.id, p(req.params.id))
      );
    })
  );
  v1.post(
    "/documents/:id/summaries/refresh",
    auth,
    asyncHandler(async (req, res) => {
      const user = req.user;
      res.json(
        await container.summaries.enqueueDocumentForUser(user.id, p(req.params.id))
      );
    })
  );
  const admin = [auth, requireSuperAdmin];
  v1.get(
    "/admin/dashboard",
    ...admin,
    asyncHandler(async (_req, res) => {
      res.json(await container.admin.dashboard());
    })
  );
  v1.get(
    "/analytics/costs",
    ...admin,
    asyncHandler(async (req, res) => {
      const organizationId = req.query.organizationId;
      res.json(await container.analytics.costSummary(organizationId));
    })
  );
  v1.post(
    "/evaluation/runs",
    ...admin,
    asyncHandler(async (req, res) => {
      const user = req.user;
      const body = req.body;
      res.json(
        await container.evaluation.run({
          userId: user.id,
          workspaceId: body.workspaceId,
          topK: body.topK,
          createdById: user.id
        })
      );
    })
  );
  v1.get(
    "/evaluation/runs",
    ...admin,
    asyncHandler(async (_req, res) => {
      res.json(await container.evaluation.listRuns());
    })
  );
  api.use("/api/v1", v1);
  return api;
}

// src/http/swagger.ts
import swaggerUi from "swagger-ui-express";
function mountSwagger(app, config2) {
  const title = config2.get("app.name") ?? "Enterprise AI Assistant";
  const version = config2.get("app.version") ?? "1.0.0";
  const spec = {
    openapi: "3.0.3",
    info: {
      title,
      description: "Enterprise Knowledge Assistant APIs",
      version
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {}
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          security: [],
          summary: "Health check"
        }
      },
      "/health/live": {
        get: {
          tags: ["Health"],
          security: [],
          summary: "Liveness probe"
        }
      },
      "/health/ready": {
        get: {
          tags: ["Health"],
          security: [],
          summary: "Readiness probe"
        }
      },
      "/api/v1/auth/register": {
        post: {
          tags: ["Auth"],
          security: [],
          summary: "Register"
        }
      },
      "/api/v1/auth/login": {
        post: {
          tags: ["Auth"],
          security: [],
          summary: "Login"
        }
      },
      "/api/v1/auth/refresh": {
        post: {
          tags: ["Auth"],
          security: [],
          summary: "Refresh tokens"
        }
      },
      "/api/v1/auth/logout": {
        post: { tags: ["Auth"], summary: "Logout" }
      },
      "/api/v1/auth/me": {
        get: { tags: ["Auth"], summary: "Current user (auth)" }
      },
      "/api/v1/users/me": {
        get: { tags: ["Users"], summary: "Current user profile" },
        patch: { tags: ["Users"], summary: "Update profile" }
      },
      "/api/v1/users/{id}": {
        get: { tags: ["Users"], summary: "User by id" }
      },
      "/api/v1/organizations": {
        post: { tags: ["Organizations"], summary: "Create organization" },
        get: { tags: ["Organizations"], summary: "List organizations" }
      },
      "/api/v1/organizations/{id}": {
        get: { tags: ["Organizations"], summary: "Get organization" },
        patch: { tags: ["Organizations"], summary: "Update organization" },
        delete: { tags: ["Organizations"], summary: "Delete organization" }
      },
      "/api/v1/organizations/{id}/members": {
        get: { tags: ["Organizations"], summary: "List members" },
        post: { tags: ["Organizations"], summary: "Add member" }
      },
      "/api/v1/organizations/{id}/members/{userId}": {
        patch: { tags: ["Organizations"], summary: "Update member role" },
        delete: { tags: ["Organizations"], summary: "Remove member" }
      },
      "/api/v1/workspaces": {
        post: { tags: ["Workspaces"], summary: "Create workspace" },
        get: { tags: ["Workspaces"], summary: "List workspaces" }
      },
      "/api/v1/workspaces/{id}": {
        get: { tags: ["Workspaces"], summary: "Get workspace" },
        patch: { tags: ["Workspaces"], summary: "Update workspace" },
        delete: { tags: ["Workspaces"], summary: "Delete workspace" }
      },
      "/api/v1/workspaces/{id}/members": {
        get: { tags: ["Workspaces"], summary: "List workspace members" },
        post: { tags: ["Workspaces"], summary: "Add workspace member" }
      },
      "/api/v1/workspaces/{id}/members/{userId}": {
        patch: { tags: ["Workspaces"], summary: "Update workspace member" },
        delete: { tags: ["Workspaces"], summary: "Remove workspace member" }
      },
      "/api/v1/workspaces/{workspaceId}/documents": {
        post: {
          tags: ["Documents"],
          summary: "Upload document (multipart field: file)"
        },
        get: { tags: ["Documents"], summary: "List workspace documents" }
      },
      "/api/v1/documents/{id}": {
        get: { tags: ["Documents"], summary: "Get document" },
        delete: { tags: ["Documents"], summary: "Delete document" }
      },
      "/api/v1/documents/{id}/reprocess": {
        post: { tags: ["Documents"], summary: "Reprocess document" }
      },
      "/api/v1/connectors/types": {
        get: { tags: ["Connectors"], summary: "List connector types" }
      },
      "/api/v1/workspaces/{workspaceId}/connectors": {
        post: { tags: ["Connectors"], summary: "Create connector" },
        get: { tags: ["Connectors"], summary: "List connectors" }
      },
      "/api/v1/connectors/{id}": {
        get: { tags: ["Connectors"], summary: "Get connector" },
        patch: { tags: ["Connectors"], summary: "Update connector" },
        delete: { tags: ["Connectors"], summary: "Delete connector" }
      },
      "/api/v1/connectors/{id}/test": {
        post: { tags: ["Connectors"], summary: "Test connector" }
      },
      "/api/v1/connectors/{id}/sync": {
        post: { tags: ["Connectors"], summary: "Enqueue connector sync" }
      },
      "/api/v1/workspaces/{workspaceId}/retrieval/search": {
        post: { tags: ["Retrieval"], summary: "Semantic search" }
      },
      "/api/v1/workspaces/{workspaceId}/chat": {
        post: {
          tags: ["Chat"],
          summary: "Stream chat (SSE)",
          description: "Returns text/event-stream, not JSON envelope"
        }
      },
      "/api/v1/workspaces/{workspaceId}/conversations": {
        get: { tags: ["Chat"], summary: "List conversations" }
      },
      "/api/v1/conversations/{id}": {
        get: { tags: ["Chat"], summary: "Get conversation" },
        delete: { tags: ["Chat"], summary: "Delete conversation" }
      },
      "/api/v1/conversations/{id}/memory": {
        get: { tags: ["Chat"], summary: "Conversation memory" }
      },
      "/api/v1/messages/{messageId}/feedback": {
        post: { tags: ["Feedback"], summary: "Submit feedback" }
      },
      "/api/v1/workspaces/{workspaceId}/feedback": {
        get: { tags: ["Feedback"], summary: "List workspace feedback" }
      },
      "/api/v1/workspaces/{workspaceId}/summaries": {
        get: { tags: ["Summaries"], summary: "List summaries" }
      },
      "/api/v1/workspaces/{workspaceId}/summaries/refresh": {
        post: { tags: ["Summaries"], summary: "Refresh workspace summary" }
      },
      "/api/v1/connectors/{id}/summaries/refresh": {
        post: { tags: ["Summaries"], summary: "Refresh connector summary" }
      },
      "/api/v1/documents/{id}/summaries/refresh": {
        post: { tags: ["Summaries"], summary: "Refresh document summary" }
      },
      "/api/v1/admin/dashboard": {
        get: { tags: ["Admin"], summary: "Admin dashboard" }
      },
      "/api/v1/analytics/costs": {
        get: { tags: ["Analytics"], summary: "Cost summary" }
      },
      "/api/v1/evaluation/runs": {
        post: { tags: ["Evaluation"], summary: "Run evaluation" },
        get: { tags: ["Evaluation"], summary: "List evaluation runs" }
      }
    }
  };
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
}

// src/app.ts
function createApp(container) {
  const app = express();
  app.use(
    pinoHttp({
      redact: ["req.headers.authorization", "req.body.password", "req.body.refreshToken"]
    })
  );
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: true, credentials: true }));
  app.use(correlationId);
  app.use(
    redisRateLimit(container.redis, {
      prefix: "global",
      windowMs: 6e4,
      limit: 100
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(jsonEnvelope);
  mountSwagger(app, container.config);
  app.use(registerRoutes(container));
  app.use(errorHandler);
  return app;
}

// src/lib/container.ts
import { Queue } from "bullmq";

// src/domain/ai/ai-provider.ts
function resolveAiProvider(raw2, apiKey) {
  const mode = raw2?.trim().toLowerCase();
  if (mode === "openai") {
    return "openai";
  }
  if (mode === "stub") {
    return "stub";
  }
  return apiKey?.trim() ? "openai" : "stub";
}

// src/lib/logger.ts
var Logger = class {
  constructor(context) {
    this.context = context;
  }
  log(message) {
    console.log(`[${this.context}] ${message}`);
  }
  warn(message) {
    console.warn(`[${this.context}] ${message}`);
  }
  error(message) {
    console.error(`[${this.context}] ${message}`);
  }
  debug(message) {
    console.debug(`[${this.context}] ${message}`);
  }
};

// src/domain/ai/retrieval-eval.util.ts
function heuristicRetrievalJudge(request) {
  const blob = request.retrievedContext.toLowerCase();
  const hasContext = blob.trim().length > 20;
  const answerRelevance = request.expectedAnswerHints.some(
    (h) => blob.includes(h.toLowerCase())
  ) ? 1 : hasContext ? 0.35 : 0.1;
  const faithfulness = hasContext ? 0.75 : 0.15;
  return { answerRelevance, faithfulness };
}

// src/domain/ai/llm-rerank.util.ts
function lexicalRerank(query, chunks) {
  if (chunks.length <= 1) {
    return chunks;
  }
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const scoreChunk = (c) => {
    const text = `${c.documentName} ${c.content}`.toLowerCase();
    const termHits = terms.reduce(
      (n, t) => n + (text.includes(t) ? 1 : 0),
      0
    );
    return termHits * 10 + c.score;
  };
  return [...chunks].sort((a, b) => scoreChunk(b) - scoreChunk(a));
}
function applyRerankScores(chunks, scores) {
  const byIndex = new Map(scores.map((s) => [s.index, s.score]));
  const ranked = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: byIndex.get(index) ?? chunk.score
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map(({ chunk, score }) => ({ ...chunk, score }));
}
function parseRerankScoresJson(raw2, maxIndex) {
  const parsed = JSON.parse(raw2);
  if (!Array.isArray(parsed.scores)) {
    return [];
  }
  return parsed.scores.filter(
    (s) => Number.isFinite(s.index) && s.index >= 0 && s.index < maxIndex && Number.isFinite(s.score)
  );
}

// src/domain/ai/http-ai.client.ts
var HttpAiClient = class _HttpAiClient {
  logger = new Logger(_HttpAiClient.name);
  baseUrl;
  constructor(config2) {
    const url = config2.get("ai.serviceUrl")?.replace(/\/$/, "");
    if (!url) {
      throw new Error("HttpAiClient requires ai.serviceUrl");
    }
    this.baseUrl = url;
  }
  async postJson(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI service ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }
  async extractText(input) {
    const data = await this.postJson("/v1/extract", {
      filename: input.filename,
      mime_type: input.mimeType,
      content_base64: input.buffer.toString("base64")
    });
    return data.text;
  }
  async chunkText(text) {
    const data = await this.postJson(
      "/v1/chunk",
      { text }
    );
    return data.chunks;
  }
  async embed(texts) {
    const data = await this.postJson(
      "/v1/embed",
      { texts }
    );
    return data.embeddings;
  }
  async rerank(query, chunks) {
    return lexicalRerank(query, chunks);
  }
  async *chatStream(request) {
    const res = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: request.question,
        contexts: request.contexts,
        history: request.history,
        conversation_summary: request.conversationSummary
      })
    });
    if (!res.ok || !res.body) {
      throw new Error(`AI chat stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const block of parts) {
        const line = block.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === "token" && payload.content) {
            yield payload.content;
          }
        } catch {
          this.logger.warn("Skipped malformed SSE chunk from AI service");
        }
      }
    }
  }
  async summarizeConversation(request) {
    const question = "Summarize the conversation for future context.";
    let out = "";
    for await (const t of this.chatStream({
      question,
      contexts: [],
      history: request.messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      conversationSummary: request.previousSummary
    })) {
      out += t;
    }
    return out.slice(0, 1500);
  }
  async summarizeKnowledge(request) {
    let out = "";
    for await (const t of this.chatStream({
      question: `Summarize this ${request.kind} titled "${request.title}"`,
      contexts: [
        {
          chunkId: "summary",
          documentId: "summary",
          documentName: request.title,
          content: request.text.slice(0, 8e3),
          score: 1
        }
      ],
      history: [],
      conversationSummary: null
    })) {
      out += t;
    }
    return out.slice(0, 1200);
  }
  async judgeRetrievalContext(request) {
    return heuristicRetrievalJudge(request);
  }
};

// src/domain/ai/openai-ai.client.ts
import mammoth from "mammoth";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
var CHAT_SYSTEM = `You are Memora, an enterprise knowledge assistant.
Answer using ONLY the provided context and conversation summary when relevant.
If the context does not contain enough information, say so clearly \u2014 do not invent facts.
End with a "Sources:" section listing citation numbers you used, e.g. [1] Document name - Page N.
Use the citation numbers from the context blocks.`;
var OpenAiAiClient = class _OpenAiAiClient {
  constructor(config2) {
    this.config = config2;
  }
  logger = new Logger(_OpenAiAiClient.name);
  client;
  chatModel;
  embeddingModel;
  summaryModel;
  pendingChatUsage = null;
  onModuleInit() {
    const apiKey = this.config.get("ai.openai.apiKey");
    if (resolveAiProvider(this.config.get("ai.provider"), apiKey) !== "openai") {
      return;
    }
    this.initClient(apiKey);
  }
  initClient(apiKey) {
    if (this.client) {
      return;
    }
    this.client = new OpenAI({ apiKey });
    this.chatModel = this.config.get("ai.openai.chatModel") ?? "gpt-4o-mini";
    this.embeddingModel = this.config.get("ai.openai.embeddingModel") ?? "text-embedding-3-small";
    this.summaryModel = this.config.get("ai.openai.summaryModel") ?? "gpt-4o-mini";
    this.logger.log(
      `OpenAI AI client ready (chat=${this.chatModel}, embed=${this.embeddingModel})`
    );
  }
  ensureClient() {
    const apiKey = this.config.get("ai.openai.apiKey");
    if (!apiKey?.trim()) {
      throw new Error(
        "OpenAI is active but OPENAI_API_KEY is missing. Set the key or AI_PROVIDER=stub."
      );
    }
    this.initClient(apiKey);
    return this.client;
  }
  /** Consumes and clears usage from the last chatStream call. */
  readChatUsage() {
    const usage = this.pendingChatUsage;
    this.pendingChatUsage = null;
    return usage;
  }
  async extractText(input) {
    const name = input.filename.toLowerCase();
    if (input.mimeType === "text/plain" || input.mimeType === "text/markdown" || name.endsWith(".txt") || name.endsWith(".md")) {
      return input.buffer.toString("utf8");
    }
    if (input.mimeType === "application/pdf" || name.endsWith(".pdf")) {
      const parser = new PDFParse({ data: input.buffer });
      try {
        const textResult = await parser.getText();
        return textResult.text?.trim() || "";
      } finally {
        await parser.destroy();
      }
    }
    if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      return result.value?.trim() || "";
    }
    throw new Error(
      `Unsupported document type for extraction: ${input.mimeType} (${input.filename})`
    );
  }
  async chunkText(text) {
    const size = 800;
    const overlap = 100;
    const chunks = [];
    let i = 0;
    let index = 0;
    while (i < text.length) {
      const content = text.slice(i, i + size).trim();
      if (content) {
        chunks.push({
          content,
          chunkIndex: index,
          pageNumber: Math.floor(index / 3) + 1
        });
        index += 1;
      }
      i += size - overlap;
    }
    return chunks.length ? chunks : [{ content: text || "empty", chunkIndex: 0, pageNumber: 1 }];
  }
  async embed(texts) {
    if (!texts.length) return [];
    const client = this.ensureClient();
    const batchSize = 64;
    const vectors = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await client.embeddings.create({
        model: this.embeddingModel,
        input: batch
      });
      vectors.push(
        ...response.data.sort((a, b) => a.index - b.index).map((row) => row.embedding)
      );
    }
    return vectors;
  }
  async rerank(query, chunks) {
    if (chunks.length <= 1) {
      return chunks;
    }
    const limited = chunks.slice(0, 20);
    const listing = limited.map(
      (c, i) => `[${i}] ${c.documentName}
${c.content.slice(0, 500).replace(/\s+/g, " ")}`
    ).join("\n\n");
    try {
      const response = await this.ensureClient().chat.completions.create({
        model: this.summaryModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: 'Score each passage for relevance to the user query. Return JSON only: {"scores":[{"index":number,"score":number}]} with score from 0 to 1.'
          },
          {
            role: "user",
            content: `Query: ${query}

Passages:
${listing}`
          }
        ]
      });
      const raw2 = response.choices[0]?.message?.content?.trim();
      if (!raw2) {
        return lexicalRerank(query, limited);
      }
      const scores = parseRerankScoresJson(raw2, limited.length);
      if (!scores.length) {
        return lexicalRerank(query, limited);
      }
      return applyRerankScores(limited, scores);
    } catch (err) {
      this.logger.warn(
        `LLM rerank failed, using lexical fallback: ${err instanceof Error ? err.message : err}`
      );
      return lexicalRerank(query, limited);
    }
  }
  async judgeRetrievalContext(request) {
    if (!request.retrievedContext.trim()) {
      return { answerRelevance: 0, faithfulness: 0 };
    }
    try {
      const response = await this.ensureClient().chat.completions.create({
        model: this.summaryModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: 'You judge retrieval quality for RAG eval. Return JSON only: {"answerRelevance":0-1,"faithfulness":0-1}. answerRelevance: could the context help answer the question? faithfulness: is the context internally consistent and on-topic (not junk)?'
          },
          {
            role: "user",
            content: [
              `Question: ${request.question}`,
              `Expected answer themes (hints): ${request.expectedAnswerHints.join(", ") || "(none)"}`,
              "",
              "Retrieved context:",
              request.retrievedContext.slice(0, 12e3)
            ].join("\n")
          }
        ]
      });
      const raw2 = response.choices[0]?.message?.content?.trim();
      if (!raw2) {
        return heuristicRetrievalJudge(request);
      }
      const parsed = JSON.parse(raw2);
      const clamp = (n) => typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
      return {
        answerRelevance: clamp(parsed.answerRelevance),
        faithfulness: clamp(parsed.faithfulness)
      };
    } catch (err) {
      this.logger.warn(
        `LLM eval judge failed, using heuristic: ${err instanceof Error ? err.message : err}`
      );
      return heuristicRetrievalJudge(request);
    }
  }
  async *chatStream(request) {
    this.pendingChatUsage = null;
    const stream = await this.ensureClient().chat.completions.create({
      model: this.chatModel,
      messages: this.buildChatMessages(request),
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
      if (chunk.usage) {
        this.pendingChatUsage = {
          provider: "openai",
          model: this.chatModel,
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0
        };
      }
    }
  }
  async summarizeConversation(request) {
    const response = await this.ensureClient().chat.completions.create({
      model: this.summaryModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Compress the conversation into a concise rolling summary for future turns. Preserve facts, decisions, and open questions. Max ~400 words."
        },
        {
          role: "user",
          content: [
            request.previousSummary ? `Previous summary:
${request.previousSummary}` : "Previous summary: (none)",
            "",
            "New messages to fold in:",
            ...request.messages.map((m) => `${m.role}: ${m.content}`)
          ].join("\n")
        }
      ]
    });
    return (response.choices[0]?.message?.content?.trim() || request.previousSummary || "").slice(0, 1500);
  }
  async summarizeKnowledge(request) {
    const response = await this.ensureClient().chat.completions.create({
      model: this.summaryModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Write a structured ${request.kind} knowledge summary for search and chat retrieval. Use bullet points where helpful. Max ~800 words.`
        },
        {
          role: "user",
          content: `Title: ${request.title}

Content:
${request.text.slice(0, 12e4)}`
        }
      ]
    });
    return (response.choices[0]?.message?.content?.trim() || "").slice(
      0,
      4e3
    );
  }
  buildChatMessages(request) {
    const contextBlock = request.contexts.length ? request.contexts.map((c, i) => {
      const loc = c.pageNumber ? ` (page ${c.pageNumber})` : "";
      return `[${i + 1}] ${c.documentName}${loc}
${c.content}`;
    }).join("\n\n---\n\n") : "(No retrieved context.)";
    const historyMessages = request.history.map((turn) => ({
      role: turn.role,
      content: turn.content
    }));
    const userContent = [
      request.conversationSummary ? `Conversation memory:
${request.conversationSummary}` : "",
      "",
      "Retrieved context:",
      contextBlock,
      "",
      `User question: ${request.question}`
    ].filter(Boolean).join("\n");
    return [
      { role: "system", content: CHAT_SYSTEM },
      ...historyMessages,
      { role: "user", content: userContent }
    ];
  }
};

// src/domain/ai/stub-ai.client.ts
import { createHash } from "crypto";

// src/domain/common/constants/rag.constants.ts
var EMBEDDING_DIMENSIONS = 1536;
var DOCUMENT_QUEUE = "document-processing";
var CONNECTOR_SYNC_QUEUE = "connector-sync";
var SUMMARY_QUEUE = "summary-generation";
var RECENT_MESSAGE_LIMIT = 8;
var SUMMARY_REFRESH_EVERY = 10;
var ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown"
];
var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// src/domain/ai/stub-ai.client.ts
var StubAiClient = class _StubAiClient {
  logger = new Logger(_StubAiClient.name);
  async extractText(input) {
    this.logger.warn(
      `STUB extractText for ${input.filename} (${input.mimeType})`
    );
    if (input.mimeType === "text/plain" || input.mimeType === "text/markdown" || input.filename.endsWith(".txt") || input.filename.endsWith(".md")) {
      return input.buffer.toString("utf8");
    }
    return [
      `[STUB EXTRACTION] File: ${input.filename}`,
      `Mime: ${input.mimeType}`,
      "Replace StubAiClient.extractText with real PDF/DOCX extraction.",
      "Sample knowledge: Memora PTO policy grants 24 annual leave days.",
      "Sample knowledge: Security reviews are required before production deploys."
    ].join("\n");
  }
  async chunkText(text) {
    this.logger.warn("STUB chunkText \u2014 simple fixed-size windows");
    const size = 800;
    const overlap = 100;
    const chunks = [];
    let i = 0;
    let index = 0;
    while (i < text.length) {
      const content = text.slice(i, i + size).trim();
      if (content) {
        chunks.push({
          content,
          chunkIndex: index,
          pageNumber: Math.floor(index / 3) + 1,
          metadata: { stub: true }
        });
        index += 1;
      }
      i += size - overlap;
    }
    return chunks.length ? chunks : [{ content: text || "empty", chunkIndex: 0, pageNumber: 1 }];
  }
  async embed(texts) {
    this.logger.warn("STUB embed \u2014 deterministic pseudo-vectors");
    return texts.map((t) => this.hashEmbed(t));
  }
  async rerank(query, chunks) {
    return lexicalRerank(query, chunks);
  }
  async *chatStream(request) {
    this.logger.warn("STUB chatStream \u2014 fake answer with citations shape");
    const sources = request.contexts.slice(0, 3).map(
      (c, i) => `[${i + 1}] ${c.documentName}${c.pageNumber ? ` - Page ${c.pageNumber}` : ""}`
    ).join("\n");
    const answer = [
      `Stub answer for: "${request.question}"`,
      request.conversationSummary ? `Memory summary: ${request.conversationSummary.slice(0, 200)}` : "Memory summary: (none yet)",
      `Recent turns in prompt: ${request.history.length}`,
      "",
      request.contexts[0] ? `Based on retrieved context: ${request.contexts[0].content.slice(0, 240)}...` : "No retrieved context was available.",
      "",
      "Sources:",
      sources || "(none)",
      "",
      "Replace StubAiClient.chatStream with a real streaming LLM."
    ].join("\n");
    const parts = answer.match(/.{1,40}/gs) || [answer];
    for (const part of parts) {
      yield part;
    }
  }
  async summarizeConversation(request) {
    this.logger.warn("STUB summarizeConversation \u2014 rolling digest");
    const digest = request.messages.slice(-12).map((m) => `${m.role}: ${m.content.slice(0, 80)}`).join(" | ");
    const base = request.previousSummary ? `Prior: ${request.previousSummary.slice(0, 200)} || ` : "";
    return `${base}Stub summary covering ${request.messages.length} msgs \u2014 ${digest}`.slice(
      0,
      1500
    );
  }
  async summarizeKnowledge(request) {
    this.logger.warn(`STUB summarizeKnowledge \u2014 ${request.kind}`);
    return [
      `Stub ${request.kind} summary for "${request.title}"`,
      request.text.slice(0, 400).replace(/\s+/g, " ").trim(),
      "Replace StubAiClient.summarizeKnowledge with a real summarizer."
    ].filter(Boolean).join(" \u2014 ").slice(0, 1200);
  }
  async judgeRetrievalContext(request) {
    return heuristicRetrievalJudge(request);
  }
  hashEmbed(text) {
    const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
    const hash2 = createHash("sha256").update(text).digest();
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
      const b = hash2[i % hash2.length];
      vector[i] = (b / 255 * 2 - 1) / Math.sqrt(EMBEDDING_DIMENSIONS);
    }
    return vector;
  }
};

// src/domain/common/services/audit.service.ts
var AuditService = class {
  constructor(prisma) {
    this.prisma = prisma;
  }
  async log(input) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: input.userId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: input.metadata
      }
    });
  }
};

// src/domain/common/services/membership.service.ts
var MembershipService = class {
  constructor(prisma) {
    this.prisma = prisma;
  }
  async getOrgMembership(userId, organizationId) {
    return this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId }
      }
    });
  }
  async assertOrgMember(userId, organizationId) {
    const membership = await this.getOrgMembership(userId, organizationId);
    if (!membership) {
      throw new NotFoundException("Organization not found");
    }
    return membership;
  }
  async assertOrgRole(userId, organizationId, allowed) {
    const membership = await this.assertOrgMember(userId, organizationId);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException("Insufficient organization permissions");
    }
    return membership;
  }
  async getWorkspaceMembership(userId, workspaceId) {
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      },
      include: { workspace: true }
    });
  }
  async assertWorkspaceMember(userId, workspaceId) {
    const membership = await this.getWorkspaceMembership(userId, workspaceId);
    if (!membership) {
      throw new NotFoundException("Workspace not found");
    }
    return membership;
  }
  async assertWorkspaceRole(userId, workspaceId, allowed) {
    const membership = await this.assertWorkspaceMember(userId, workspaceId);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException("Insufficient workspace permissions");
    }
    return membership;
  }
};

// src/domain/modules/admin/admin.service.ts
var AdminService = class {
  constructor(prisma, redis, usage) {
    this.prisma = prisma;
    this.redis = redis;
    this.usage = usage;
  }
  async dashboard() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const [
      totalUsers,
      activeUsers,
      organizations,
      workspaces,
      documents,
      indexedChunks,
      queries,
      latencyAgg,
      connectors,
      failedConnectors,
      costs
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { lastLoginAt: { gte: since } }
      }),
      this.prisma.organization.count(),
      this.prisma.workspace.count(),
      this.prisma.document.count(),
      this.prisma.documentChunk.count(),
      this.prisma.retrievalQueryLog.count({
        where: { createdAt: { gte: since } }
      }),
      this.prisma.retrievalQueryLog.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { latencyMs: true }
      }),
      this.prisma.connector.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      this.prisma.connector.count({ where: { status: "ERROR" } }),
      this.usage.costSummary()
    ]);
    let redisOk = false;
    try {
      redisOk = await this.redis.ping() === "PONG";
    } catch {
      redisOk = false;
    }
    return {
      totalUsers,
      activeUsers,
      organizations,
      workspaces,
      documents,
      indexedChunks,
      queries24h: queries,
      averageLatencyMs: latencyAgg._avg.latencyMs ?? 0,
      connectorHealth: {
        byStatus: Object.fromEntries(
          connectors.map((c) => [c.status, c._count._all])
        ),
        failedJobs: failedConnectors
      },
      redisOk,
      costs
    };
  }
};

// src/domain/modules/analytics/usage.service.ts
var UsageService = class {
  constructor(prisma) {
    this.prisma = prisma;
  }
  async track(input) {
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    return this.prisma.llmUsageEvent.create({
      data: {
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: input.estimatedCostUsd ?? 0,
        requestDurationMs: input.requestDurationMs ?? 0,
        userId: input.userId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        metadata: input.metadata
      }
    });
  }
  async costSummary(organizationId) {
    const since = /* @__PURE__ */ new Date();
    since.setDate(since.getDate() - 30);
    const where = {
      createdAt: { gte: since },
      ...organizationId ? { organizationId } : {}
    };
    const events = await this.prisma.llmUsageEvent.findMany({ where });
    const dailyCost = /* @__PURE__ */ new Map();
    const byOrg = /* @__PURE__ */ new Map();
    const byUser = /* @__PURE__ */ new Map();
    const byModel = /* @__PURE__ */ new Map();
    let monthlyCost = 0;
    let tokenUsage = 0;
    for (const e of events) {
      monthlyCost += e.estimatedCostUsd;
      tokenUsage += e.totalTokens;
      const day = e.createdAt.toISOString().slice(0, 10);
      dailyCost.set(day, (dailyCost.get(day) || 0) + e.estimatedCostUsd);
      if (e.organizationId) {
        byOrg.set(
          e.organizationId,
          (byOrg.get(e.organizationId) || 0) + e.estimatedCostUsd
        );
      }
      if (e.userId) {
        byUser.set(e.userId, (byUser.get(e.userId) || 0) + e.estimatedCostUsd);
      }
      byModel.set(e.model, (byModel.get(e.model) || 0) + e.estimatedCostUsd);
    }
    return {
      monthlyCost,
      tokenUsage,
      dailyCost: Object.fromEntries(dailyCost),
      costPerOrganization: Object.fromEntries(byOrg),
      costPerUser: Object.fromEntries(byUser),
      costPerModel: Object.fromEntries(byModel)
    };
  }
};

// src/domain/common/utils/token.util.ts
import { createHash as createHash2, randomBytes } from "crypto";
function hashToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}

// src/domain/modules/auth/auth.service.ts
var AuthService = class {
  constructor(usersService, jwtService, configService) {
    this.usersService = usersService;
    this.jwtService = jwtService;
    this.configService = configService;
  }
  async register(dto) {
    const user = await this.usersService.create(dto);
    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });
    return { user, ...tokens };
  }
  async login(dto) {
    const user = await this.usersService.validateCredentials(
      dto.email,
      dto.password
    );
    await this.usersService.touchLastLogin(user.id);
    const safeUser = toSafeUser(user);
    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });
    return { user: safeUser, ...tokens };
  }
  async refresh(refreshToken) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow("jwt.refreshSecret")
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (user.refreshTokenHash !== hashToken(refreshToken)) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return this.issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });
  }
  async logout(userId) {
    await this.usersService.setRefreshTokenHash(userId, null);
    return { success: true };
  }
  async me(userId) {
    return this.usersService.findSafeById(userId);
  }
  async issueTokens(payload) {
    const accessExpiresIn = this.configService.get("jwt.accessExpiresIn") || "15m";
    const refreshExpiresIn = this.configService.get("jwt.refreshExpiresIn") || "7d";
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow("jwt.accessSecret"),
        expiresIn: accessExpiresIn
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow("jwt.refreshSecret"),
        expiresIn: refreshExpiresIn
      })
    ]);
    await this.usersService.setRefreshTokenHash(
      payload.sub,
      hashToken(refreshToken)
    );
    return { accessToken, refreshToken };
  }
};

// src/domain/modules/chat/chat.service.ts
var ChatService = class {
  constructor(prisma, membership, retrieval, memory, ai, summaryQueue, usage, audit) {
    this.prisma = prisma;
    this.membership = membership;
    this.retrieval = retrieval;
    this.memory = memory;
    this.ai = ai;
    this.summaryQueue = summaryQueue;
    this.usage = usage;
    this.audit = audit;
  }
  async listConversations(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.conversation.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        summary: true
      }
    });
  }
  async getConversation(userId, conversationId) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        summary: true
      }
    });
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }
    await this.membership.assertWorkspaceMember(
      userId,
      conversation.workspaceId
    );
    if (conversation.userId !== userId) {
      throw new NotFoundException("Conversation not found");
    }
    return conversation;
  }
  async getMemory(userId, conversationId) {
    await this.getConversation(userId, conversationId);
    return this.memory.buildMemory(conversationId);
  }
  async deleteConversation(userId, conversationId) {
    await this.getConversation(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { success: true };
  }
  async *streamChat(userId, workspaceId, message, conversationId) {
    const membership = await this.membership.assertWorkspaceMember(
      userId,
      workspaceId
    );
    let conversation = conversationId ? await this.prisma.conversation.findUnique({
      where: { id: conversationId }
    }) : null;
    if (conversationId && !conversation) {
      throw new NotFoundException("Conversation not found");
    }
    if (conversation) {
      await this.membership.assertWorkspaceMember(
        userId,
        conversation.workspaceId
      );
      if (conversation.userId !== userId) {
        throw new NotFoundException("Conversation not found");
      }
    } else {
      conversation = await this.prisma.conversation.create({
        data: {
          title: message.slice(0, 80),
          organizationId: membership.workspace.organizationId,
          workspaceId,
          userId
        }
      });
    }
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: message
      }
    });
    const memoryBundle = await this.memory.buildMemory(conversation.id);
    const contexts = await this.retrieval.search(
      userId,
      workspaceId,
      message,
      6
    );
    const citations = contexts.slice(0, 5).map((c, index) => ({
      index: index + 1,
      documentId: c.documentId,
      documentName: c.documentName,
      chunkId: c.chunkId,
      pageNumber: c.pageNumber,
      sourceUrl: c.sourceUrl
    }));
    yield {
      type: "meta",
      conversationId: conversation.id,
      citations,
      memory: {
        hasSummary: Boolean(memoryBundle.conversationSummary),
        recentTurns: memoryBundle.recentHistory.length
      }
    };
    let full = "";
    const chatStarted = Date.now();
    for await (const token of this.ai.chatStream({
      question: message,
      contexts,
      conversationSummary: memoryBundle.conversationSummary,
      history: memoryBundle.recentHistory
    })) {
      full += token;
      yield { type: "token", content: token };
    }
    const durationMs = Date.now() - chatStarted;
    const openAiUsage = this.ai instanceof OpenAiAiClient ? this.ai.readChatUsage() : null;
    const approxIn = Math.ceil(message.length / 4) + contexts.length * 200;
    const approxOut = Math.ceil(full.length / 4);
    await this.usage.track({
      provider: openAiUsage?.provider ?? "stub",
      model: openAiUsage?.model ?? "stub-chat",
      operation: "chatStream",
      inputTokens: openAiUsage?.inputTokens ?? approxIn,
      outputTokens: openAiUsage?.outputTokens ?? approxOut,
      estimatedCostUsd: openAiUsage ? this.estimateOpenAiChatCost(
        openAiUsage.model,
        openAiUsage.inputTokens,
        openAiUsage.outputTokens
      ) : (approxIn + approxOut) * 2e-7,
      requestDurationMs: durationMs,
      userId,
      organizationId: conversation.organizationId,
      workspaceId,
      conversationId: conversation.id
    });
    await this.audit.log({
      action: "chat.message",
      resourceType: "conversation",
      resourceId: conversation.id,
      userId,
      organizationId: conversation.organizationId,
      workspaceId,
      metadata: { citations: citations.length, durationMs }
    });
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: full,
        citations
      }
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: /* @__PURE__ */ new Date() }
    });
    const totalAfter = memoryBundle.totalMessages + 1;
    if (this.memory.shouldRefreshSummary(
      totalAfter,
      memoryBundle.summarizedThrough
    )) {
      await this.summaryQueue.add(
        "refresh",
        { kind: "CONVERSATION", conversationId: conversation.id },
        {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: "exponential", delay: 2e3 }
        }
      );
    }
    yield { type: "done" };
  }
  /** ponytail: rough list prices; override when billing needs exact list rates. */
  estimateOpenAiChatCost(model, inputTokens, outputTokens) {
    const per1M = {
      "gpt-4o-mini": { in: 0.15, out: 0.6 },
      "gpt-4o": { in: 2.5, out: 10 }
    };
    const rate = per1M[model] ?? per1M["gpt-4o-mini"];
    return (inputTokens * rate.in + outputTokens * rate.out) / 1e6;
  }
};

// src/domain/modules/chat/conversation-memory.service.ts
var ConversationMemoryService = class _ConversationMemoryService {
  constructor(prisma, ai) {
    this.prisma = prisma;
    this.ai = ai;
  }
  logger = new Logger(_ConversationMemoryService.name);
  /**
   * Builds prompt memory: rolling summary + recent window only.
   */
  async buildMemory(conversationId) {
    const [totalMessages, summaryRow, recent] = await Promise.all([
      this.prisma.message.count({ where: { conversationId } }),
      this.prisma.conversationSummary.findUnique({
        where: { conversationId }
      }),
      this.prisma.message.findMany({
        where: {
          conversationId,
          role: { in: ["USER", "ASSISTANT"] }
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_MESSAGE_LIMIT
      })
    ]);
    const recentHistory = recent.reverse().map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content
    }));
    return {
      conversationSummary: summaryRow?.summary ?? null,
      recentHistory,
      totalMessages,
      summarizedThrough: summaryRow?.messageCountAtSummary ?? 0
    };
  }
  shouldRefreshSummary(totalMessages, summarizedThrough) {
    return totalMessages - summarizedThrough >= SUMMARY_REFRESH_EVERY;
  }
  async refreshSummary(conversationId) {
    const existing = await this.prisma.conversationSummary.findUnique({
      where: { conversationId }
    });
    const covered = existing?.messageCountAtSummary ?? 0;
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        role: { in: ["USER", "ASSISTANT", "SYSTEM"] }
      },
      orderBy: { createdAt: "asc" }
    });
    const cutoff = Math.max(0, messages.length - RECENT_MESSAGE_LIMIT);
    const toSummarize = messages.slice(0, cutoff);
    if (toSummarize.length === 0) {
      this.logger.debug(
        `Skip summary for ${conversationId} \u2014 not enough older messages`
      );
      return;
    }
    if (toSummarize.length <= covered) {
      return;
    }
    const summary = await this.ai.summarizeConversation({
      previousSummary: existing?.summary ?? null,
      messages: toSummarize.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content
      }))
    });
    await this.prisma.conversationSummary.upsert({
      where: { conversationId },
      create: {
        conversationId,
        summary,
        messageCountAtSummary: toSummarize.length
      },
      update: {
        summary,
        messageCountAtSummary: toSummarize.length
      }
    });
  }
};

// src/domain/generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [],
  "clientVersion": "7.10.0",
  "engineVersion": "0edf323efd1d98336f3f0a68684b56f689b900d3",
  "activeProvider": "postgresql",
  "inlineSchema": '// This is your Prisma schema file,\n// learn more about it in the docs: https://pris.ly/d/prisma-schema\n\ngenerator client {\n  provider     = "prisma-client"\n  output       = "../src/domain/generated/prisma"\n  moduleFormat = "cjs"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nenum OrganizationRole {\n  OWNER\n  ADMIN\n  MEMBER\n}\n\nenum WorkspaceRole {\n  ADMIN\n  MEMBER\n}\n\nenum UserRole {\n  SUPER_ADMIN\n  USER\n}\n\nenum DocumentStatus {\n  PENDING\n  PROCESSING\n  READY\n  FAILED\n}\n\nenum MessageRole {\n  USER\n  ASSISTANT\n  SYSTEM\n}\n\nenum ConnectorType {\n  GOOGLE_DRIVE\n  GITHUB\n  NOTION\n  CONFLUENCE\n  JIRA\n  SLACK\n  SHAREPOINT\n  POSTGRESQL\n}\n\nenum ConnectorStatus {\n  DISCONNECTED\n  CONNECTED\n  SYNCING\n  ERROR\n}\n\nenum KnowledgeSummaryKind {\n  DOCUMENT\n  WORKSPACE\n  CONNECTOR\n}\n\nmodel User {\n  id               String    @id @default(cuid())\n  email            String    @unique\n  passwordHash     String\n  firstName        String\n  lastName         String\n  role             UserRole  @default(USER)\n  isActive         Boolean   @default(true)\n  emailVerified    Boolean   @default(false)\n  refreshTokenHash String?\n  lastLoginAt      DateTime?\n  createdAt        DateTime  @default(now())\n  updatedAt        DateTime  @updatedAt\n\n  organizations        OrganizationMember[]\n  workspaces           WorkspaceMember[]\n  createdOrganizations Organization[]       @relation("OrganizationCreator")\n  createdWorkspaces    Workspace[]          @relation("WorkspaceCreator")\n  uploadedDocuments    Document[]           @relation("DocumentUploader")\n  conversations        Conversation[]\n}\n\nmodel Organization {\n  id          String   @id @default(cuid())\n  name        String\n  slug        String   @unique\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n  createdById String\n  createdBy   User     @relation("OrganizationCreator", fields: [createdById], references: [id])\n\n  members       OrganizationMember[]\n  workspaces    Workspace[]\n  documents     Document[]\n  conversations Conversation[]\n  connectors    Connector[]\n}\n\nmodel OrganizationMember {\n  id             String           @id @default(cuid())\n  role           OrganizationRole\n  createdAt      DateTime         @default(now())\n  updatedAt      DateTime         @updatedAt\n  userId         String\n  organizationId String\n  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)\n  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([userId, organizationId])\n}\n\nmodel Workspace {\n  id             String       @id @default(cuid())\n  name           String\n  description    String?\n  createdAt      DateTime     @default(now())\n  updatedAt      DateTime     @updatedAt\n  organizationId String\n  createdById    String\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  createdBy      User         @relation("WorkspaceCreator", fields: [createdById], references: [id])\n\n  members            WorkspaceMember[]\n  documents          Document[]\n  conversations      Conversation[]\n  connectors         Connector[]\n  knowledgeSummaries KnowledgeSummary[]\n}\n\nmodel WorkspaceMember {\n  id          String        @id @default(cuid())\n  role        WorkspaceRole\n  createdAt   DateTime      @default(now())\n  updatedAt   DateTime      @updatedAt\n  workspaceId String\n  userId      String\n  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)\n  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@unique([workspaceId, userId])\n}\n\nmodel Document {\n  id             String         @id @default(cuid())\n  name           String\n  mimeType       String\n  sizeBytes      Int\n  storageKey     String\n  status         DocumentStatus @default(PENDING)\n  errorMessage   String?\n  metadata       Json?\n  organizationId String\n  workspaceId    String\n  uploadedById   String\n  connectorId    String?\n  externalId     String?\n  contentHash    String?\n  createdAt      DateTime       @default(now())\n  updatedAt      DateTime       @updatedAt\n\n  organization     Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  workspace        Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)\n  uploadedBy       User                @relation("DocumentUploader", fields: [uploadedById], references: [id])\n  connector        Connector?          @relation(fields: [connectorId], references: [id], onDelete: SetNull)\n  versions         DocumentVersion[]\n  chunks           DocumentChunk[]\n  syncItems        ConnectorSyncItem[]\n  knowledgeSummary KnowledgeSummary?\n\n  @@unique([connectorId, externalId])\n  @@index([workspaceId, status])\n  @@index([organizationId])\n}\n\nmodel Connector {\n  id             String          @id @default(cuid())\n  name           String\n  type           ConnectorType\n  status         ConnectorStatus @default(DISCONNECTED)\n  /// Non-secret config (repo, folder id, db name). Secrets stay in env/secret store later.\n  config         Json            @default("{}")\n  lastSyncedAt   DateTime?\n  syncCursor     String?\n  lastError      String?\n  organizationId String\n  workspaceId    String\n  createdById    String\n  createdAt      DateTime        @default(now())\n  updatedAt      DateTime        @updatedAt\n\n  organization     Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  workspace        Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)\n  documents        Document[]\n  syncItems        ConnectorSyncItem[]\n  knowledgeSummary KnowledgeSummary?\n\n  @@index([workspaceId])\n  @@index([organizationId, type])\n}\n\nmodel ConnectorSyncItem {\n  id                String    @id @default(cuid())\n  connectorId       String\n  documentId        String?\n  externalId        String\n  externalUpdatedAt DateTime?\n  contentHash       String?\n  lastSyncedAt      DateTime?\n  deletedAt         DateTime?\n  metadata          Json?\n  createdAt         DateTime  @default(now())\n  updatedAt         DateTime  @updatedAt\n\n  connector Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)\n  document  Document? @relation(fields: [documentId], references: [id], onDelete: SetNull)\n\n  @@unique([connectorId, externalId])\n  @@index([connectorId, lastSyncedAt])\n}\n\nmodel KnowledgeSummary {\n  id             String                       @id @default(cuid())\n  kind           KnowledgeSummaryKind\n  title          String\n  summary        String\n  sourceHash     String?\n  /// Stored via raw SQL as pgvector for retrieval participation.\n  embedding      Unsupported("vector(1536)")?\n  organizationId String\n  workspaceId    String\n  documentId     String?                      @unique\n  connectorId    String?                      @unique\n  createdAt      DateTime                     @default(now())\n  updatedAt      DateTime                     @updatedAt\n\n  workspace Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)\n  document  Document?  @relation(fields: [documentId], references: [id], onDelete: Cascade)\n  connector Connector? @relation(fields: [connectorId], references: [id], onDelete: Cascade)\n\n  @@index([workspaceId, kind])\n  @@index([organizationId])\n}\n\nmodel DocumentVersion {\n  id            String   @id @default(cuid())\n  documentId    String\n  version       Int      @default(1)\n  contentHash   String?\n  extractedText String?\n  createdAt     DateTime @default(now())\n\n  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)\n\n  @@unique([documentId, version])\n}\n\nmodel DocumentChunk {\n  id             String                       @id @default(cuid())\n  documentId     String\n  organizationId String\n  workspaceId    String\n  content        String\n  chunkIndex     Int\n  pageNumber     Int?\n  tokenCount     Int?\n  /// Stored via raw SQL as pgvector; Prisma maps as Unsupported.\n  embedding      Unsupported("vector(1536)")?\n  metadata       Json?\n  createdAt      DateTime                     @default(now())\n\n  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)\n\n  @@index([documentId])\n  @@index([workspaceId])\n  @@index([organizationId])\n}\n\nmodel Conversation {\n  id             String   @id @default(cuid())\n  title          String?\n  organizationId String\n  workspaceId    String\n  userId         String\n  createdAt      DateTime @default(now())\n  updatedAt      DateTime @updatedAt\n\n  organization Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  workspace    Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)\n  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)\n  messages     Message[]\n  summary      ConversationSummary?\n\n  @@index([workspaceId, userId])\n}\n\nmodel ConversationSummary {\n  id                    String   @id @default(cuid())\n  conversationId        String   @unique\n  summary               String\n  /// Number of messages covered by this rolling summary.\n  messageCountAtSummary Int\n  createdAt             DateTime @default(now())\n  updatedAt             DateTime @updatedAt\n\n  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)\n}\n\nmodel Message {\n  id             String      @id @default(cuid())\n  conversationId String\n  role           MessageRole\n  content        String\n  citations      Json?\n  createdAt      DateTime    @default(now())\n\n  conversation Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)\n  feedback     MessageFeedback[]\n\n  @@index([conversationId])\n}\n\nenum FeedbackRating {\n  UP\n  DOWN\n}\n\nmodel MessageFeedback {\n  id              String         @id @default(cuid())\n  rating          FeedbackRating\n  comment         String?\n  retrievedChunks Json?\n  userId          String\n  workspaceId     String\n  conversationId  String\n  messageId       String\n  createdAt       DateTime       @default(now())\n\n  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)\n\n  @@unique([messageId, userId])\n  @@index([workspaceId, createdAt])\n  @@index([conversationId])\n}\n\nmodel LlmUsageEvent {\n  id                String   @id @default(cuid())\n  provider          String\n  model             String\n  operation         String\n  inputTokens       Int      @default(0)\n  outputTokens      Int      @default(0)\n  totalTokens       Int      @default(0)\n  estimatedCostUsd  Float    @default(0)\n  requestDurationMs Int      @default(0)\n  userId            String?\n  organizationId    String?\n  workspaceId       String?\n  conversationId    String?\n  metadata          Json?\n  createdAt         DateTime @default(now())\n\n  @@index([organizationId, createdAt])\n  @@index([workspaceId, createdAt])\n  @@index([userId, createdAt])\n  @@index([model, createdAt])\n}\n\nmodel AuditLog {\n  id             String   @id @default(cuid())\n  action         String\n  resourceType   String\n  resourceId     String?\n  userId         String?\n  organizationId String?\n  workspaceId    String?\n  ip             String?\n  userAgent      String?\n  correlationId  String?\n  metadata       Json?\n  createdAt      DateTime @default(now())\n\n  @@index([createdAt])\n  @@index([userId, createdAt])\n  @@index([organizationId, createdAt])\n  @@index([correlationId])\n}\n\nmodel RetrievalQueryLog {\n  id             String   @id @default(cuid())\n  workspaceId    String\n  organizationId String?\n  userId         String?\n  query          String\n  topK           Int\n  resultCount    Int\n  latencyMs      Int\n  createdAt      DateTime @default(now())\n\n  @@index([workspaceId, createdAt])\n}\n\nmodel EvaluationRun {\n  id             String   @id @default(cuid())\n  name           String\n  datasetVersion String\n  metrics        Json\n  details        Json?\n  createdById    String?\n  createdAt      DateTime @default(now())\n\n  @@index([createdAt])\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"passwordHash","kind":"scalar","type":"String"},{"name":"firstName","kind":"scalar","type":"String"},{"name":"lastName","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"UserRole"},{"name":"isActive","kind":"scalar","type":"Boolean"},{"name":"emailVerified","kind":"scalar","type":"Boolean"},{"name":"refreshTokenHash","kind":"scalar","type":"String"},{"name":"lastLoginAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organizations","kind":"object","type":"OrganizationMember","relationName":"OrganizationMemberToUser"},{"name":"workspaces","kind":"object","type":"WorkspaceMember","relationName":"UserToWorkspaceMember"},{"name":"createdOrganizations","kind":"object","type":"Organization","relationName":"OrganizationCreator"},{"name":"createdWorkspaces","kind":"object","type":"Workspace","relationName":"WorkspaceCreator"},{"name":"uploadedDocuments","kind":"object","type":"Document","relationName":"DocumentUploader"},{"name":"conversations","kind":"object","type":"Conversation","relationName":"ConversationToUser"}],"dbName":null,"schema":null},"Organization":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"createdBy","kind":"object","type":"User","relationName":"OrganizationCreator"},{"name":"members","kind":"object","type":"OrganizationMember","relationName":"OrganizationToOrganizationMember"},{"name":"workspaces","kind":"object","type":"Workspace","relationName":"OrganizationToWorkspace"},{"name":"documents","kind":"object","type":"Document","relationName":"DocumentToOrganization"},{"name":"conversations","kind":"object","type":"Conversation","relationName":"ConversationToOrganization"},{"name":"connectors","kind":"object","type":"Connector","relationName":"ConnectorToOrganization"}],"dbName":null,"schema":null},"OrganizationMember":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"OrganizationRole"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"OrganizationMemberToUser"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToOrganizationMember"}],"dbName":null,"schema":null},"Workspace":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWorkspace"},{"name":"createdBy","kind":"object","type":"User","relationName":"WorkspaceCreator"},{"name":"members","kind":"object","type":"WorkspaceMember","relationName":"WorkspaceToWorkspaceMember"},{"name":"documents","kind":"object","type":"Document","relationName":"DocumentToWorkspace"},{"name":"conversations","kind":"object","type":"Conversation","relationName":"ConversationToWorkspace"},{"name":"connectors","kind":"object","type":"Connector","relationName":"ConnectorToWorkspace"},{"name":"knowledgeSummaries","kind":"object","type":"KnowledgeSummary","relationName":"KnowledgeSummaryToWorkspace"}],"dbName":null,"schema":null},"WorkspaceMember":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"WorkspaceRole"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"workspace","kind":"object","type":"Workspace","relationName":"WorkspaceToWorkspaceMember"},{"name":"user","kind":"object","type":"User","relationName":"UserToWorkspaceMember"}],"dbName":null,"schema":null},"Document":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"mimeType","kind":"scalar","type":"String"},{"name":"sizeBytes","kind":"scalar","type":"Int"},{"name":"storageKey","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"DocumentStatus"},{"name":"errorMessage","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"uploadedById","kind":"scalar","type":"String"},{"name":"connectorId","kind":"scalar","type":"String"},{"name":"externalId","kind":"scalar","type":"String"},{"name":"contentHash","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DocumentToOrganization"},{"name":"workspace","kind":"object","type":"Workspace","relationName":"DocumentToWorkspace"},{"name":"uploadedBy","kind":"object","type":"User","relationName":"DocumentUploader"},{"name":"connector","kind":"object","type":"Connector","relationName":"ConnectorToDocument"},{"name":"versions","kind":"object","type":"DocumentVersion","relationName":"DocumentToDocumentVersion"},{"name":"chunks","kind":"object","type":"DocumentChunk","relationName":"DocumentToDocumentChunk"},{"name":"syncItems","kind":"object","type":"ConnectorSyncItem","relationName":"ConnectorSyncItemToDocument"},{"name":"knowledgeSummary","kind":"object","type":"KnowledgeSummary","relationName":"DocumentToKnowledgeSummary"}],"dbName":null,"schema":null},"Connector":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"ConnectorType"},{"name":"status","kind":"enum","type":"ConnectorStatus"},{"name":"config","kind":"scalar","type":"Json"},{"name":"lastSyncedAt","kind":"scalar","type":"DateTime"},{"name":"syncCursor","kind":"scalar","type":"String"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ConnectorToOrganization"},{"name":"workspace","kind":"object","type":"Workspace","relationName":"ConnectorToWorkspace"},{"name":"documents","kind":"object","type":"Document","relationName":"ConnectorToDocument"},{"name":"syncItems","kind":"object","type":"ConnectorSyncItem","relationName":"ConnectorToConnectorSyncItem"},{"name":"knowledgeSummary","kind":"object","type":"KnowledgeSummary","relationName":"ConnectorToKnowledgeSummary"}],"dbName":null,"schema":null},"ConnectorSyncItem":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"connectorId","kind":"scalar","type":"String"},{"name":"documentId","kind":"scalar","type":"String"},{"name":"externalId","kind":"scalar","type":"String"},{"name":"externalUpdatedAt","kind":"scalar","type":"DateTime"},{"name":"contentHash","kind":"scalar","type":"String"},{"name":"lastSyncedAt","kind":"scalar","type":"DateTime"},{"name":"deletedAt","kind":"scalar","type":"DateTime"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"connector","kind":"object","type":"Connector","relationName":"ConnectorToConnectorSyncItem"},{"name":"document","kind":"object","type":"Document","relationName":"ConnectorSyncItemToDocument"}],"dbName":null,"schema":null},"KnowledgeSummary":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"kind","kind":"enum","type":"KnowledgeSummaryKind"},{"name":"title","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"sourceHash","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"documentId","kind":"scalar","type":"String"},{"name":"connectorId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"workspace","kind":"object","type":"Workspace","relationName":"KnowledgeSummaryToWorkspace"},{"name":"document","kind":"object","type":"Document","relationName":"DocumentToKnowledgeSummary"},{"name":"connector","kind":"object","type":"Connector","relationName":"ConnectorToKnowledgeSummary"}],"dbName":null,"schema":null},"DocumentVersion":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"documentId","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"Int"},{"name":"contentHash","kind":"scalar","type":"String"},{"name":"extractedText","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"document","kind":"object","type":"Document","relationName":"DocumentToDocumentVersion"}],"dbName":null,"schema":null},"DocumentChunk":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"documentId","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"content","kind":"scalar","type":"String"},{"name":"chunkIndex","kind":"scalar","type":"Int"},{"name":"pageNumber","kind":"scalar","type":"Int"},{"name":"tokenCount","kind":"scalar","type":"Int"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"document","kind":"object","type":"Document","relationName":"DocumentToDocumentChunk"}],"dbName":null,"schema":null},"Conversation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ConversationToOrganization"},{"name":"workspace","kind":"object","type":"Workspace","relationName":"ConversationToWorkspace"},{"name":"user","kind":"object","type":"User","relationName":"ConversationToUser"},{"name":"messages","kind":"object","type":"Message","relationName":"ConversationToMessage"},{"name":"summary","kind":"object","type":"ConversationSummary","relationName":"ConversationToConversationSummary"}],"dbName":null,"schema":null},"ConversationSummary":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"conversationId","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"messageCountAtSummary","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"conversation","kind":"object","type":"Conversation","relationName":"ConversationToConversationSummary"}],"dbName":null,"schema":null},"Message":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"conversationId","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"MessageRole"},{"name":"content","kind":"scalar","type":"String"},{"name":"citations","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"conversation","kind":"object","type":"Conversation","relationName":"ConversationToMessage"},{"name":"feedback","kind":"object","type":"MessageFeedback","relationName":"MessageToMessageFeedback"}],"dbName":null,"schema":null},"MessageFeedback":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"rating","kind":"enum","type":"FeedbackRating"},{"name":"comment","kind":"scalar","type":"String"},{"name":"retrievedChunks","kind":"scalar","type":"Json"},{"name":"userId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"conversationId","kind":"scalar","type":"String"},{"name":"messageId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"message","kind":"object","type":"Message","relationName":"MessageToMessageFeedback"}],"dbName":null,"schema":null},"LlmUsageEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"provider","kind":"scalar","type":"String"},{"name":"model","kind":"scalar","type":"String"},{"name":"operation","kind":"scalar","type":"String"},{"name":"inputTokens","kind":"scalar","type":"Int"},{"name":"outputTokens","kind":"scalar","type":"Int"},{"name":"totalTokens","kind":"scalar","type":"Int"},{"name":"estimatedCostUsd","kind":"scalar","type":"Float"},{"name":"requestDurationMs","kind":"scalar","type":"Int"},{"name":"userId","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"conversationId","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"AuditLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"action","kind":"scalar","type":"String"},{"name":"resourceType","kind":"scalar","type":"String"},{"name":"resourceId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"ip","kind":"scalar","type":"String"},{"name":"userAgent","kind":"scalar","type":"String"},{"name":"correlationId","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"RetrievalQueryLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"workspaceId","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"query","kind":"scalar","type":"String"},{"name":"topK","kind":"scalar","type":"Int"},{"name":"resultCount","kind":"scalar","type":"Int"},{"name":"latencyMs","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"EvaluationRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"datasetVersion","kind":"scalar","type":"String"},{"name":"metrics","kind":"scalar","type":"Json"},{"name":"details","kind":"scalar","type":"Json"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","user","createdBy","members","organization","workspace","uploadedBy","documents","connector","document","syncItems","knowledgeSummary","_count","versions","chunks","conversation","message","feedback","messages","summary","conversations","connectors","knowledgeSummaries","workspaces","organizations","createdOrganizations","createdWorkspaces","uploadedDocuments","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","data","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","create","update","User.upsertOne","User.deleteOne","User.deleteMany","having","_min","_max","User.groupBy","User.aggregate","Organization.findUnique","Organization.findUniqueOrThrow","Organization.findFirst","Organization.findFirstOrThrow","Organization.findMany","Organization.createOne","Organization.createMany","Organization.createManyAndReturn","Organization.updateOne","Organization.updateMany","Organization.updateManyAndReturn","Organization.upsertOne","Organization.deleteOne","Organization.deleteMany","Organization.groupBy","Organization.aggregate","OrganizationMember.findUnique","OrganizationMember.findUniqueOrThrow","OrganizationMember.findFirst","OrganizationMember.findFirstOrThrow","OrganizationMember.findMany","OrganizationMember.createOne","OrganizationMember.createMany","OrganizationMember.createManyAndReturn","OrganizationMember.updateOne","OrganizationMember.updateMany","OrganizationMember.updateManyAndReturn","OrganizationMember.upsertOne","OrganizationMember.deleteOne","OrganizationMember.deleteMany","OrganizationMember.groupBy","OrganizationMember.aggregate","Workspace.findUnique","Workspace.findUniqueOrThrow","Workspace.findFirst","Workspace.findFirstOrThrow","Workspace.findMany","Workspace.createOne","Workspace.createMany","Workspace.createManyAndReturn","Workspace.updateOne","Workspace.updateMany","Workspace.updateManyAndReturn","Workspace.upsertOne","Workspace.deleteOne","Workspace.deleteMany","Workspace.groupBy","Workspace.aggregate","WorkspaceMember.findUnique","WorkspaceMember.findUniqueOrThrow","WorkspaceMember.findFirst","WorkspaceMember.findFirstOrThrow","WorkspaceMember.findMany","WorkspaceMember.createOne","WorkspaceMember.createMany","WorkspaceMember.createManyAndReturn","WorkspaceMember.updateOne","WorkspaceMember.updateMany","WorkspaceMember.updateManyAndReturn","WorkspaceMember.upsertOne","WorkspaceMember.deleteOne","WorkspaceMember.deleteMany","WorkspaceMember.groupBy","WorkspaceMember.aggregate","Document.findUnique","Document.findUniqueOrThrow","Document.findFirst","Document.findFirstOrThrow","Document.findMany","Document.createOne","Document.createMany","Document.createManyAndReturn","Document.updateOne","Document.updateMany","Document.updateManyAndReturn","Document.upsertOne","Document.deleteOne","Document.deleteMany","_avg","_sum","Document.groupBy","Document.aggregate","Connector.findUnique","Connector.findUniqueOrThrow","Connector.findFirst","Connector.findFirstOrThrow","Connector.findMany","Connector.createOne","Connector.createMany","Connector.createManyAndReturn","Connector.updateOne","Connector.updateMany","Connector.updateManyAndReturn","Connector.upsertOne","Connector.deleteOne","Connector.deleteMany","Connector.groupBy","Connector.aggregate","ConnectorSyncItem.findUnique","ConnectorSyncItem.findUniqueOrThrow","ConnectorSyncItem.findFirst","ConnectorSyncItem.findFirstOrThrow","ConnectorSyncItem.findMany","ConnectorSyncItem.createOne","ConnectorSyncItem.createMany","ConnectorSyncItem.createManyAndReturn","ConnectorSyncItem.updateOne","ConnectorSyncItem.updateMany","ConnectorSyncItem.updateManyAndReturn","ConnectorSyncItem.upsertOne","ConnectorSyncItem.deleteOne","ConnectorSyncItem.deleteMany","ConnectorSyncItem.groupBy","ConnectorSyncItem.aggregate","KnowledgeSummary.findUnique","KnowledgeSummary.findUniqueOrThrow","KnowledgeSummary.findFirst","KnowledgeSummary.findFirstOrThrow","KnowledgeSummary.findMany","KnowledgeSummary.createOne","KnowledgeSummary.createMany","KnowledgeSummary.createManyAndReturn","KnowledgeSummary.updateOne","KnowledgeSummary.updateMany","KnowledgeSummary.updateManyAndReturn","KnowledgeSummary.upsertOne","KnowledgeSummary.deleteOne","KnowledgeSummary.deleteMany","KnowledgeSummary.groupBy","KnowledgeSummary.aggregate","DocumentVersion.findUnique","DocumentVersion.findUniqueOrThrow","DocumentVersion.findFirst","DocumentVersion.findFirstOrThrow","DocumentVersion.findMany","DocumentVersion.createOne","DocumentVersion.createMany","DocumentVersion.createManyAndReturn","DocumentVersion.updateOne","DocumentVersion.updateMany","DocumentVersion.updateManyAndReturn","DocumentVersion.upsertOne","DocumentVersion.deleteOne","DocumentVersion.deleteMany","DocumentVersion.groupBy","DocumentVersion.aggregate","DocumentChunk.findUnique","DocumentChunk.findUniqueOrThrow","DocumentChunk.findFirst","DocumentChunk.findFirstOrThrow","DocumentChunk.findMany","DocumentChunk.createOne","DocumentChunk.createMany","DocumentChunk.createManyAndReturn","DocumentChunk.updateOne","DocumentChunk.updateMany","DocumentChunk.updateManyAndReturn","DocumentChunk.upsertOne","DocumentChunk.deleteOne","DocumentChunk.deleteMany","DocumentChunk.groupBy","DocumentChunk.aggregate","Conversation.findUnique","Conversation.findUniqueOrThrow","Conversation.findFirst","Conversation.findFirstOrThrow","Conversation.findMany","Conversation.createOne","Conversation.createMany","Conversation.createManyAndReturn","Conversation.updateOne","Conversation.updateMany","Conversation.updateManyAndReturn","Conversation.upsertOne","Conversation.deleteOne","Conversation.deleteMany","Conversation.groupBy","Conversation.aggregate","ConversationSummary.findUnique","ConversationSummary.findUniqueOrThrow","ConversationSummary.findFirst","ConversationSummary.findFirstOrThrow","ConversationSummary.findMany","ConversationSummary.createOne","ConversationSummary.createMany","ConversationSummary.createManyAndReturn","ConversationSummary.updateOne","ConversationSummary.updateMany","ConversationSummary.updateManyAndReturn","ConversationSummary.upsertOne","ConversationSummary.deleteOne","ConversationSummary.deleteMany","ConversationSummary.groupBy","ConversationSummary.aggregate","Message.findUnique","Message.findUniqueOrThrow","Message.findFirst","Message.findFirstOrThrow","Message.findMany","Message.createOne","Message.createMany","Message.createManyAndReturn","Message.updateOne","Message.updateMany","Message.updateManyAndReturn","Message.upsertOne","Message.deleteOne","Message.deleteMany","Message.groupBy","Message.aggregate","MessageFeedback.findUnique","MessageFeedback.findUniqueOrThrow","MessageFeedback.findFirst","MessageFeedback.findFirstOrThrow","MessageFeedback.findMany","MessageFeedback.createOne","MessageFeedback.createMany","MessageFeedback.createManyAndReturn","MessageFeedback.updateOne","MessageFeedback.updateMany","MessageFeedback.updateManyAndReturn","MessageFeedback.upsertOne","MessageFeedback.deleteOne","MessageFeedback.deleteMany","MessageFeedback.groupBy","MessageFeedback.aggregate","LlmUsageEvent.findUnique","LlmUsageEvent.findUniqueOrThrow","LlmUsageEvent.findFirst","LlmUsageEvent.findFirstOrThrow","LlmUsageEvent.findMany","LlmUsageEvent.createOne","LlmUsageEvent.createMany","LlmUsageEvent.createManyAndReturn","LlmUsageEvent.updateOne","LlmUsageEvent.updateMany","LlmUsageEvent.updateManyAndReturn","LlmUsageEvent.upsertOne","LlmUsageEvent.deleteOne","LlmUsageEvent.deleteMany","LlmUsageEvent.groupBy","LlmUsageEvent.aggregate","AuditLog.findUnique","AuditLog.findUniqueOrThrow","AuditLog.findFirst","AuditLog.findFirstOrThrow","AuditLog.findMany","AuditLog.createOne","AuditLog.createMany","AuditLog.createManyAndReturn","AuditLog.updateOne","AuditLog.updateMany","AuditLog.updateManyAndReturn","AuditLog.upsertOne","AuditLog.deleteOne","AuditLog.deleteMany","AuditLog.groupBy","AuditLog.aggregate","RetrievalQueryLog.findUnique","RetrievalQueryLog.findUniqueOrThrow","RetrievalQueryLog.findFirst","RetrievalQueryLog.findFirstOrThrow","RetrievalQueryLog.findMany","RetrievalQueryLog.createOne","RetrievalQueryLog.createMany","RetrievalQueryLog.createManyAndReturn","RetrievalQueryLog.updateOne","RetrievalQueryLog.updateMany","RetrievalQueryLog.updateManyAndReturn","RetrievalQueryLog.upsertOne","RetrievalQueryLog.deleteOne","RetrievalQueryLog.deleteMany","RetrievalQueryLog.groupBy","RetrievalQueryLog.aggregate","EvaluationRun.findUnique","EvaluationRun.findUniqueOrThrow","EvaluationRun.findFirst","EvaluationRun.findFirstOrThrow","EvaluationRun.findMany","EvaluationRun.createOne","EvaluationRun.createMany","EvaluationRun.createManyAndReturn","EvaluationRun.updateOne","EvaluationRun.updateMany","EvaluationRun.updateManyAndReturn","EvaluationRun.upsertOne","EvaluationRun.deleteOne","EvaluationRun.deleteMany","EvaluationRun.groupBy","EvaluationRun.aggregate","AND","OR","NOT","id","name","datasetVersion","metrics","details","createdById","createdAt","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","workspaceId","organizationId","userId","query","topK","resultCount","latencyMs","action","resourceType","resourceId","ip","userAgent","correlationId","metadata","provider","model","operation","inputTokens","outputTokens","totalTokens","estimatedCostUsd","requestDurationMs","conversationId","FeedbackRating","rating","comment","retrievedChunks","messageId","MessageRole","role","content","citations","messageCountAtSummary","updatedAt","title","documentId","chunkIndex","pageNumber","tokenCount","version","contentHash","extractedText","KnowledgeSummaryKind","kind","sourceHash","connectorId","externalId","externalUpdatedAt","lastSyncedAt","deletedAt","ConnectorType","type","ConnectorStatus","status","config","syncCursor","lastError","mimeType","sizeBytes","storageKey","DocumentStatus","errorMessage","uploadedById","WorkspaceRole","description","OrganizationRole","slug","email","passwordHash","firstName","lastName","UserRole","isActive","emailVerified","refreshTokenHash","lastLoginAt","every","some","none","messageId_userId","documentId_version","connectorId_externalId","workspaceId_userId","userId_organizationId","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","increment","decrement","multiply","divide"]'),
  graph: "mgqsAbACFRYAAPoEACAZAAD2BAAgGgAA9QQAIBsAAPcEACAcAAD4BAAgHQAA-QQAINYCAADxBAAw1wIAAGEAENgCAADxBAAw2QIBAAAAAd8CQACuBAAhjgMAAPIEuQMikgNAAK4EACG0AwEAAAABtQMBAKoEACG2AwEAqgQAIbcDAQCqBAAhuQMgAPMEACG6AyAA8wQAIbsDAQCtBAAhvANAAPQEACEBAAAAAQAgCwMAAPwEACAGAACGBQAg1gIAAKYFADDXAgAAAwAQ2AIAAKYFADDZAgEAqgQAId8CQACuBAAh8gIBAKoEACHzAgEAqgQAIY4DAACnBbMDIpIDQACuBAAhAgMAAPMIACAGAAD4CAAgDAMAAPwEACAGAACGBQAg1gIAAKYFADDXAgAAAwAQ2AIAAKYFADDZAgEAAAAB3wJAAK4EACHyAgEAqgQAIfMCAQCqBAAhjgMAAKcFswMikgNAAK4EACHEAwAApQUAIAMAAAADACABAAAEADACAAAFACADAAAAAwAgAQAABAAwAgAABQAgEQQAAPwEACAFAAD2BAAgBgAAhgUAIAkAAPkEACAWAAD6BAAgFwAA_QQAIBgAAKQFACDWAgAAowUAMNcCAAAIABDYAgAAowUAMNkCAQCqBAAh2gIBAKoEACHeAgEAqgQAId8CQACuBAAh8gIBAKoEACGSA0AArgQAIbEDAQCtBAAhCAQAAPMIACAFAADuCAAgBgAA-AgAIAkAAPEIACAWAADyCAAgFwAA9AgAIBgAAIEJACCxAwAAqAUAIBEEAAD8BAAgBQAA9gQAIAYAAIYFACAJAAD5BAAgFgAA-gQAIBcAAP0EACAYAACkBQAg1gIAAKMFADDXAgAACAAQ2AIAAKMFADDZAgEAAAAB2gIBAKoEACHeAgEAqgQAId8CQACuBAAh8gIBAKoEACGSA0AArgQAIbEDAQCtBAAhAwAAAAgAIAEAAAkAMAIAAAoAIAsDAAD8BAAgBwAAgAUAINYCAAChBQAw1wIAAAwAENgCAAChBQAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8wIBAKoEACGOAwAAogWxAyKSA0AArgQAIQIDAADzCAAgBwAA9QgAIAwDAAD8BAAgBwAAgAUAINYCAAChBQAw1wIAAAwAENgCAAChBQAw2QIBAAAAAd8CQACuBAAh8QIBAKoEACHzAgEAqgQAIY4DAACiBbEDIpIDQACuBAAhwwMAAKAFACADAAAADAAgAQAADQAwAgAADgAgGwYAAIYFACAHAACABQAgCAAA_AQAIAoAAIIFACAMAACHBQAgDQAAiAUAIA8AAJ4FACAQAACfBQAg1gIAAJwFADDXAgAAEAAQ2AIAAJwFADDZAgEAqgQAIdoCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh_gIAAKwEACCSA0AArgQAIZkDAQCtBAAhngMBAK0EACGfAwEArQQAIaYDAACdBa4DIqoDAQCqBAAhqwMCALQEACGsAwEAqgQAIa4DAQCtBAAhrwMBAKoEACENBgAA-AgAIAcAAPUIACAIAADzCAAgCgAA9wgAIAwAAPkIACANAAD6CAAgDwAA_wgAIBAAAIAJACD-AgAAqAUAIJkDAACoBQAgngMAAKgFACCfAwAAqAUAIK4DAACoBQAgHAYAAIYFACAHAACABQAgCAAA_AQAIAoAAIIFACAMAACHBQAgDQAAiAUAIA8AAJ4FACAQAACfBQAg1gIAAJwFADDXAgAAEAAQ2AIAAJwFADDZAgEAAAAB2gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACH-AgAArAQAIJIDQACuBAAhmQMBAK0EACGeAwEArQQAIZ8DAQCtBAAhpgMAAJ0FrgMiqgMBAKoEACGrAwIAtAQAIawDAQCqBAAhrgMBAK0EACGvAwEAqgQAIcIDAACbBQAgAwAAABAAIAEAABEAMAIAABIAIBUGAACGBQAgBwAAgAUAIAkAAPkEACAMAACHBQAgDQAAiAUAINYCAACDBQAw1wIAABQAENgCAACDBQAw2QIBAKoEACHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGhA0AA9AQAIaQDAACEBaQDIqYDAACFBaYDIqcDAACrBAAgqAMBAK0EACGpAwEArQQAIQEAAAAUACADAAAAEAAgAQAAEQAwAgAAEgAgEAoAAJoFACALAACBBQAg1gIAAJkFADDXAgAAFwAQ2AIAAJkFADDZAgEAqgQAId8CQACuBAAh_gIAAKwEACCSA0AArgQAIZQDAQCtBAAhmQMBAK0EACGeAwEAqgQAIZ8DAQCqBAAhoANAAPQEACGhA0AA9AQAIaIDQAD0BAAhCAoAAPcIACALAAD2CAAg_gIAAKgFACCUAwAAqAUAIJkDAACoBQAgoAMAAKgFACChAwAAqAUAIKIDAACoBQAgEQoAAJoFACALAACBBQAg1gIAAJkFADDXAgAAFwAQ2AIAAJkFADDZAgEAAAAB3wJAAK4EACH-AgAArAQAIJIDQACuBAAhlAMBAK0EACGZAwEArQQAIZ4DAQCqBAAhnwMBAKoEACGgA0AA9AQAIaEDQAD0BAAhogNAAPQEACHCAwAAmAUAIAMAAAAXACABAAAYADACAAAZACABAAAAEAAgEQcAAIAFACAKAACCBQAgCwAAgQUAIBUBAKoEACHWAgAA_gQAMNcCAAAcABDYAgAA_gQAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGTAwEAqgQAIZQDAQCtBAAhnAMAAP8EnAMinQMBAK0EACGeAwEArQQAIQEAAAAcACABAAAAEAAgAQAAABQAIAEAAAAQACABAAAAFwAgCgsAAJUFACDWAgAAlwUAMNcCAAAiABDYAgAAlwUAMNkCAQCqBAAh3wJAAK4EACGUAwEAqgQAIZgDAgC0BAAhmQMBAK0EACGaAwEArQQAIQMLAAD2CAAgmQMAAKgFACCaAwAAqAUAIAsLAACVBQAg1gIAAJcFADDXAgAAIgAQ2AIAAJcFADDZAgEAAAAB3wJAAK4EACGUAwEAqgQAIZgDAgC0BAAhmQMBAK0EACGaAwEArQQAIcEDAACWBQAgAwAAACIAIAEAACMAMAIAACQAIA4LAACVBQAg1gIAAJMFADDXAgAAJgAQ2AIAAJMFADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHyAgEAqgQAIf4CAACsBAAgjwMBAKoEACGUAwEAqgQAIZUDAgC0BAAhlgMCAJQFACGXAwIAlAUAIQQLAAD2CAAg_gIAAKgFACCWAwAAqAUAIJcDAACoBQAgDgsAAJUFACDWAgAAkwUAMNcCAAAmABDYAgAAkwUAMNkCAQAAAAHfAkAArgQAIfECAQCqBAAh8gIBAKoEACH-AgAArAQAII8DAQCqBAAhlAMBAKoEACGVAwIAtAQAIZYDAgCUBQAhlwMCAJQFACEDAAAAJgAgAQAAJwAwAgAAKAAgAwAAABcAIAEAABgAMAIAABkAIAEAAAAcACABAAAAIgAgAQAAACYAIAEAAAAXACAPAwAA_AQAIAYAAIYFACAHAACABQAgFAAAkQUAIBUAAJIFACDWAgAAkAUAMNcCAAAvABDYAgAAkAUAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh8wIBAKoEACGSA0AArgQAIZMDAQCtBAAhBgMAAPMIACAGAAD4CAAgBwAA9QgAIBQAAP0IACAVAAD-CAAgkwMAAKgFACAPAwAA_AQAIAYAAIYFACAHAACABQAgFAAAkQUAIBUAAJIFACDWAgAAkAUAMNcCAAAvABDYAgAAkAUAMNkCAQAAAAHfAkAArgQAIfECAQCqBAAh8gIBAKoEACHzAgEAqgQAIZIDQACuBAAhkwMBAK0EACEDAAAALwAgAQAAMAAwAgAAMQAgCxEAAMYEACATAACPBQAg1gIAAI0FADDXAgAAMwAQ2AIAAI0FADDZAgEAqgQAId8CQACuBAAhhwMBAKoEACGOAwAAjgWOAyKPAwEAqgQAIZADAACsBAAgAxEAAN8FACATAAD8CAAgkAMAAKgFACALEQAAxgQAIBMAAI8FACDWAgAAjQUAMNcCAAAzABDYAgAAjQUAMNkCAQAAAAHfAkAArgQAIYcDAQCqBAAhjgMAAI4FjgMijwMBAKoEACGQAwAArAQAIAMAAAAzACABAAA0ADACAAA1ACANEgAAjAUAINYCAACKBQAw1wIAADcAENgCAACKBQAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8wIBAKoEACGHAwEAqgQAIYkDAACLBYkDIooDAQCtBAAhiwMAAKwEACCMAwEAqgQAIQMSAAD7CAAgigMAAKgFACCLAwAAqAUAIA4SAACMBQAg1gIAAIoFADDXAgAANwAQ2AIAAIoFADDZAgEAAAAB3wJAAK4EACHxAgEAqgQAIfMCAQCqBAAhhwMBAKoEACGJAwAAiwWJAyKKAwEArQQAIYsDAACsBAAgjAMBAKoEACHAAwAAiQUAIAMAAAA3ACABAAA4ADACAAA5ACABAAAANwAgChEAAMYEACAVAQCqBAAh1gIAAMUEADDXAgAAPAAQ2AIAAMUEADDZAgEAqgQAId8CQACuBAAhhwMBAKoEACGRAwIAtAQAIZIDQACuBAAhAQAAADwAIAEAAAAzACAIBgAA-AgAIAcAAPUIACAJAADxCAAgDAAA-QgAIA0AAPoIACChAwAAqAUAIKgDAACoBQAgqQMAAKgFACAVBgAAhgUAIAcAAIAFACAJAAD5BAAgDAAAhwUAIA0AAIgFACDWAgAAgwUAMNcCAAAUABDYAgAAgwUAMNkCAQAAAAHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGhA0AA9AQAIaQDAACEBaQDIqYDAACFBaYDIqcDAACrBAAgqAMBAK0EACGpAwEArQQAIQMAAAAUACABAAA_ADACAABAACAGBwAA9QgAIAoAAPcIACALAAD2CAAglAMAAKgFACCdAwAAqAUAIJ4DAACoBQAgEQcAAIAFACAKAACCBQAgCwAAgQUAIBUBAKoEACHWAgAA_gQAMNcCAAAcABDYAgAA_gQAMNkCAQAAAAHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIZMDAQCqBAAhlAMBAAAAAZwDAAD_BJwDIp0DAQCtBAAhngMBAAAAAQMAAAAcACABAABCADACAABDACABAAAADAAgAQAAABAAIAEAAAAvACABAAAAFAAgAQAAABwAIAMAAAAQACABAAARADACAAASACADAAAALwAgAQAAMAAwAgAAMQAgAwAAABQAIAEAAD8AMAIAAEAAIAEAAAADACABAAAACAAgAQAAABAAIAEAAAAvACABAAAAFAAgAwAAAAwAIAEAAA0AMAIAAA4AIA8EAAD8BAAgBQAA9QQAIAkAAPkEACAWAAD6BAAgFwAA_QQAIBkAAPgEACDWAgAA-wQAMNcCAABTABDYAgAA-wQAMNkCAQCqBAAh2gIBAKoEACHeAgEAqgQAId8CQACuBAAhkgNAAK4EACGzAwEAqgQAIQYEAADzCAAgBQAA7QgAIAkAAPEIACAWAADyCAAgFwAA9AgAIBkAAPAIACAPBAAA_AQAIAUAAPUEACAJAAD5BAAgFgAA-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_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACGvAwEArAUAIQIAAAAQACAjAADcAQAgAgAAABAAICMAANwBACABAAAAFAAgAwAAABIAICoAANQBACArAADaAQAgAQAAABIAIAEAAAAQACAKDgAAgAcAIDAAAIMHACAxAACCBwAgggEAAIEHACCDAQAAhAcAIP4CAACoBQAgmQMAAKgFACCeAwAAqAUAIJ8DAACoBQAgrgMAAKgFACAT1gIAANwEADDXAgAA5AEAENgCAADcBAAw2QIBAJoEACHaAgEAmgQAId8CQACeBAAh8QIBAJoEACHyAgEAmgQAIf4CAACcBAAgkgNAAJ4EACGZAwEAnQQAIZ4DAQCdBAAhnwMBAJ0EACGmAwAA3QSuAyKqAwEAmgQAIasDAgCwBAAhrAMBAJoEACGuAwEAnQQAIa8DAQCaBAAhAwAAABAAIAEAAOMBADAvAADkAQAgAwAAABAAIAEAABEAMAIAABIAIAEAAABAACABAAAAQAAgAwAAABQAIAEAAD8AMAIAAEAAIAMAAAAUACABAAA_ADACAABAACADAAAAFAAgAQAAPwAwAgAAQAAgEgYAAPsGACAHAAD8BgAgCQAA_QYAIAwAAP4GACANAAD_BgAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABASMAAOwBACAN2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABASMAAO4BADABIwAA7gEAMBIGAACkBgAgBwAApQYAIAkAAKYGACAMAACnBgAgDQAAqAYAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIZIDQACuBQAhoQNAAJoGACGkAwAAogakAyKmAwAAowamAyKnA4AAAAABqAMBAK0FACGpAwEArQUAIQIAAABAACAjAADxAQAgDdkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIZIDQACuBQAhoQNAAJoGACGkAwAAogakAyKmAwAAowamAyKnA4AAAAABqAMBAK0FACGpAwEArQUAIQIAAAAUACAjAADzAQAgAgAAABQAICMAAPMBACADAAAAQAAgKgAA7AEAICsAAPEBACABAAAAQAAgAQAAABQAIAYOAACfBgAgMAAAoQYAIDEAAKAGACChAwAAqAUAIKgDAACoBQAgqQMAAKgFACAQ1gIAANUEADDXAgAA-gEAENgCAADVBAAw2QIBAJoEACHaAgEAmgQAId4CAQCaBAAh3wJAAJ4EACHxAgEAmgQAIfICAQCaBAAhkgNAAJ4EACGhA0AA0gQAIaQDAADWBKQDIqYDAADXBKYDIqcDAACbBAAgqAMBAJ0EACGpAwEAnQQAIQMAAAAUACABAAD5AQAwLwAA-gEAIAMAAAAUACABAAA_ADACAABAACABAAAAGQAgAQAAABkAIAMAAAAXACABAAAYADACAAAZACADAAAAFwAgAQAAGAAwAgAAGQAgAwAAABcAIAEAABgAMAIAABkAIA0KAACdBgAgCwAAngYAINkCAQAAAAHfAkAAAAAB_gKAAAAAAZIDQAAAAAGUAwEAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABoANAAAAAAaEDQAAAAAGiA0AAAAABASMAAIICACAL2QIBAAAAAd8CQAAAAAH-AoAAAAABkgNAAAAAAZQDAQAAAAGZAwEAAAABngMBAAAAAZ8DAQAAAAGgA0AAAAABoQNAAAAAAaIDQAAAAAEBIwAAhAIAMAEjAACEAgAwAQAAABAAIA0KAACbBgAgCwAAnAYAINkCAQCsBQAh3wJAAK4FACH-AoAAAAABkgNAAK4FACGUAwEArQUAIZkDAQCtBQAhngMBAKwFACGfAwEArAUAIaADQACaBgAhoQNAAJoGACGiA0AAmgYAIQIAAAAZACAjAACIAgAgC9kCAQCsBQAh3wJAAK4FACH-AoAAAAABkgNAAK4FACGUAwEArQUAIZkDAQCtBQAhngMBAKwFACGfAwEArAUAIaADQACaBgAhoQNAAJoGACGiA0AAmgYAIQIAAAAXACAjAACKAgAgAgAAABcAICMAAIoCACABAAAAEAAgAwAAABkAICoAAIICACArAACIAgAgAQAAABkAIAEAAAAXACAJDgAAlwYAIDAAAJkGACAxAACYBgAg_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_gKAAAAAAY8DAQAAAAGUAwEAAAABlQMCAAAAAZYDAgAAAAGXAwIAAAABASMAAMoCACAK2QIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAf4CgAAAAAGPAwEAAAABlAMBAAAAAZUDAgAAAAGWAwIAAAABlwMCAAAAAQEjAADMAgAwASMAAMwCADALCwAAhAYAINkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAY8DAQCsBQAhlAMBAKwFACGVAwIAtAUAIZYDAgCDBgAhlwMCAIMGACECAAAAKAAgIwAAzwIAIArZAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIf4CgAAAAAGPAwEArAUAIZQDAQCsBQAhlQMCALQFACGWAwIAgwYAIZcDAgCDBgAhAgAAACYAICMAANECACACAAAAJgAgIwAA0QIAIAMAAAAoACAqAADKAgAgKwAAzwIAIAEAAAAoACABAAAAJgAgCA4AAP4FACAwAACBBgAgMQAAgAYAIIIBAAD_BQAggwEAAIIGACD-AgAAqAUAIJYDAACoBQAglwMAAKgFACAN1gIAAMgEADDXAgAA2AIAENgCAADIBAAw2QIBAJoEACHfAkAAngQAIfECAQCaBAAh8gIBAJoEACH-AgAAnAQAII8DAQCaBAAhlAMBAJoEACGVAwIAsAQAIZYDAgDJBAAhlwMCAMkEACEDAAAAJgAgAQAA1wIAMC8AANgCACADAAAAJgAgAQAAJwAwAgAAKAAgAQAAADEAIAEAAAAxACADAAAALwAgAQAAMAAwAgAAMQAgAwAAAC8AIAEAADAAMAIAADEAIAMAAAAvACABAAAwADACAAAxACAMAwAA-wUAIAYAAPkFACAHAAD6BQAgFAAA_AUAIBUAAP0FACDZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB8wIBAAAAAZIDQAAAAAGTAwEAAAABASMAAOACACAH2QIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAfMCAQAAAAGSA0AAAAABkwMBAAAAAQEjAADiAgAwASMAAOICADAMAwAA5QUAIAYAAOMFACAHAADkBQAgFAAA5gUAIBUAAOcFACDZAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIfMCAQCsBQAhkgNAAK4FACGTAwEArQUAIQIAAAAxACAjAADlAgAgB9kCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh8wIBAKwFACGSA0AArgUAIZMDAQCtBQAhAgAAAC8AICMAAOcCACACAAAALwAgIwAA5wIAIAMAAAAxACAqAADgAgAgKwAA5QIAIAEAAAAxACABAAAALwAgBA4AAOAFACAwAADiBQAgMQAA4QUAIJMDAACoBQAgCtYCAADHBAAw1wIAAO4CABDYAgAAxwQAMNkCAQCaBAAh3wJAAJ4EACHxAgEAmgQAIfICAQCaBAAh8wIBAJoEACGSA0AAngQAIZMDAQCdBAAhAwAAAC8AIAEAAO0CADAvAADuAgAgAwAAAC8AIAEAADAAMAIAADEAIAoRAADGBAAgFQEAqgQAIdYCAADFBAAw1wIAADwAENgCAADFBAAw2QIBAAAAAd8CQACuBAAhhwMBAAAAAZEDAgC0BAAhkgNAAK4EACEBAAAA8QIAIAEAAADxAgAgAREAAN8FACADAAAAPAAgAQAA9AIAMAIAAPECACADAAAAPAAgAQAA9AIAMAIAAPECACADAAAAPAAgAQAA9AIAMAIAAPECACAHEQAA3gUAIBUBAAAAAdkCAQAAAAHfAkAAAAABhwMBAAAAAZEDAgAAAAGSA0AAAAABASMAAPgCACAGFQEAAAAB2QIBAAAAAd8CQAAAAAGHAwEAAAABkQMCAAAAAZIDQAAAAAEBIwAA-gIAMAEjAAD6AgAwBxEAAN0FACAVAQCsBQAh2QIBAKwFACHfAkAArgUAIYcDAQCsBQAhkQMCALQFACGSA0AArgUAIQIAAADxAgAgIwAA_QIAIAYVAQCsBQAh2QIBAKwFACHfAkAArgUAIYcDAQCsBQAhkQMCALQFACGSA0AArgUAIQIAAAA8ACAjAAD_AgAgAgAAADwAICMAAP8CACADAAAA8QIAICoAAPgCACArAAD9AgAgAQAAAPECACABAAAAPAAgBQ4AANgFACAwAADbBQAgMQAA2gUAIIIBAADZBQAggwEAANwFACAJFQEAmgQAIdYCAADEBAAw1wIAAIYDABDYAgAAxAQAMNkCAQCaBAAh3wJAAJ4EACGHAwEAmgQAIZEDAgCwBAAhkgNAAJ4EACEDAAAAPAAgAQAAhQMAMC8AAIYDACADAAAAPAAgAQAA9AIAMAIAAPECACABAAAANQAgAQAAADUAIAMAAAAzACABAAA0ADACAAA1ACADAAAAMwAgAQAANAAwAgAANQAgAwAAADMAIAEAADQAMAIAADUAIAgRAADWBQAgEwAA1wUAINkCAQAAAAHfAkAAAAABhwMBAAAAAY4DAAAAjgMCjwMBAAAAAZADgAAAAAEBIwAAjgMAIAbZAgEAAAAB3wJAAAAAAYcDAQAAAAGOAwAAAI4DAo8DAQAAAAGQA4AAAAABASMAAJADADABIwAAkAMAMAgRAADIBQAgEwAAyQUAINkCAQCsBQAh3wJAAK4FACGHAwEArAUAIY4DAADHBY4DIo8DAQCsBQAhkAOAAAAAAQIAAAA1ACAjAACTAwAgBtkCAQCsBQAh3wJAAK4FACGHAwEArAUAIY4DAADHBY4DIo8DAQCsBQAhkAOAAAAAAQIAAAAzACAjAACVAwAgAgAAADMAICMAAJUDACADAAAANQAgKgAAjgMAICsAAJMDACABAAAANQAgAQAAADMAIAQOAADEBQAgMAAAxgUAIDEAAMUFACCQAwAAqAUAIAnWAgAAwAQAMNcCAACcAwAQ2AIAAMAEADDZAgEAmgQAId8CQACeBAAhhwMBAJoEACGOAwAAwQSOAyKPAwEAmgQAIZADAACcBAAgAwAAADMAIAEAAJsDADAvAACcAwAgAwAAADMAIAEAADQAMAIAADUAIAEAAAA5ACABAAAAOQAgAwAAADcAIAEAADgAMAIAADkAIAMAAAA3ACABAAA4ADACAAA5ACADAAAANwAgAQAAOAAwAgAAOQAgChIAAMMFACDZAgEAAAAB3wJAAAAAAfECAQAAAAHzAgEAAAABhwMBAAAAAYkDAAAAiQMCigMBAAAAAYsDgAAAAAGMAwEAAAABASMAAKQDACAJ2QIBAAAAAd8CQAAAAAHxAgEAAAAB8wIBAAAAAYcDAQAAAAGJAwAAAIkDAooDAQAAAAGLA4AAAAABjAMBAAAAAQEjAACmAwAwASMAAKYDADAKEgAAwgUAINkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfMCAQCsBQAhhwMBAKwFACGJAwAAwQWJAyKKAwEArQUAIYsDgAAAAAGMAwEArAUAIQIAAAA5ACAjAACpAwAgCdkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfMCAQCsBQAhhwMBAKwFACGJAwAAwQWJAyKKAwEArQUAIYsDgAAAAAGMAwEArAUAIQIAAAA3ACAjAACrAwAgAgAAADcAICMAAKsDACADAAAAOQAgKgAApAMAICsAAKkDACABAAAAOQAgAQAAADcAIAUOAAC-BQAgMAAAwAUAIDEAAL8FACCKAwAAqAUAIIsDAACoBQAgDNYCAAC8BAAw1wIAALIDABDYAgAAvAQAMNkCAQCaBAAh3wJAAJ4EACHxAgEAmgQAIfMCAQCaBAAhhwMBAJoEACGJAwAAvQSJAyKKAwEAnQQAIYsDAACcBAAgjAMBAJoEACEDAAAANwAgAQAAsQMAMC8AALIDACADAAAANwAgAQAAOAAwAgAAOQAgEtYCAAC6BAAw1wIAALgDABDYAgAAugQAMNkCAQAAAAHfAkAArgQAIfECAQCtBAAh8gIBAK0EACHzAgEArQQAIf4CAACsBAAg_wIBAKoEACGAAwEAqgQAIYEDAQCqBAAhggMCALQEACGDAwIAtAQAIYQDAgC0BAAhhQMIALsEACGGAwIAtAQAIYcDAQCtBAAhAQAAALUDACABAAAAtQMAIBLWAgAAugQAMNcCAAC4AwAQ2AIAALoEADDZAgEAqgQAId8CQACuBAAh8QIBAK0EACHyAgEArQQAIfMCAQCtBAAh_gIAAKwEACD_AgEAqgQAIYADAQCqBAAhgQMBAKoEACGCAwIAtAQAIYMDAgC0BAAhhAMCALQEACGFAwgAuwQAIYYDAgC0BAAhhwMBAK0EACEF8QIAAKgFACDyAgAAqAUAIPMCAACoBQAg_gIAAKgFACCHAwAAqAUAIAMAAAC4AwAgAQAAuQMAMAIAALUDACADAAAAuAMAIAEAALkDADACAAC1AwAgAwAAALgDACABAAC5AwAwAgAAtQMAIA_ZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB8wIBAAAAAf4CgAAAAAH_AgEAAAABgAMBAAAAAYEDAQAAAAGCAwIAAAABgwMCAAAAAYQDAgAAAAGFAwgAAAABhgMCAAAAAYcDAQAAAAEBIwAAvQMAIA_ZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB8wIBAAAAAf4CgAAAAAH_AgEAAAABgAMBAAAAAYEDAQAAAAGCAwIAAAABgwMCAAAAAYQDAgAAAAGFAwgAAAABhgMCAAAAAYcDAQAAAAEBIwAAvwMAMAEjAAC_AwAwD9kCAQCsBQAh3wJAAK4FACHxAgEArQUAIfICAQCtBQAh8wIBAK0FACH-AoAAAAAB_wIBAKwFACGAAwEArAUAIYEDAQCsBQAhggMCALQFACGDAwIAtAUAIYQDAgC0BQAhhQMIAL0FACGGAwIAtAUAIYcDAQCtBQAhAgAAALUDACAjAADCAwAgD9kCAQCsBQAh3wJAAK4FACHxAgEArQUAIfICAQCtBQAh8wIBAK0FACH-AoAAAAAB_wIBAKwFACGAAwEArAUAIYEDAQCsBQAhggMCALQFACGDAwIAtAUAIYQDAgC0BQAhhQMIAL0FACGGAwIAtAUAIYcDAQCtBQAhAgAAALgDACAjAADEAwAgAgAAALgDACAjAADEAwAgAwAAALUDACAqAAC9AwAgKwAAwgMAIAEAAAC1AwAgAQAAALgDACAKDgAAuAUAIDAAALsFACAxAAC6BQAgggEAALkFACCDAQAAvAUAIPECAACoBQAg8gIAAKgFACDzAgAAqAUAIP4CAACoBQAghwMAAKgFACAS1gIAALcEADDXAgAAywMAENgCAAC3BAAw2QIBAJoEACHfAkAAngQAIfECAQCdBAAh8gIBAJ0EACHzAgEAnQQAIf4CAACcBAAg_wIBAJoEACGAAwEAmgQAIYEDAQCaBAAhggMCALAEACGDAwIAsAQAIYQDAgCwBAAhhQMIALgEACGGAwIAsAQAIYcDAQCdBAAhAwAAALgDACABAADKAwAwLwAAywMAIAMAAAC4AwAgAQAAuQMAMAIAALUDACAP1gIAALYEADDXAgAA0QMAENgCAAC2BAAw2QIBAAAAAd8CQACuBAAh8QIBAK0EACHyAgEArQQAIfMCAQCtBAAh-AIBAKoEACH5AgEAqgQAIfoCAQCtBAAh-wIBAK0EACH8AgEArQQAIf0CAQCtBAAh_gIAAKwEACABAAAAzgMAIAEAAADOAwAgD9YCAAC2BAAw1wIAANEDABDYAgAAtgQAMNkCAQCqBAAh3wJAAK4EACHxAgEArQQAIfICAQCtBAAh8wIBAK0EACH4AgEAqgQAIfkCAQCqBAAh-gIBAK0EACH7AgEArQQAIfwCAQCtBAAh_QIBAK0EACH-AgAArAQAIAjxAgAAqAUAIPICAACoBQAg8wIAAKgFACD6AgAAqAUAIPsCAACoBQAg_AIAAKgFACD9AgAAqAUAIP4CAACoBQAgAwAAANEDACABAADSAwAwAgAAzgMAIAMAAADRAwAgAQAA0gMAMAIAAM4DACADAAAA0QMAIAEAANIDADACAADOAwAgDNkCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAHzAgEAAAAB-AIBAAAAAfkCAQAAAAH6AgEAAAAB-wIBAAAAAfwCAQAAAAH9AgEAAAAB_gKAAAAAAQEjAADWAwAgDNkCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAHzAgEAAAAB-AIBAAAAAfkCAQAAAAH6AgEAAAAB-wIBAAAAAfwCAQAAAAH9AgEAAAAB_gKAAAAAAQEjAADYAwAwASMAANgDADAM2QIBAKwFACHfAkAArgUAIfECAQCtBQAh8gIBAK0FACHzAgEArQUAIfgCAQCsBQAh-QIBAKwFACH6AgEArQUAIfsCAQCtBQAh_AIBAK0FACH9AgEArQUAIf4CgAAAAAECAAAAzgMAICMAANsDACAM2QIBAKwFACHfAkAArgUAIfECAQCtBQAh8gIBAK0FACHzAgEArQUAIfgCAQCsBQAh-QIBAKwFACH6AgEArQUAIfsCAQCtBQAh_AIBAK0FACH9AgEArQUAIf4CgAAAAAECAAAA0QMAICMAAN0DACACAAAA0QMAICMAAN0DACADAAAAzgMAICoAANYDACArAADbAwAgAQAAAM4DACABAAAA0QMAIAsOAAC1BQAgMAAAtwUAIDEAALYFACDxAgAAqAUAIPICAACoBQAg8wIAAKgFACD6AgAAqAUAIPsCAACoBQAg_AIAAKgFACD9AgAAqAUAIP4CAACoBQAgD9YCAAC1BAAw1wIAAOQDABDYAgAAtQQAMNkCAQCaBAAh3wJAAJ4EACHxAgEAnQQAIfICAQCdBAAh8wIBAJ0EACH4AgEAmgQAIfkCAQCaBAAh-gIBAJ0EACH7AgEAnQQAIfwCAQCdBAAh_QIBAJ0EACH-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_QMAENgCAACvBAAw2QIBAJoEACHfAkAAngQAIfECAQCaBAAh8gIBAJ0EACHzAgEAnQQAIfQCAQCaBAAh9QICALAEACH2AgIAsAQAIfcCAgCwBAAhDQ4AAKAEACAwAACgBAAgMQAAoAQAIIIBAACyBAAggwEAAKAEACDgAgIAAAAB4QICAAAABOICAgAAAATjAgIAAAAB5AICAAAAAeUCAgAAAAHmAgIAAAAB5wICALEEACENDgAAoAQAIDAAAKAEACAxAACgBAAgggEAALIEACCDAQAAoAQAIOACAgAAAAHhAgIAAAAE4gICAAAABOMCAgAAAAHkAgIAAAAB5QICAAAAAeYCAgAAAAHnAgIAsQQAIQjgAggAAAAB4QIIAAAABOICCAAAAATjAggAAAAB5AIIAAAAAeUCCAAAAAHmAggAAAAB5wIIALIEACEM1gIAALMEADDXAgAA6gMAENgCAACzBAAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAK0EACHzAgEArQQAIfQCAQCqBAAh9QICALQEACH2AgIAtAQAIfcCAgC0BAAhCOACAgAAAAHhAgIAAAAE4gICAAAABOMCAgAAAAHkAgIAAAAB5QICAAAAAeYCAgAAAAHnAgIAoAQAIQ_WAgAAtQQAMNcCAADkAwAQ2AIAALUEADDZAgEAmgQAId8CQACeBAAh8QIBAJ0EACHyAgEAnQQAIfMCAQCdBAAh-AIBAJoEACH5AgEAmgQAIfoCAQCdBAAh-wIBAJ0EACH8AgEAnQQAIf0CAQCdBAAh_gIAAJwEACAP1gIAALYEADDXAgAA0QMAENgCAAC2BAAw2QIBAKoEACHfAkAArgQAIfECAQCtBAAh8gIBAK0EACHzAgEArQQAIfgCAQCqBAAh-QIBAKoEACH6AgEArQQAIfsCAQCtBAAh_AIBAK0EACH9AgEArQQAIf4CAACsBAAgEtYCAAC3BAAw1wIAAMsDABDYAgAAtwQAMNkCAQCaBAAh3wJAAJ4EACHxAgEAnQQAIfICAQCdBAAh8wIBAJ0EACH-AgAAnAQAIP8CAQCaBAAhgAMBAJoEACGBAwEAmgQAIYIDAgCwBAAhgwMCALAEACGEAwIAsAQAIYUDCAC4BAAhhgMCALAEACGHAwEAnQQAIQ0OAACgBAAgMAAAsgQAIDEAALIEACCCAQAAsgQAIIMBAACyBAAg4AIIAAAAAeECCAAAAATiAggAAAAE4wIIAAAAAeQCCAAAAAHlAggAAAAB5gIIAAAAAecCCAC5BAAhDQ4AAKAEACAwAACyBAAgMQAAsgQAIIIBAACyBAAggwEAALIEACDgAggAAAAB4QIIAAAABOICCAAAAATjAggAAAAB5AIIAAAAAeUCCAAAAAHmAggAAAAB5wIIALkEACES1gIAALoEADDXAgAAuAMAENgCAAC6BAAw2QIBAKoEACHfAkAArgQAIfECAQCtBAAh8gIBAK0EACHzAgEArQQAIf4CAACsBAAg_wIBAKoEACGAAwEAqgQAIYEDAQCqBAAhggMCALQEACGDAwIAtAQAIYQDAgC0BAAhhQMIALsEACGGAwIAtAQAIYcDAQCtBAAhCOACCAAAAAHhAggAAAAE4gIIAAAABOMCCAAAAAHkAggAAAAB5QIIAAAAAeYCCAAAAAHnAggAsgQAIQzWAgAAvAQAMNcCAACyAwAQ2AIAALwEADDZAgEAmgQAId8CQACeBAAh8QIBAJoEACHzAgEAmgQAIYcDAQCaBAAhiQMAAL0EiQMiigMBAJ0EACGLAwAAnAQAIIwDAQCaBAAhBw4AAKAEACAwAAC_BAAgMQAAvwQAIOACAAAAiQMC4QIAAACJAwjiAgAAAIkDCOcCAAC-BIkDIgcOAACgBAAgMAAAvwQAIDEAAL8EACDgAgAAAIkDAuECAAAAiQMI4gIAAACJAwjnAgAAvgSJAyIE4AIAAACJAwLhAgAAAIkDCOICAAAAiQMI5wIAAL8EiQMiCdYCAADABAAw1wIAAJwDABDYAgAAwAQAMNkCAQCaBAAh3wJAAJ4EACGHAwEAmgQAIY4DAADBBI4DIo8DAQCaBAAhkAMAAJwEACAHDgAAoAQAIDAAAMMEACAxAADDBAAg4AIAAACOAwLhAgAAAI4DCOICAAAAjgMI5wIAAMIEjgMiBw4AAKAEACAwAADDBAAgMQAAwwQAIOACAAAAjgMC4QIAAACOAwjiAgAAAI4DCOcCAADCBI4DIgTgAgAAAI4DAuECAAAAjgMI4gIAAACOAwjnAgAAwwSOAyIJFQEAmgQAIdYCAADEBAAw1wIAAIYDABDYAgAAxAQAMNkCAQCaBAAh3wJAAJ4EACGHAwEAmgQAIZEDAgCwBAAhkgNAAJ4EACEKEQAAxgQAIBUBAKoEACHWAgAAxQQAMNcCAAA8ABDYAgAAxQQAMNkCAQCqBAAh3wJAAK4EACGHAwEAqgQAIZEDAgC0BAAhkgNAAK4EACERAwAA_AQAIAYAAIYFACAHAACABQAgFAAAkQUAIBUAAJIFACDWAgAAkAUAMNcCAAAvABDYAgAAkAUAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh8wIBAKoEACGSA0AArgQAIZMDAQCtBAAhxQMAAC8AIMYDAAAvACAK1gIAAMcEADDXAgAA7gIAENgCAADHBAAw2QIBAJoEACHfAkAAngQAIfECAQCaBAAh8gIBAJoEACHzAgEAmgQAIZIDQACeBAAhkwMBAJ0EACEN1gIAAMgEADDXAgAA2AIAENgCAADIBAAw2QIBAJoEACHfAkAAngQAIfECAQCaBAAh8gIBAJoEACH-AgAAnAQAII8DAQCaBAAhlAMBAJoEACGVAwIAsAQAIZYDAgDJBAAhlwMCAMkEACENDgAAowQAIDAAAKMEACAxAACjBAAgggEAAMsEACCDAQAAowQAIOACAgAAAAHhAgIAAAAF4gICAAAABeMCAgAAAAHkAgIAAAAB5QICAAAAAeYCAgAAAAHnAgIAygQAIQ0OAACjBAAgMAAAowQAIDEAAKMEACCCAQAAywQAIIMBAACjBAAg4AICAAAAAeECAgAAAAXiAgIAAAAF4wICAAAAAeQCAgAAAAHlAgIAAAAB5gICAAAAAecCAgDKBAAhCOACCAAAAAHhAggAAAAF4gIIAAAABeMCCAAAAAHkAggAAAAB5QIIAAAAAeYCCAAAAAHnAggAywQAIQnWAgAAzAQAMNcCAADCAgAQ2AIAAMwEADDZAgEAmgQAId8CQACeBAAhlAMBAJoEACGYAwIAsAQAIZkDAQCdBAAhmgMBAJ0EACEOFQEAmgQAIdYCAADNBAAw1wIAAKwCABDYAgAAzQQAMNkCAQCaBAAh3wJAAJ4EACHxAgEAmgQAIfICAQCaBAAhkgNAAJ4EACGTAwEAmgQAIZQDAQCdBAAhnAMAAM4EnAMinQMBAJ0EACGeAwEAnQQAIQcOAACgBAAgMAAA0AQAIDEAANAEACDgAgAAAJwDAuECAAAAnAMI4gIAAACcAwjnAgAAzwScAyIHDgAAoAQAIDAAANAEACAxAADQBAAg4AIAAACcAwLhAgAAAJwDCOICAAAAnAMI5wIAAM8EnAMiBOACAAAAnAMC4QIAAACcAwjiAgAAAJwDCOcCAADQBJwDIg7WAgAA0QQAMNcCAACSAgAQ2AIAANEEADDZAgEAmgQAId8CQACeBAAh_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_AwAADAAgA70DAABTACC-AwAAUwAgvwMAAFMAIAO9AwAACAAgvgMAAAgAIL8DAAAIACADvQMAABAAIL4DAAAQACC_AwAAEAAgA70DAAAvACC-AwAALwAgvwMAAC8AIA8EAAD8BAAgBQAA9QQAIAkAAPkEACAWAAD6BAAgFwAA_QQAIBkAAPgEACDWAgAA-wQAMNcCAABTABDYAgAA-wQAMNkCAQCqBAAh2gIBAKoEACHeAgEAqgQAId8CQACuBAAhkgNAAK4EACGzAwEAqgQAIRcWAAD6BAAgGQAA9gQAIBoAAPUEACAbAAD3BAAgHAAA-AQAIB0AAPkEACDWAgAA8QQAMNcCAABhABDYAgAA8QQAMNkCAQCqBAAh3wJAAK4EACGOAwAA8gS5AyKSA0AArgQAIbQDAQCqBAAhtQMBAKoEACG2AwEAqgQAIbcDAQCqBAAhuQMgAPMEACG6AyAA8wQAIbsDAQCtBAAhvANAAPQEACHFAwAAYQAgxgMAAGEAIAO9AwAAFAAgvgMAABQAIL8DAAAUACARBwAAgAUAIAoAAIIFACALAACBBQAgFQEAqgQAIdYCAAD-BAAw1wIAABwAENgCAAD-BAAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIZMDAQCqBAAhlAMBAK0EACGcAwAA_wScAyKdAwEArQQAIZ4DAQCtBAAhBOACAAAAnAMC4QIAAACcAwjiAgAAAJwDCOcCAADQBJwDIhMEAAD8BAAgBQAA9gQAIAYAAIYFACAJAAD5BAAgFgAA-gQAIBcAAP0EACAYAACkBQAg1gIAAKMFADDXAgAACAAQ2AIAAKMFADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfICAQCqBAAhkgNAAK4EACGxAwEArQQAIcUDAAAIACDGAwAACAAgHQYAAIYFACAHAACABQAgCAAA_AQAIAoAAIIFACAMAACHBQAgDQAAiAUAIA8AAJ4FACAQAACfBQAg1gIAAJwFADDXAgAAEAAQ2AIAAJwFADDZAgEAqgQAIdoCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh_gIAAKwEACCSA0AArgQAIZkDAQCtBAAhngMBAK0EACGfAwEArQQAIaYDAACdBa4DIqoDAQCqBAAhqwMCALQEACGsAwEAqgQAIa4DAQCtBAAhrwMBAKoEACHFAwAAEAAgxgMAABAAIBcGAACGBQAgBwAAgAUAIAkAAPkEACAMAACHBQAgDQAAiAUAINYCAACDBQAw1wIAABQAENgCAACDBQAw2QIBAKoEACHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGhA0AA9AQAIaQDAACEBaQDIqYDAACFBaYDIqcDAACrBAAgqAMBAK0EACGpAwEArQQAIcUDAAAUACDGAwAAFAAgFQYAAIYFACAHAACABQAgCQAA-QQAIAwAAIcFACANAACIBQAg1gIAAIMFADDXAgAAFAAQ2AIAAIMFADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIaEDQAD0BAAhpAMAAIQFpAMipgMAAIUFpgMipwMAAKsEACCoAwEArQQAIakDAQCtBAAhBOACAAAApAMC4QIAAACkAwjiAgAAAKQDCOcCAADbBKQDIgTgAgAAAKYDAuECAAAApgMI4gIAAACmAwjnAgAA2QSmAyIRBAAA_AQAIAUAAPUEACAJAAD5BAAgFgAA-gQAIBcAAP0EACAZAAD4BAAg1gIAAPsEADDXAgAAUwAQ2AIAAPsEADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIZIDQACuBAAhswMBAKoEACHFAwAAUwAgxgMAAFMAIAO9AwAAFwAgvgMAABcAIL8DAAAXACATBwAAgAUAIAoAAIIFACALAACBBQAgFQEAqgQAIdYCAAD-BAAw1wIAABwAENgCAAD-BAAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIZMDAQCqBAAhlAMBAK0EACGcAwAA_wScAyKdAwEArQQAIZ4DAQCtBAAhxQMAABwAIMYDAAAcACAC8wIBAAAAAYwDAQAAAAENEgAAjAUAINYCAACKBQAw1wIAADcAENgCAACKBQAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8wIBAKoEACGHAwEAqgQAIYkDAACLBYkDIooDAQCtBAAhiwMAAKwEACCMAwEAqgQAIQTgAgAAAIkDAuECAAAAiQMI4gIAAACJAwjnAgAAvwSJAyINEQAAxgQAIBMAAI8FACDWAgAAjQUAMNcCAAAzABDYAgAAjQUAMNkCAQCqBAAh3wJAAK4EACGHAwEAqgQAIY4DAACOBY4DIo8DAQCqBAAhkAMAAKwEACDFAwAAMwAgxgMAADMAIAsRAADGBAAgEwAAjwUAINYCAACNBQAw1wIAADMAENgCAACNBQAw2QIBAKoEACHfAkAArgQAIYcDAQCqBAAhjgMAAI4FjgMijwMBAKoEACGQAwAArAQAIATgAgAAAI4DAuECAAAAjgMI4gIAAACOAwjnAgAAwwSOAyIDvQMAADcAIL4DAAA3ACC_AwAANwAgDwMAAPwEACAGAACGBQAgBwAAgAUAIBQAAJEFACAVAACSBQAg1gIAAJAFADDXAgAALwAQ2AIAAJAFADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHyAgEAqgQAIfMCAQCqBAAhkgNAAK4EACGTAwEArQQAIQO9AwAAMwAgvgMAADMAIL8DAAAzACAMEQAAxgQAIBUBAKoEACHWAgAAxQQAMNcCAAA8ABDYAgAAxQQAMNkCAQCqBAAh3wJAAK4EACGHAwEAqgQAIZEDAgC0BAAhkgNAAK4EACHFAwAAPAAgxgMAADwAIA4LAACVBQAg1gIAAJMFADDXAgAAJgAQ2AIAAJMFADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHyAgEAqgQAIf4CAACsBAAgjwMBAKoEACGUAwEAqgQAIZUDAgC0BAAhlgMCAJQFACGXAwIAlAUAIQjgAgIAAAAB4QICAAAABeICAgAAAAXjAgIAAAAB5AICAAAAAeUCAgAAAAHmAgIAAAAB5wICAKMEACEdBgAAhgUAIAcAAIAFACAIAAD8BAAgCgAAggUAIAwAAIcFACANAACIBQAgDwAAngUAIBAAAJ8FACDWAgAAnAUAMNcCAAAQABDYAgAAnAUAMNkCAQCqBAAh2gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACH-AgAArAQAIJIDQACuBAAhmQMBAK0EACGeAwEArQQAIZ8DAQCtBAAhpgMAAJ0FrgMiqgMBAKoEACGrAwIAtAQAIawDAQCqBAAhrgMBAK0EACGvAwEAqgQAIcUDAAAQACDGAwAAEAAgApQDAQAAAAGYAwIAAAABCgsAAJUFACDWAgAAlwUAMNcCAAAiABDYAgAAlwUAMNkCAQCqBAAh3wJAAK4EACGUAwEAqgQAIZgDAgC0BAAhmQMBAK0EACGaAwEArQQAIQKeAwEAAAABnwMBAAAAARAKAACaBQAgCwAAgQUAINYCAACZBQAw1wIAABcAENgCAACZBQAw2QIBAKoEACHfAkAArgQAIf4CAACsBAAgkgNAAK4EACGUAwEArQQAIZkDAQCtBAAhngMBAKoEACGfAwEAqgQAIaADQAD0BAAhoQNAAPQEACGiA0AA9AQAIRcGAACGBQAgBwAAgAUAIAkAAPkEACAMAACHBQAgDQAAiAUAINYCAACDBQAw1wIAABQAENgCAACDBQAw2QIBAKoEACHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGhA0AA9AQAIaQDAACEBaQDIqYDAACFBaYDIqcDAACrBAAgqAMBAK0EACGpAwEArQQAIcUDAAAUACDGAwAAFAAgAp4DAQAAAAGfAwEAAAABGwYAAIYFACAHAACABQAgCAAA_AQAIAoAAIIFACAMAACHBQAgDQAAiAUAIA8AAJ4FACAQAACfBQAg1gIAAJwFADDXAgAAEAAQ2AIAAJwFADDZAgEAqgQAIdoCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh_gIAAKwEACCSA0AArgQAIZkDAQCtBAAhngMBAK0EACGfAwEArQQAIaYDAACdBa4DIqoDAQCqBAAhqwMCALQEACGsAwEAqgQAIa4DAQCtBAAhrwMBAKoEACEE4AIAAACuAwLhAgAAAK4DCOICAAAArgMI5wIAAN8ErgMiA70DAAAiACC-AwAAIgAgvwMAACIAIAO9AwAAJgAgvgMAACYAIL8DAAAmACAC8QIBAAAAAfMCAQAAAAELAwAA_AQAIAcAAIAFACDWAgAAoQUAMNcCAAAMABDYAgAAoQUAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfMCAQCqBAAhjgMAAKIFsQMikgNAAK4EACEE4AIAAACxAwLhAgAAALEDCOICAAAAsQMI5wIAAOMEsQMiEQQAAPwEACAFAAD2BAAgBgAAhgUAIAkAAPkEACAWAAD6BAAgFwAA_QQAIBgAAKQFACDWAgAAowUAMNcCAAAIABDYAgAAowUAMNkCAQCqBAAh2gIBAKoEACHeAgEAqgQAId8CQACuBAAh8gIBAKoEACGSA0AArgQAIbEDAQCtBAAhA70DAAAcACC-AwAAHAAgvwMAABwAIALyAgEAAAAB8wIBAAAAAQsDAAD8BAAgBgAAhgUAINYCAACmBQAw1wIAAAMAENgCAACmBQAw2QIBAKoEACHfAkAArgQAIfICAQCqBAAh8wIBAKoEACGOAwAApwWzAyKSA0AArgQAIQTgAgAAALMDAuECAAAAswMI4gIAAACzAwjnAgAA6ASzAyIAAAAAAcoDAQAAAAEBygMBAAAAAQHKA0AAAAABAAAAAAAFygMCAAAAAdADAgAAAAHRAwIAAAAB0gMCAAAAAdMDAgAAAAEAAAAAAAAAAAXKAwgAAAAB0AMIAAAAAdEDCAAAAAHSAwgAAAAB0wMIAAAAAQAAAAHKAwAAAIkDAgUqAACWCgAgKwAAmQoAIMcDAACXCgAgyAMAAJgKACDNAwAANQAgAyoAAJYKACDHAwAAlwoAIM0DAAA1ACAAAAABygMAAACOAwIFKgAAkAoAICsAAJQKACDHAwAAkQoAIMgDAACTCgAgzQMAADEAIAsqAADKBQAwKwAAzwUAMMcDAADLBQAwyAMAAMwFADDJAwAAzQUAIMoDAADOBQAwywMAAM4FADDMAwAAzgUAMM0DAADOBQAwzgMAANAFADDPAwAA0QUAMAjZAgEAAAAB3wJAAAAAAfECAQAAAAHzAgEAAAABhwMBAAAAAYkDAAAAiQMCigMBAAAAAYsDgAAAAAECAAAAOQAgKgAA1QUAIAMAAAA5ACAqAADVBQAgKwAA1AUAIAEjAACSCgAwDhIAAIwFACDWAgAAigUAMNcCAAA3ABDYAgAAigUAMNkCAQAAAAHfAkAArgQAIfECAQCqBAAh8wIBAKoEACGHAwEAqgQAIYkDAACLBYkDIooDAQCtBAAhiwMAAKwEACCMAwEAqgQAIcADAACJBQAgAgAAADkAICMAANQFACACAAAA0gUAICMAANMFACAM1gIAANEFADDXAgAA0gUAENgCAADRBQAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8wIBAKoEACGHAwEAqgQAIYkDAACLBYkDIooDAQCtBAAhiwMAAKwEACCMAwEAqgQAIQzWAgAA0QUAMNcCAADSBQAQ2AIAANEFADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHzAgEAqgQAIYcDAQCqBAAhiQMAAIsFiQMiigMBAK0EACGLAwAArAQAIIwDAQCqBAAhCNkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfMCAQCsBQAhhwMBAKwFACGJAwAAwQWJAyKKAwEArQUAIYsDgAAAAAEI2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8wIBAKwFACGHAwEArAUAIYkDAADBBYkDIooDAQCtBQAhiwOAAAAAAQjZAgEAAAAB3wJAAAAAAfECAQAAAAHzAgEAAAABhwMBAAAAAYkDAAAAiQMCigMBAAAAAYsDgAAAAAEDKgAAkAoAIMcDAACRCgAgzQMAADEAIAQqAADKBQAwxwMAAMsFADDJAwAAzQUAIM0DAADOBQAwAAAAAAAFKgAAiwoAICsAAI4KACDHAwAAjAoAIMgDAACNCgAgzQMAADEAIAMqAACLCgAgxwMAAIwKACDNAwAAMQAgBgMAAPMIACAGAAD4CAAgBwAA9QgAIBQAAP0IACAVAAD-CAAgkwMAAKgFACAAAAAFKgAA_wkAICsAAIkKACDHAwAAgAoAIMgDAACICgAgzQMAAFUAIAUqAAD9CQAgKwAAhgoAIMcDAAD-CQAgyAMAAIUKACDNAwAACgAgBSoAAPsJACArAACDCgAgxwMAAPwJACDIAwAAggoAIM0DAAABACALKgAA7QUAMCsAAPIFADDHAwAA7gUAMMgDAADvBQAwyQMAAPAFACDKAwAA8QUAMMsDAADxBQAwzAMAAPEFADDNAwAA8QUAMM4DAADzBQAwzwMAAPQFADAHKgAA6AUAICsAAOsFACDHAwAA6QUAIMgDAADqBQAgywMAADwAIMwDAAA8ACDNAwAA8QIAIAUVAQAAAAHZAgEAAAAB3wJAAAAAAZEDAgAAAAGSA0AAAAABAgAAAPECACAqAADoBQAgAwAAADwAICoAAOgFACArAADsBQAgBwAAADwAIBUBAKwFACEjAADsBQAg2QIBAKwFACHfAkAArgUAIZEDAgC0BQAhkgNAAK4FACEFFQEArAUAIdkCAQCsBQAh3wJAAK4FACGRAwIAtAUAIZIDQACuBQAhBhMAANcFACDZAgEAAAAB3wJAAAAAAY4DAAAAjgMCjwMBAAAAAZADgAAAAAECAAAANQAgKgAA-AUAIAMAAAA1ACAqAAD4BQAgKwAA9wUAIAEjAACBCgAwCxEAAMYEACATAACPBQAg1gIAAI0FADDXAgAAMwAQ2AIAAI0FADDZAgEAAAAB3wJAAK4EACGHAwEAqgQAIY4DAACOBY4DIo8DAQCqBAAhkAMAAKwEACACAAAANQAgIwAA9wUAIAIAAAD1BQAgIwAA9gUAIAnWAgAA9AUAMNcCAAD1BQAQ2AIAAPQFADDZAgEAqgQAId8CQACuBAAhhwMBAKoEACGOAwAAjgWOAyKPAwEAqgQAIZADAACsBAAgCdYCAAD0BQAw1wIAAPUFABDYAgAA9AUAMNkCAQCqBAAh3wJAAK4EACGHAwEAqgQAIY4DAACOBY4DIo8DAQCqBAAhkAMAAKwEACAF2QIBAKwFACHfAkAArgUAIY4DAADHBY4DIo8DAQCsBQAhkAOAAAAAAQYTAADJBQAg2QIBAKwFACHfAkAArgUAIY4DAADHBY4DIo8DAQCsBQAhkAOAAAAAAQYTAADXBQAg2QIBAAAAAd8CQAAAAAGOAwAAAI4DAo8DAQAAAAGQA4AAAAABAyoAAP8JACDHAwAAgAoAIM0DAABVACADKgAA_QkAIMcDAAD-CQAgzQMAAAoAIAMqAAD7CQAgxwMAAPwJACDNAwAAAQAgBCoAAO0FADDHAwAA7gUAMMkDAADwBQAgzQMAAPEFADADKgAA6AUAIMcDAADpBQAgzQMAAPECACAAAAAAAAXKAwIAAAAB0AMCAAAAAdEDAgAAAAHSAwIAAAAB0wMCAAAAAQUqAAD2CQAgKwAA-QkAIMcDAAD3CQAgyAMAAPgJACDNAwAAEgAgAyoAAPYJACDHAwAA9wkAIM0DAAASACAAAAAAAAUqAADxCQAgKwAA9AkAIMcDAADyCQAgyAMAAPMJACDNAwAAEgAgAyoAAPEJACDHAwAA8gkAIM0DAAASACAAAAABygMAAACcAwIFKgAA5gkAICsAAO8JACDHAwAA5wkAIMgDAADuCQAgzQMAAAoAIAcqAADkCQAgKwAA7AkAIMcDAADlCQAgyAMAAOsJACDLAwAAEAAgzAMAABAAIM0DAAASACAHKgAA4gkAICsAAOkJACDHAwAA4wkAIMgDAADoCQAgywMAABQAIMwDAAAUACDNAwAAQAAgAyoAAOYJACDHAwAA5wkAIM0DAAAKACADKgAA5AkAIMcDAADlCQAgzQMAABIAIAMqAADiCQAgxwMAAOMJACDNAwAAQAAgAAAAAcoDQAAAAAEFKgAA2gkAICsAAOAJACDHAwAA2wkAIMgDAADfCQAgzQMAAEAAIAcqAADYCQAgKwAA3QkAIMcDAADZCQAgyAMAANwJACDLAwAAEAAgzAMAABAAIM0DAAASACADKgAA2gkAIMcDAADbCQAgzQMAAEAAIAMqAADYCQAgxwMAANkJACDNAwAAEgAgAAAAAcoDAAAApAMCAcoDAAAApgMCBSoAALwJACArAADWCQAgxwMAAL0JACDIAwAA1QkAIM0DAABVACAFKgAAugkAICsAANMJACDHAwAAuwkAIMgDAADSCQAgzQMAAAoAIAsqAAC6BgAwKwAAvwYAMMcDAAC7BgAwyAMAALwGADDJAwAAvQYAIMoDAAC-BgAwywMAAL4GADDMAwAAvgYAMM0DAAC-BgAwzgMAAMAGADDPAwAAwQYAMAsqAACuBgAwKwAAswYAMMcDAACvBgAwyAMAALAGADDJAwAAsQYAIMoDAACyBgAwywMAALIGADDMAwAAsgYAMM0DAACyBgAwzgMAALQGADDPAwAAtQYAMAcqAACpBgAgKwAArAYAIMcDAACqBgAgyAMAAKsGACDLAwAAHAAgzAMAABwAIM0DAABDACAMBwAAlAYAIAsAAJUGACAVAQAAAAHZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAZMDAQAAAAGUAwEAAAABnAMAAACcAwKdAwEAAAABAgAAAEMAICoAAKkGACADAAAAHAAgKgAAqQYAICsAAK0GACAOAAAAHAAgBwAAkQYAIAsAAJIGACAVAQCsBQAhIwAArQYAINkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAhkgNAAK4FACGTAwEArAUAIZQDAQCtBQAhnAMAAJAGnAMinQMBAK0FACEMBwAAkQYAIAsAAJIGACAVAQCsBQAh2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIZMDAQCsBQAhlAMBAK0FACGcAwAAkAacAyKdAwEArQUAIQsLAACeBgAg2QIBAAAAAd8CQAAAAAH-AoAAAAABkgNAAAAAAZQDAQAAAAGZAwEAAAABnwMBAAAAAaADQAAAAAGhA0AAAAABogNAAAAAAQIAAAAZACAqAAC5BgAgAwAAABkAICoAALkGACArAAC4BgAgASMAANEJADARCgAAmgUAIAsAAIEFACDWAgAAmQUAMNcCAAAXABDYAgAAmQUAMNkCAQAAAAHfAkAArgQAIf4CAACsBAAgkgNAAK4EACGUAwEArQQAIZkDAQCtBAAhngMBAKoEACGfAwEAqgQAIaADQAD0BAAhoQNAAPQEACGiA0AA9AQAIcIDAACYBQAgAgAAABkAICMAALgGACACAAAAtgYAICMAALcGACAO1gIAALUGADDXAgAAtgYAENgCAAC1BgAw2QIBAKoEACHfAkAArgQAIf4CAACsBAAgkgNAAK4EACGUAwEArQQAIZkDAQCtBAAhngMBAKoEACGfAwEAqgQAIaADQAD0BAAhoQNAAPQEACGiA0AA9AQAIQ7WAgAAtQYAMNcCAAC2BgAQ2AIAALUGADDZAgEAqgQAId8CQACuBAAh_gIAAKwEACCSA0AArgQAIZQDAQCtBAAhmQMBAK0EACGeAwEAqgQAIZ8DAQCqBAAhoANAAPQEACGhA0AA9AQAIaIDQAD0BAAhCtkCAQCsBQAh3wJAAK4FACH-AoAAAAABkgNAAK4FACGUAwEArQUAIZkDAQCtBQAhnwMBAKwFACGgA0AAmgYAIaEDQACaBgAhogNAAJoGACELCwAAnAYAINkCAQCsBQAh3wJAAK4FACH-AoAAAAABkgNAAK4FACGUAwEArQUAIZkDAQCtBQAhnwMBAKwFACGgA0AAmgYAIaEDQACaBgAhogNAAJoGACELCwAAngYAINkCAQAAAAHfAkAAAAAB_gKAAAAAAZIDQAAAAAGUAwEAAAABmQMBAAAAAZ8DAQAAAAGgA0AAAAABoQNAAAAAAaIDQAAAAAEWBgAA9AYAIAcAAPUGACAIAAD2BgAgDAAA-QYAIA0AAPoGACAPAAD3BgAgEAAA-AYAINkCAQAAAAHaAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB_gKAAAAAAZIDQAAAAAGZAwEAAAABnwMBAAAAAaYDAAAArgMCqgMBAAAAAasDAgAAAAGsAwEAAAABrgMBAAAAAa8DAQAAAAECAAAAEgAgKgAA8wYAIAMAAAASACAqAADzBgAgKwAAxQYAIAEjAADQCQAwHAYAAIYFACAHAACABQAgCAAA_AQAIAoAAIIFACAMAACHBQAgDQAAiAUAIA8AAJ4FACAQAACfBQAg1gIAAJwFADDXAgAAEAAQ2AIAAJwFADDZAgEAAAAB2gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACH-AgAArAQAIJIDQACuBAAhmQMBAK0EACGeAwEArQQAIZ8DAQCtBAAhpgMAAJ0FrgMiqgMBAKoEACGrAwIAtAQAIawDAQCqBAAhrgMBAK0EACGvAwEAqgQAIcIDAACbBQAgAgAAABIAICMAAMUGACACAAAAwgYAICMAAMMGACAT1gIAAMEGADDXAgAAwgYAENgCAADBBgAw2QIBAKoEACHaAgEAqgQAId8CQACuBAAh8QIBAKoEACHyAgEAqgQAIf4CAACsBAAgkgNAAK4EACGZAwEArQQAIZ4DAQCtBAAhnwMBAK0EACGmAwAAnQWuAyKqAwEAqgQAIasDAgC0BAAhrAMBAKoEACGuAwEArQQAIa8DAQCqBAAhE9YCAADBBgAw1wIAAMIGABDYAgAAwQYAMNkCAQCqBAAh2gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACH-AgAArAQAIJIDQACuBAAhmQMBAK0EACGeAwEArQQAIZ8DAQCtBAAhpgMAAJ0FrgMiqgMBAKoEACGrAwIAtAQAIawDAQCqBAAhrgMBAK0EACGvAwEAqgQAIQ_ZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGfAwEArQUAIaYDAADEBq4DIqoDAQCsBQAhqwMCALQFACGsAwEArAUAIa4DAQCtBQAhrwMBAKwFACEBygMAAACuAwIWBgAAxgYAIAcAAMcGACAIAADIBgAgDAAAywYAIA0AAMwGACAPAADJBgAgEAAAygYAINkCAQCsBQAh2gIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACH-AoAAAAABkgNAAK4FACGZAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACGvAwEArAUAIQUqAADCCQAgKwAAzgkAIMcDAADDCQAgyAMAAM0JACDNAwAAVQAgBSoAAMAJACArAADLCQAgxwMAAMEJACDIAwAAygkAIM0DAAAKACAFKgAAvgkAICsAAMgJACDHAwAAvwkAIMgDAADHCQAgzQMAAAEAIAsqAADnBgAwKwAA7AYAMMcDAADoBgAwyAMAAOkGADDJAwAA6gYAIMoDAADrBgAwywMAAOsGADDMAwAA6wYAMM0DAADrBgAwzgMAAO0GADDPAwAA7gYAMAsqAADbBgAwKwAA4AYAMMcDAADcBgAwyAMAAN0GADDJAwAA3gYAIMoDAADfBgAwywMAAN8GADDMAwAA3wYAMM0DAADfBgAwzgMAAOEGADDPAwAA4gYAMAsqAADSBgAwKwAA1gYAMMcDAADTBgAwyAMAANQGADDJAwAA1QYAIMoDAACyBgAwywMAALIGADDMAwAAsgYAMM0DAACyBgAwzgMAANcGADDPAwAAtQYAMAcqAADNBgAgKwAA0AYAIMcDAADOBgAgyAMAAM8GACDLAwAAHAAgzAMAABwAIM0DAABDACAMBwAAlAYAIAoAAJYGACAVAQAAAAHZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAZMDAQAAAAGcAwAAAJwDAp0DAQAAAAGeAwEAAAABAgAAAEMAICoAAM0GACADAAAAHAAgKgAAzQYAICsAANEGACAOAAAAHAAgBwAAkQYAIAoAAJMGACAVAQCsBQAhIwAA0QYAINkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAhkgNAAK4FACGTAwEArAUAIZwDAACQBpwDIp0DAQCtBQAhngMBAK0FACEMBwAAkQYAIAoAAJMGACAVAQCsBQAh2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIZMDAQCsBQAhnAMAAJAGnAMinQMBAK0FACGeAwEArQUAIQsKAACdBgAg2QIBAAAAAd8CQAAAAAH-AoAAAAABkgNAAAAAAZkDAQAAAAGeAwEAAAABnwMBAAAAAaADQAAAAAGhA0AAAAABogNAAAAAAQIAAAAZACAqAADaBgAgAwAAABkAICoAANoGACArAADZBgAgASMAAMYJADACAAAAGQAgIwAA2QYAIAIAAAC2BgAgIwAA2AYAIArZAgEArAUAId8CQACuBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArAUAIZ8DAQCsBQAhoANAAJoGACGhA0AAmgYAIaIDQACaBgAhCwoAAJsGACDZAgEArAUAId8CQACuBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArAUAIZ8DAQCsBQAhoANAAJoGACGhA0AAmgYAIaIDQACaBgAhCwoAAJ0GACDZAgEAAAAB3wJAAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABoANAAAAAAaEDQAAAAAGiA0AAAAABCdkCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAH-AoAAAAABjwMBAAAAAZUDAgAAAAGWAwIAAAABlwMCAAAAAQIAAAAoACAqAADmBgAgAwAAACgAICoAAOYGACArAADlBgAgASMAAMUJADAOCwAAlQUAINYCAACTBQAw1wIAACYAENgCAACTBQAw2QIBAAAAAd8CQACuBAAh8QIBAKoEACHyAgEAqgQAIf4CAACsBAAgjwMBAKoEACGUAwEAqgQAIZUDAgC0BAAhlgMCAJQFACGXAwIAlAUAIQIAAAAoACAjAADlBgAgAgAAAOMGACAjAADkBgAgDdYCAADiBgAw1wIAAOMGABDYAgAA4gYAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh_gIAAKwEACCPAwEAqgQAIZQDAQCqBAAhlQMCALQEACGWAwIAlAUAIZcDAgCUBQAhDdYCAADiBgAw1wIAAOMGABDYAgAA4gYAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh_gIAAKwEACCPAwEAqgQAIZQDAQCqBAAhlQMCALQEACGWAwIAlAUAIZcDAgCUBQAhCdkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAY8DAQCsBQAhlQMCALQFACGWAwIAgwYAIZcDAgCDBgAhCdkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAY8DAQCsBQAhlQMCALQFACGWAwIAgwYAIZcDAgCDBgAhCdkCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAH-AoAAAAABjwMBAAAAAZUDAgAAAAGWAwIAAAABlwMCAAAAAQXZAgEAAAAB3wJAAAAAAZgDAgAAAAGZAwEAAAABmgMBAAAAAQIAAAAkACAqAADyBgAgAwAAACQAICoAAPIGACArAADxBgAgASMAAMQJADALCwAAlQUAINYCAACXBQAw1wIAACIAENgCAACXBQAw2QIBAAAAAd8CQACuBAAhlAMBAKoEACGYAwIAtAQAIZkDAQCtBAAhmgMBAK0EACHBAwAAlgUAIAIAAAAkACAjAADxBgAgAgAAAO8GACAjAADwBgAgCdYCAADuBgAw1wIAAO8GABDYAgAA7gYAMNkCAQCqBAAh3wJAAK4EACGUAwEAqgQAIZgDAgC0BAAhmQMBAK0EACGaAwEArQQAIQnWAgAA7gYAMNcCAADvBgAQ2AIAAO4GADDZAgEAqgQAId8CQACuBAAhlAMBAKoEACGYAwIAtAQAIZkDAQCtBAAhmgMBAK0EACEF2QIBAKwFACHfAkAArgUAIZgDAgC0BQAhmQMBAK0FACGaAwEArQUAIQXZAgEArAUAId8CQACuBQAhmAMCALQFACGZAwEArQUAIZoDAQCtBQAhBdkCAQAAAAHfAkAAAAABmAMCAAAAAZkDAQAAAAGaAwEAAAABFgYAAPQGACAHAAD1BgAgCAAA9gYAIAwAAPkGACANAAD6BgAgDwAA9wYAIBAAAPgGACDZAgEAAAAB2gIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ8DAQAAAAGmAwAAAK4DAqoDAQAAAAGrAwIAAAABrAMBAAAAAa4DAQAAAAGvAwEAAAABAyoAAMIJACDHAwAAwwkAIM0DAABVACADKgAAwAkAIMcDAADBCQAgzQMAAAoAIAMqAAC-CQAgxwMAAL8JACDNAwAAAQAgBCoAAOcGADDHAwAA6AYAMMkDAADqBgAgzQMAAOsGADAEKgAA2wYAMMcDAADcBgAwyQMAAN4GACDNAwAA3wYAMAQqAADSBgAwxwMAANMGADDJAwAA1QYAIM0DAACyBgAwAyoAAM0GACDHAwAAzgYAIM0DAABDACADKgAAvAkAIMcDAAC9CQAgzQMAAFUAIAMqAAC6CQAgxwMAALsJACDNAwAACgAgBCoAALoGADDHAwAAuwYAMMkDAAC9BgAgzQMAAL4GADAEKgAArgYAMMcDAACvBgAwyQMAALEGACDNAwAAsgYAMAMqAACpBgAgxwMAAKoGACDNAwAAQwAgAAAAAAAHKgAAtQkAICsAALgJACDHAwAAtgkAIMgDAAC3CQAgywMAABQAIMwDAAAUACDNAwAAQAAgAyoAALUJACDHAwAAtgkAIM0DAABAACAAAAABygMAAACxAwIFKgAArQkAICsAALMJACDHAwAArgkAIMgDAACyCQAgzQMAAAoAIAUqAACrCQAgKwAAsAkAIMcDAACsCQAgyAMAAK8JACDNAwAAAQAgAyoAAK0JACDHAwAArgkAIM0DAAAKACADKgAAqwkAIMcDAACsCQAgzQMAAAEAIAAAAAUqAACeCQAgKwAAqQkAIMcDAACfCQAgyAMAAKgJACDNAwAAVQAgBSoAAJwJACArAACmCQAgxwMAAJ0JACDIAwAApQkAIM0DAAABACALKgAAxgcAMCsAAMsHADDHAwAAxwcAMMgDAADIBwAwyQMAAMkHACDKAwAAygcAMMsDAADKBwAwzAMAAMoHADDNAwAAygcAMM4DAADMBwAwzwMAAM0HADALKgAAvQcAMCsAAMEHADDHAwAAvgcAMMgDAAC_BwAwyQMAAMAHACDKAwAAvgYAMMsDAAC-BgAwzAMAAL4GADDNAwAAvgYAMM4DAADCBwAwzwMAAMEGADALKgAAsQcAMCsAALYHADDHAwAAsgcAMMgDAACzBwAwyQMAALQHACDKAwAAtQcAMMsDAAC1BwAwzAMAALUHADDNAwAAtQcAMM4DAAC3BwAwzwMAALgHADALKgAApQcAMCsAAKoHADDHAwAApgcAMMgDAACnBwAwyQMAAKgHACDKAwAAqQcAMMsDAACpBwAwzAMAAKkHADDNAwAAqQcAMM4DAACrBwAwzwMAAKwHADALKgAAmQcAMCsAAJ4HADDHAwAAmgcAMMgDAACbBwAwyQMAAJwHACDKAwAAnQcAMMsDAACdBwAwzAMAAJ0HADDNAwAAnQcAMM4DAACfBwAwzwMAAKAHADAMCgAAlgYAIAsAAJUGACAVAQAAAAHZAgEAAAAB3wJAAAAAAfICAQAAAAGSA0AAAAABkwMBAAAAAZQDAQAAAAGcAwAAAJwDAp0DAQAAAAGeAwEAAAABAgAAAEMAICoAAKQHACADAAAAQwAgKgAApAcAICsAAKMHACABIwAApAkAMBEHAACABQAgCgAAggUAIAsAAIEFACAVAQCqBAAh1gIAAP4EADDXAgAAHAAQ2AIAAP4EADDZAgEAAAAB3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGTAwEAqgQAIZQDAQAAAAGcAwAA_wScAyKdAwEArQQAIZ4DAQAAAAECAAAAQwAgIwAAowcAIAIAAAChBwAgIwAAogcAIA4VAQCqBAAh1gIAAKAHADDXAgAAoQcAENgCAACgBwAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIZMDAQCqBAAhlAMBAK0EACGcAwAA_wScAyKdAwEArQQAIZ4DAQCtBAAhDhUBAKoEACHWAgAAoAcAMNcCAAChBwAQ2AIAAKAHADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHyAgEAqgQAIZIDQACuBAAhkwMBAKoEACGUAwEArQQAIZwDAAD_BJwDIp0DAQCtBAAhngMBAK0EACEKFQEArAUAIdkCAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhkwMBAKwFACGUAwEArQUAIZwDAACQBpwDIp0DAQCtBQAhngMBAK0FACEMCgAAkwYAIAsAAJIGACAVAQCsBQAh2QIBAKwFACHfAkAArgUAIfICAQCsBQAhkgNAAK4FACGTAwEArAUAIZQDAQCtBQAhnAMAAJAGnAMinQMBAK0FACGeAwEArQUAIQwKAACWBgAgCwAAlQYAIBUBAAAAAdkCAQAAAAHfAkAAAAAB8gIBAAAAAZIDQAAAAAGTAwEAAAABlAMBAAAAAZwDAAAAnAMCnQMBAAAAAZ4DAQAAAAEQBgAA-wYAIAkAAP0GACAMAAD-BgAgDQAA_wYAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABAgAAAEAAICoAALAHACADAAAAQAAgKgAAsAcAICsAAK8HACABIwAAowkAMBUGAACGBQAgBwAAgAUAIAkAAPkEACAMAACHBQAgDQAAiAUAINYCAACDBQAw1wIAABQAENgCAACDBQAw2QIBAAAAAdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIaEDQAD0BAAhpAMAAIQFpAMipgMAAIUFpgMipwMAAKsEACCoAwEArQQAIakDAQCtBAAhAgAAAEAAICMAAK8HACACAAAArQcAICMAAK4HACAQ1gIAAKwHADDXAgAArQcAENgCAACsBwAw2QIBAKoEACHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHxAgEAqgQAIfICAQCqBAAhkgNAAK4EACGhA0AA9AQAIaQDAACEBaQDIqYDAACFBaYDIqcDAACrBAAgqAMBAK0EACGpAwEArQQAIRDWAgAArAcAMNcCAACtBwAQ2AIAAKwHADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACGSA0AArgQAIaEDQAD0BAAhpAMAAIQFpAMipgMAAIUFpgMipwMAAKsEACCoAwEArQQAIakDAQCtBAAhDNkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACEQBgAApAYAIAkAAKYGACAMAACnBgAgDQAAqAYAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACEQBgAA-wYAIAkAAP0GACAMAAD-BgAgDQAA_wYAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABCgMAAPsFACAGAAD5BQAgFAAA_AUAIBUAAP0FACDZAgEAAAAB3wJAAAAAAfICAQAAAAHzAgEAAAABkgNAAAAAAZMDAQAAAAECAAAAMQAgKgAAvAcAIAMAAAAxACAqAAC8BwAgKwAAuwcAIAEjAACiCQAwDwMAAPwEACAGAACGBQAgBwAAgAUAIBQAAJEFACAVAACSBQAg1gIAAJAFADDXAgAALwAQ2AIAAJAFADDZAgEAAAAB3wJAAK4EACHxAgEAqgQAIfICAQCqBAAh8wIBAKoEACGSA0AArgQAIZMDAQCtBAAhAgAAADEAICMAALsHACACAAAAuQcAICMAALoHACAK1gIAALgHADDXAgAAuQcAENgCAAC4BwAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACHzAgEAqgQAIZIDQACuBAAhkwMBAK0EACEK1gIAALgHADDXAgAAuQcAENgCAAC4BwAw2QIBAKoEACHfAkAArgQAIfECAQCqBAAh8gIBAKoEACHzAgEAqgQAIZIDQACuBAAhkwMBAK0EACEG2QIBAKwFACHfAkAArgUAIfICAQCsBQAh8wIBAKwFACGSA0AArgUAIZMDAQCtBQAhCgMAAOUFACAGAADjBQAgFAAA5gUAIBUAAOcFACDZAgEArAUAId8CQACuBQAh8gIBAKwFACHzAgEArAUAIZIDQACuBQAhkwMBAK0FACEKAwAA-wUAIAYAAPkFACAUAAD8BQAgFQAA_QUAINkCAQAAAAHfAkAAAAAB8gIBAAAAAfMCAQAAAAGSA0AAAAABkwMBAAAAARYGAAD0BgAgCAAA9gYAIAoAAIYHACAMAAD5BgAgDQAA-gYAIA8AAPcGACAQAAD4BgAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8gIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABpgMAAACuAwKqAwEAAAABqwMCAAAAAawDAQAAAAGuAwEAAAABrwMBAAAAAQIAAAASACAqAADFBwAgAwAAABIAICoAAMUHACArAADEBwAgASMAAKEJADACAAAAEgAgIwAAxAcAIAIAAADCBgAgIwAAwwcAIA_ZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHyAgEArAUAIf4CgAAAAAGSA0AArgUAIZkDAQCtBQAhngMBAK0FACGfAwEArQUAIaYDAADEBq4DIqoDAQCsBQAhqwMCALQFACGsAwEArAUAIa4DAQCtBQAhrwMBAKwFACEWBgAAxgYAIAgAAMgGACAKAACFBwAgDAAAywYAIA0AAMwGACAPAADJBgAgEAAAygYAINkCAQCsBQAh2gIBAKwFACHfAkAArgUAIfICAQCsBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACGvAwEArAUAIRYGAAD0BgAgCAAA9gYAIAoAAIYHACAMAAD5BgAgDQAA-gYAIA8AAPcGACAQAAD4BgAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8gIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABpgMAAACuAwKqAwEAAAABqwMCAAAAAawDAQAAAAGuAwEAAAABrwMBAAAAAQYDAACOBwAg2QIBAAAAAd8CQAAAAAHzAgEAAAABjgMAAACxAwKSA0AAAAABAgAAAA4AICoAANEHACADAAAADgAgKgAA0QcAICsAANAHACABIwAAoAkAMAwDAAD8BAAgBwAAgAUAINYCAAChBQAw1wIAAAwAENgCAAChBQAw2QIBAAAAAd8CQACuBAAh8QIBAKoEACHzAgEAqgQAIY4DAACiBbEDIpIDQACuBAAhwwMAAKAFACACAAAADgAgIwAA0AcAIAIAAADOBwAgIwAAzwcAIAnWAgAAzQcAMNcCAADOBwAQ2AIAAM0HADDZAgEAqgQAId8CQACuBAAh8QIBAKoEACHzAgEAqgQAIY4DAACiBbEDIpIDQACuBAAhCdYCAADNBwAw1wIAAM4HABDYAgAAzQcAMNkCAQCqBAAh3wJAAK4EACHxAgEAqgQAIfMCAQCqBAAhjgMAAKIFsQMikgNAAK4EACEF2QIBAKwFACHfAkAArgUAIfMCAQCsBQAhjgMAAIoHsQMikgNAAK4FACEGAwAAjAcAINkCAQCsBQAh3wJAAK4FACHzAgEArAUAIY4DAACKB7EDIpIDQACuBQAhBgMAAI4HACDZAgEAAAAB3wJAAAAAAfMCAQAAAAGOAwAAALEDApIDQAAAAAEDKgAAngkAIMcDAACfCQAgzQMAAFUAIAMqAACcCQAgxwMAAJ0JACDNAwAAAQAgBCoAAMYHADDHAwAAxwcAMMkDAADJBwAgzQMAAMoHADAEKgAAvQcAMMcDAAC-BwAwyQMAAMAHACDNAwAAvgYAMAQqAACxBwAwxwMAALIHADDJAwAAtAcAIM0DAAC1BwAwBCoAAKUHADDHAwAApgcAMMkDAACoBwAgzQMAAKkHADAEKgAAmQcAMMcDAACaBwAwyQMAAJwHACDNAwAAnQcAMAAAAAHKAwAAALMDAgUqAACUCQAgKwAAmgkAIMcDAACVCQAgyAMAAJkJACDNAwAAAQAgBSoAAJIJACArAACXCQAgxwMAAJMJACDIAwAAlgkAIM0DAABVACADKgAAlAkAIMcDAACVCQAgzQMAAAEAIAMqAACSCQAgxwMAAJMJACDNAwAAVQAgAAAABSoAAIgJACArAACQCQAgxwMAAIkJACDIAwAAjwkAIM0DAAABACALKgAAkQgAMCsAAJYIADDHAwAAkggAMMgDAACTCAAwyQMAAJQIACDKAwAAlQgAMMsDAACVCAAwzAMAAJUIADDNAwAAlQgAMM4DAACXCAAwzwMAAJgIADALKgAAhQgAMCsAAIoIADDHAwAAhggAMMgDAACHCAAwyQMAAIgIACDKAwAAiQgAMMsDAACJCAAwzAMAAIkIADDNAwAAiQgAMM4DAACLCAAwzwMAAIwIADALKgAA_AcAMCsAAIAIADDHAwAA_QcAMMgDAAD-BwAwyQMAAP8HACDKAwAAvgYAMMsDAAC-BgAwzAMAAL4GADDNAwAAvgYAMM4DAACBCAAwzwMAAMEGADALKgAA8wcAMCsAAPcHADDHAwAA9AcAMMgDAAD1BwAwyQMAAPYHACDKAwAAtQcAMMsDAAC1BwAwzAMAALUHADDNAwAAtQcAMM4DAAD4BwAwzwMAALgHADALKgAA6gcAMCsAAO4HADDHAwAA6wcAMMgDAADsBwAwyQMAAO0HACDKAwAAqQcAMMsDAACpBwAwzAMAAKkHADDNAwAAqQcAMM4DAADvBwAwzwMAAKwHADAQBwAA_AYAIAkAAP0GACAMAAD-BgAgDQAA_wYAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHxAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABAgAAAEAAICoAAPIHACADAAAAQAAgKgAA8gcAICsAAPEHACABIwAAjgkAMAIAAABAACAjAADxBwAgAgAAAK0HACAjAADwBwAgDNkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8QIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACEQBwAApQYAIAkAAKYGACAMAACnBgAgDQAAqAYAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8QIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACEQBwAA_AYAIAkAAP0GACAMAAD-BgAgDQAA_wYAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHxAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABCgMAAPsFACAHAAD6BQAgFAAA_AUAIBUAAP0FACDZAgEAAAAB3wJAAAAAAfECAQAAAAHzAgEAAAABkgNAAAAAAZMDAQAAAAECAAAAMQAgKgAA-wcAIAMAAAAxACAqAAD7BwAgKwAA-gcAIAEjAACNCQAwAgAAADEAICMAAPoHACACAAAAuQcAICMAAPkHACAG2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8wIBAKwFACGSA0AArgUAIZMDAQCtBQAhCgMAAOUFACAHAADkBQAgFAAA5gUAIBUAAOcFACDZAgEArAUAId8CQACuBQAh8QIBAKwFACHzAgEArAUAIZIDQACuBQAhkwMBAK0FACEKAwAA-wUAIAcAAPoFACAUAAD8BQAgFQAA_QUAINkCAQAAAAHfAkAAAAAB8QIBAAAAAfMCAQAAAAGSA0AAAAABkwMBAAAAARYHAAD1BgAgCAAA9gYAIAoAAIYHACAMAAD5BgAgDQAA-gYAIA8AAPcGACAQAAD4BgAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8QIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABpgMAAACuAwKqAwEAAAABqwMCAAAAAawDAQAAAAGuAwEAAAABrwMBAAAAAQIAAAASACAqAACECAAgAwAAABIAICoAAIQIACArAACDCAAgASMAAIwJADACAAAAEgAgIwAAgwgAIAIAAADCBgAgIwAAgggAIA_ZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHxAgEArAUAIf4CgAAAAAGSA0AArgUAIZkDAQCtBQAhngMBAK0FACGfAwEArQUAIaYDAADEBq4DIqoDAQCsBQAhqwMCALQFACGsAwEArAUAIa4DAQCtBQAhrwMBAKwFACEWBwAAxwYAIAgAAMgGACAKAACFBwAgDAAAywYAIA0AAMwGACAPAADJBgAgEAAAygYAINkCAQCsBQAh2gIBAKwFACHfAkAArgUAIfECAQCsBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACGvAwEArAUAIRYHAAD1BgAgCAAA9gYAIAoAAIYHACAMAAD5BgAgDQAA-gYAIA8AAPcGACAQAAD4BgAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8QIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ4DAQAAAAGfAwEAAAABpgMAAACuAwKqAwEAAAABqwMCAAAAAawDAQAAAAGuAwEAAAABrwMBAAAAAQwEAADTBwAgBQAA1AcAIAkAANUHACAWAADWBwAgFwAA1wcAIBgAANgHACDZAgEAAAAB2gIBAAAAAd4CAQAAAAHfAkAAAAABkgNAAAAAAbEDAQAAAAECAAAACgAgKgAAkAgAIAMAAAAKACAqAACQCAAgKwAAjwgAIAEjAACLCQAwEQQAAPwEACAFAAD2BAAgBgAAhgUAIAkAAPkEACAWAAD6BAAgFwAA_QQAIBgAAKQFACDWAgAAowUAMNcCAAAIABDYAgAAowUAMNkCAQAAAAHaAgEAqgQAId4CAQCqBAAh3wJAAK4EACHyAgEAqgQAIZIDQACuBAAhsQMBAK0EACECAAAACgAgIwAAjwgAIAIAAACNCAAgIwAAjggAIArWAgAAjAgAMNcCAACNCAAQ2AIAAIwIADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfICAQCqBAAhkgNAAK4EACGxAwEArQQAIQrWAgAAjAgAMNcCAACNCAAQ2AIAAIwIADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIfICAQCqBAAhkgNAAK4EACGxAwEArQQAIQbZAgEArAUAIdoCAQCsBQAh3gIBAKwFACHfAkAArgUAIZIDQACuBQAhsQMBAK0FACEMBAAAkwcAIAUAAJQHACAJAACVBwAgFgAAlgcAIBcAAJcHACAYAACYBwAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACGSA0AArgUAIbEDAQCtBQAhDAQAANMHACAFAADUBwAgCQAA1QcAIBYAANYHACAXAADXBwAgGAAA2AcAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAGSA0AAAAABsQMBAAAAAQYDAADfBwAg2QIBAAAAAd8CQAAAAAHzAgEAAAABjgMAAACzAwKSA0AAAAABAgAAAAUAICoAAJwIACADAAAABQAgKgAAnAgAICsAAJsIACABIwAAigkAMAwDAAD8BAAgBgAAhgUAINYCAACmBQAw1wIAAAMAENgCAACmBQAw2QIBAAAAAd8CQACuBAAh8gIBAKoEACHzAgEAqgQAIY4DAACnBbMDIpIDQACuBAAhxAMAAKUFACACAAAABQAgIwAAmwgAIAIAAACZCAAgIwAAmggAIAnWAgAAmAgAMNcCAACZCAAQ2AIAAJgIADDZAgEAqgQAId8CQACuBAAh8gIBAKoEACHzAgEAqgQAIY4DAACnBbMDIpIDQACuBAAhCdYCAACYCAAw1wIAAJkIABDYAgAAmAgAMNkCAQCqBAAh3wJAAK4EACHyAgEAqgQAIfMCAQCqBAAhjgMAAKcFswMikgNAAK4EACEF2QIBAKwFACHfAkAArgUAIfMCAQCsBQAhjgMAANwHswMikgNAAK4FACEGAwAA3QcAINkCAQCsBQAh3wJAAK4FACHzAgEArAUAIY4DAADcB7MDIpIDQACuBQAhBgMAAN8HACDZAgEAAAAB3wJAAAAAAfMCAQAAAAGOAwAAALMDApIDQAAAAAEDKgAAiAkAIMcDAACJCQAgzQMAAAEAIAQqAACRCAAwxwMAAJIIADDJAwAAlAgAIM0DAACVCAAwBCoAAIUIADDHAwAAhggAMMkDAACICAAgzQMAAIkIADAEKgAA_AcAMMcDAAD9BwAwyQMAAP8HACDNAwAAvgYAMAQqAADzBwAwxwMAAPQHADDJAwAA9gcAIM0DAAC1BwAwBCoAAOoHADDHAwAA6wcAMMkDAADtBwAgzQMAAKkHADAAAAABygMAAAC5AwIBygMgAAAAAQsqAADeCAAwKwAA4ggAMMcDAADfCAAwyAMAAOAIADDJAwAA4QgAIMoDAACVCAAwywMAAJUIADDMAwAAlQgAMM0DAACVCAAwzgMAAOMIADDPAwAAmAgAMAsqAADVCAAwKwAA2QgAMMcDAADWCAAwyAMAANcIADDJAwAA2AgAIMoDAADKBwAwywMAAMoHADDMAwAAygcAMM0DAADKBwAwzgMAANoIADDPAwAAzQcAMAsqAADJCAAwKwAAzggAMMcDAADKCAAwyAMAAMsIADDJAwAAzAgAIMoDAADNCAAwywMAAM0IADDMAwAAzQgAMM0DAADNCAAwzgMAAM8IADDPAwAA0AgAMAsqAADACAAwKwAAxAgAMMcDAADBCAAwyAMAAMIIADDJAwAAwwgAIMoDAACJCAAwywMAAIkIADDMAwAAiQgAMM0DAACJCAAwzgMAAMUIADDPAwAAjAgAMAsqAAC3CAAwKwAAuwgAMMcDAAC4CAAwyAMAALkIADDJAwAAuggAIMoDAAC-BgAwywMAAL4GADDMAwAAvgYAMM0DAAC-BgAwzgMAALwIADDPAwAAwQYAMAsqAACuCAAwKwAAsggAMMcDAACvCAAwyAMAALAIADDJAwAAsQgAIMoDAAC1BwAwywMAALUHADDMAwAAtQcAMM0DAAC1BwAwzgMAALMIADDPAwAAuAcAMAoGAAD5BQAgBwAA-gUAIBQAAPwFACAVAAD9BQAg2QIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAZIDQAAAAAGTAwEAAAABAgAAADEAICoAALYIACADAAAAMQAgKgAAtggAICsAALUIACABIwAAhwkAMAIAAAAxACAjAAC1CAAgAgAAALkHACAjAAC0CAAgBtkCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAhkgNAAK4FACGTAwEArQUAIQoGAADjBQAgBwAA5AUAIBQAAOYFACAVAADnBQAg2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIZMDAQCtBQAhCgYAAPkFACAHAAD6BQAgFAAA_AUAIBUAAP0FACDZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAZMDAQAAAAEWBgAA9AYAIAcAAPUGACAKAACGBwAgDAAA-QYAIA0AAPoGACAPAAD3BgAgEAAA-AYAINkCAQAAAAHaAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB_gKAAAAAAZIDQAAAAAGZAwEAAAABngMBAAAAAZ8DAQAAAAGmAwAAAK4DAqoDAQAAAAGrAwIAAAABrAMBAAAAAa4DAQAAAAECAAAAEgAgKgAAvwgAIAMAAAASACAqAAC_CAAgKwAAvggAIAEjAACGCQAwAgAAABIAICMAAL4IACACAAAAwgYAICMAAL0IACAP2QIBAKwFACHaAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIf4CgAAAAAGSA0AArgUAIZkDAQCtBQAhngMBAK0FACGfAwEArQUAIaYDAADEBq4DIqoDAQCsBQAhqwMCALQFACGsAwEArAUAIa4DAQCtBQAhFgYAAMYGACAHAADHBgAgCgAAhQcAIAwAAMsGACANAADMBgAgDwAAyQYAIBAAAMoGACDZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACEWBgAA9AYAIAcAAPUGACAKAACGBwAgDAAA-QYAIA0AAPoGACAPAAD3BgAgEAAA-AYAINkCAQAAAAHaAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB_gKAAAAAAZIDQAAAAAGZAwEAAAABngMBAAAAAZ8DAQAAAAGmAwAAAK4DAqoDAQAAAAGrAwIAAAABrAMBAAAAAa4DAQAAAAEMBQAA1AcAIAYAANIHACAJAADVBwAgFgAA1gcAIBcAANcHACAYAADYBwAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8gIBAAAAAZIDQAAAAAGxAwEAAAABAgAAAAoAICoAAMgIACADAAAACgAgKgAAyAgAICsAAMcIACABIwAAhQkAMAIAAAAKACAjAADHCAAgAgAAAI0IACAjAADGCAAgBtkCAQCsBQAh2gIBAKwFACHfAkAArgUAIfICAQCsBQAhkgNAAK4FACGxAwEArQUAIQwFAACUBwAgBgAAkgcAIAkAAJUHACAWAACWBwAgFwAAlwcAIBgAAJgHACDZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhsQMBAK0FACEMBQAA1AcAIAYAANIHACAJAADVBwAgFgAA1gcAIBcAANcHACAYAADYBwAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8gIBAAAAAZIDQAAAAAGxAwEAAAABCgUAAJ4IACAJAACgCAAgFgAAoQgAIBcAAKIIACAZAACfCAAg2QIBAAAAAdoCAQAAAAHfAkAAAAABkgNAAAAAAbMDAQAAAAECAAAAVQAgKgAA1AgAIAMAAABVACAqAADUCAAgKwAA0wgAIAEjAACECQAwDwQAAPwEACAFAAD1BAAgCQAA-QQAIBYAAPoEACAXAAD9BAAgGQAA-AQAINYCAAD7BAAw1wIAAFMAENgCAAD7BAAw2QIBAAAAAdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIZIDQACuBAAhswMBAAAAAQIAAABVACAjAADTCAAgAgAAANEIACAjAADSCAAgCdYCAADQCAAw1wIAANEIABDYAgAA0AgAMNkCAQCqBAAh2gIBAKoEACHeAgEAqgQAId8CQACuBAAhkgNAAK4EACGzAwEAqgQAIQnWAgAA0AgAMNcCAADRCAAQ2AIAANAIADDZAgEAqgQAIdoCAQCqBAAh3gIBAKoEACHfAkAArgQAIZIDQACuBAAhswMBAKoEACEF2QIBAKwFACHaAgEArAUAId8CQACuBQAhkgNAAK4FACGzAwEArAUAIQoFAADlBwAgCQAA5wcAIBYAAOgHACAXAADpBwAgGQAA5gcAINkCAQCsBQAh2gIBAKwFACHfAkAArgUAIZIDQACuBQAhswMBAKwFACEKBQAAnggAIAkAAKAIACAWAAChCAAgFwAAoggAIBkAAJ8IACDZAgEAAAAB2gIBAAAAAd8CQAAAAAGSA0AAAAABswMBAAAAAQYHAACNBwAg2QIBAAAAAd8CQAAAAAHxAgEAAAABjgMAAACxAwKSA0AAAAABAgAAAA4AICoAAN0IACADAAAADgAgKgAA3QgAICsAANwIACABIwAAgwkAMAIAAAAOACAjAADcCAAgAgAAAM4HACAjAADbCAAgBdkCAQCsBQAh3wJAAK4FACHxAgEArAUAIY4DAACKB7EDIpIDQACuBQAhBgcAAIsHACDZAgEArAUAId8CQACuBQAh8QIBAKwFACGOAwAAigexAyKSA0AArgUAIQYHAACNBwAg2QIBAAAAAd8CQAAAAAHxAgEAAAABjgMAAACxAwKSA0AAAAABBgYAAOAHACDZAgEAAAAB3wJAAAAAAfICAQAAAAGOAwAAALMDApIDQAAAAAECAAAABQAgKgAA5ggAIAMAAAAFACAqAADmCAAgKwAA5QgAIAEjAACCCQAwAgAAAAUAICMAAOUIACACAAAAmQgAICMAAOQIACAF2QIBAKwFACHfAkAArgUAIfICAQCsBQAhjgMAANwHswMikgNAAK4FACEGBgAA3gcAINkCAQCsBQAh3wJAAK4FACHyAgEArAUAIY4DAADcB7MDIpIDQACuBQAhBgYAAOAHACDZAgEAAAAB3wJAAAAAAfICAQAAAAGOAwAAALMDApIDQAAAAAEEKgAA3ggAMMcDAADfCAAwyQMAAOEIACDNAwAAlQgAMAQqAADVCAAwxwMAANYIADDJAwAA2AgAIM0DAADKBwAwBCoAAMkIADDHAwAAyggAMMkDAADMCAAgzQMAAM0IADAEKgAAwAgAMMcDAADBCAAwyQMAAMMIACDNAwAAiQgAMAQqAAC3CAAwxwMAALgIADDJAwAAuggAIM0DAAC-BgAwBCoAAK4IADDHAwAArwgAMMkDAACxCAAgzQMAALUHADAAAAAAAAAIFgAA8ggAIBkAAO4IACAaAADtCAAgGwAA7wgAIBwAAPAIACAdAADxCAAguwMAAKgFACC8AwAAqAUAIAAIBAAA8wgAIAUAAO4IACAGAAD4CAAgCQAA8QgAIBYAAPIIACAXAAD0CAAgGAAAgQkAILEDAACoBQAgDQYAAPgIACAHAAD1CAAgCAAA8wgAIAoAAPcIACAMAAD5CAAgDQAA-ggAIA8AAP8IACAQAACACQAg_gIAAKgFACCZAwAAqAUAIJ4DAACoBQAgnwMAAKgFACCuAwAAqAUAIAgGAAD4CAAgBwAA9QgAIAkAAPEIACAMAAD5CAAgDQAA-ggAIKEDAACoBQAgqAMAAKgFACCpAwAAqAUAIAYEAADzCAAgBQAA7QgAIAkAAPEIACAWAADyCAAgFwAA9AgAIBkAAPAIACAABgcAAPUIACAKAAD3CAAgCwAA9ggAIJQDAACoBQAgnQMAAKgFACCeAwAAqAUAIAMRAADfBQAgEwAA_AgAIJADAACoBQAgAAABEQAA3wUAIAAAAAXZAgEAAAAB3wJAAAAAAfICAQAAAAGOAwAAALMDApIDQAAAAAEF2QIBAAAAAd8CQAAAAAHxAgEAAAABjgMAAACxAwKSA0AAAAABBdkCAQAAAAHaAgEAAAAB3wJAAAAAAZIDQAAAAAGzAwEAAAABBtkCAQAAAAHaAgEAAAAB3wJAAAAAAfICAQAAAAGSA0AAAAABsQMBAAAAAQ_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AQIAAAABACAqAACrCQAgDQQAANMHACAGAADSBwAgCQAA1QcAIBYAANYHACAXAADXBwAgGAAA2AcAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHyAgEAAAABkgNAAAAAAbEDAQAAAAECAAAACgAgKgAArQkAIAMAAABhACAqAACrCQAgKwAAsQkAIBMAAABhACAWAACtCAAgGgAAqAgAIBsAAKoIACAcAACrCAAgHQAArAgAICMAALEJACDZAgEArAUAId8CQACuBQAhjgMAAKYIuQMikgNAAK4FACG0AwEArAUAIbUDAQCsBQAhtgMBAKwFACG3AwEArAUAIbkDIACnCAAhugMgAKcIACG7AwEArQUAIbwDQACaBgAhERYAAK0IACAaAACoCAAgGwAAqggAIBwAAKsIACAdAACsCAAg2QIBAKwFACHfAkAArgUAIY4DAACmCLkDIpIDQACuBQAhtAMBAKwFACG1AwEArAUAIbYDAQCsBQAhtwMBAKwFACG5AyAApwgAIboDIACnCAAhuwMBAK0FACG8A0AAmgYAIQMAAAAIACAqAACtCQAgKwAAtAkAIA8AAAAIACAEAACTBwAgBgAAkgcAIAkAAJUHACAWAACWBwAgFwAAlwcAIBgAAJgHACAjAAC0CQAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhsQMBAK0FACENBAAAkwcAIAYAAJIHACAJAACVBwAgFgAAlgcAIBcAAJcHACAYAACYBwAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhsQMBAK0FACERBgAA-wYAIAcAAPwGACAMAAD-BgAgDQAA_wYAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAZIDQAAAAAGhA0AAAAABpAMAAACkAwKmAwAAAKYDAqcDgAAAAAGoAwEAAAABqQMBAAAAAQIAAABAACAqAAC1CQAgAwAAABQAICoAALUJACArAAC5CQAgEwAAABQAIAYAAKQGACAHAAClBgAgDAAApwYAIA0AAKgGACAjAAC5CQAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAhkgNAAK4FACGhA0AAmgYAIaQDAACiBqQDIqYDAACjBqYDIqcDgAAAAAGoAwEArQUAIakDAQCtBQAhEQYAAKQGACAHAAClBgAgDAAApwYAIA0AAKgGACDZAgEArAUAIdoCAQCsBQAh3gIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACENBAAA0wcAIAUAANQHACAGAADSBwAgCQAA1QcAIBYAANYHACAYAADYBwAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfICAQAAAAGSA0AAAAABsQMBAAAAAQIAAAAKACAqAAC6CQAgCwQAAJ0IACAFAACeCAAgCQAAoAgAIBYAAKEIACAZAACfCAAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAZIDQAAAAAGzAwEAAAABAgAAAFUAICoAALwJACARFgAA7AgAIBkAAOgIACAaAADnCAAgGwAA6QgAIBwAAOoIACDZAgEAAAAB3wJAAAAAAY4DAAAAuQMCkgNAAAAAAbQDAQAAAAG1AwEAAAABtgMBAAAAAbcDAQAAAAG5AyAAAAABugMgAAAAAbsDAQAAAAG8A0AAAAABAgAAAAEAICoAAL4JACANBAAA0wcAIAUAANQHACAGAADSBwAgFgAA1gcAIBcAANcHACAYAADYBwAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfICAQAAAAGSA0AAAAABsQMBAAAAAQIAAAAKACAqAADACQAgCwQAAJ0IACAFAACeCAAgFgAAoQgAIBcAAKIIACAZAACfCAAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAZIDQAAAAAGzAwEAAAABAgAAAFUAICoAAMIJACAF2QIBAAAAAd8CQAAAAAGYAwIAAAABmQMBAAAAAZoDAQAAAAEJ2QIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAf4CgAAAAAGPAwEAAAABlQMCAAAAAZYDAgAAAAGXAwIAAAABCtkCAQAAAAHfAkAAAAAB_gKAAAAAAZIDQAAAAAGZAwEAAAABngMBAAAAAZ8DAQAAAAGgA0AAAAABoQNAAAAAAaIDQAAAAAEDAAAAYQAgKgAAvgkAICsAAMkJACATAAAAYQAgFgAArQgAIBkAAKkIACAaAACoCAAgGwAAqggAIBwAAKsIACAjAADJCQAg2QIBAKwFACHfAkAArgUAIY4DAACmCLkDIpIDQACuBQAhtAMBAKwFACG1AwEArAUAIbYDAQCsBQAhtwMBAKwFACG5AyAApwgAIboDIACnCAAhuwMBAK0FACG8A0AAmgYAIREWAACtCAAgGQAAqQgAIBoAAKgIACAbAACqCAAgHAAAqwgAINkCAQCsBQAh3wJAAK4FACGOAwAApgi5AyKSA0AArgUAIbQDAQCsBQAhtQMBAKwFACG2AwEArAUAIbcDAQCsBQAhuQMgAKcIACG6AyAApwgAIbsDAQCtBQAhvANAAJoGACEDAAAACAAgKgAAwAkAICsAAMwJACAPAAAACAAgBAAAkwcAIAUAAJQHACAGAACSBwAgFgAAlgcAIBcAAJcHACAYAACYBwAgIwAAzAkAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIbEDAQCtBQAhDQQAAJMHACAFAACUBwAgBgAAkgcAIBYAAJYHACAXAACXBwAgGAAAmAcAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIbEDAQCtBQAhAwAAAFMAICoAAMIJACArAADPCQAgDQAAAFMAIAQAAOQHACAFAADlBwAgFgAA6AcAIBcAAOkHACAZAADmBwAgIwAAzwkAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAhkgNAAK4FACGzAwEArAUAIQsEAADkBwAgBQAA5QcAIBYAAOgHACAXAADpBwAgGQAA5gcAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAhkgNAAK4FACGzAwEArAUAIQ_ZAgEAAAAB2gIBAAAAAd8CQAAAAAHxAgEAAAAB8gIBAAAAAf4CgAAAAAGSA0AAAAABmQMBAAAAAZ8DAQAAAAGmAwAAAK4DAqoDAQAAAAGrAwIAAAABrAMBAAAAAa4DAQAAAAGvAwEAAAABCtkCAQAAAAHfAkAAAAAB_gKAAAAAAZIDQAAAAAGUAwEAAAABmQMBAAAAAZ8DAQAAAAGgA0AAAAABoQNAAAAAAaIDQAAAAAEDAAAACAAgKgAAugkAICsAANQJACAPAAAACAAgBAAAkwcAIAUAAJQHACAGAACSBwAgCQAAlQcAIBYAAJYHACAYAACYBwAgIwAA1AkAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIbEDAQCtBQAhDQQAAJMHACAFAACUBwAgBgAAkgcAIAkAAJUHACAWAACWBwAgGAAAmAcAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8gIBAKwFACGSA0AArgUAIbEDAQCtBQAhAwAAAFMAICoAALwJACArAADXCQAgDQAAAFMAIAQAAOQHACAFAADlBwAgCQAA5wcAIBYAAOgHACAZAADmBwAgIwAA1wkAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAhkgNAAK4FACGzAwEArAUAIQsEAADkBwAgBQAA5QcAIAkAAOcHACAWAADoBwAgGQAA5gcAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAhkgNAAK4FACGzAwEArAUAIRcGAAD0BgAgBwAA9QYAIAgAAPYGACAKAACGBwAgDQAA-gYAIA8AAPcGACAQAAD4BgAg2QIBAAAAAdoCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAH-AoAAAAABkgNAAAAAAZkDAQAAAAGeAwEAAAABnwMBAAAAAaYDAAAArgMCqgMBAAAAAasDAgAAAAGsAwEAAAABrgMBAAAAAa8DAQAAAAECAAAAEgAgKgAA2AkAIBEGAAD7BgAgBwAA_AYAIAkAAP0GACANAAD_BgAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABAgAAAEAAICoAANoJACADAAAAEAAgKgAA2AkAICsAAN4JACAZAAAAEAAgBgAAxgYAIAcAAMcGACAIAADIBgAgCgAAhQcAIA0AAMwGACAPAADJBgAgEAAAygYAICMAAN4JACDZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_gKAAAAAAZIDQACuBQAhmQMBAK0FACGeAwEArQUAIZ8DAQCtBQAhpgMAAMQGrgMiqgMBAKwFACGrAwIAtAUAIawDAQCsBQAhrgMBAK0FACGvAwEArAUAIRcGAADGBgAgBwAAxwYAIAgAAMgGACAKAACFBwAgDQAAzAYAIA8AAMkGACAQAADKBgAg2QIBAKwFACHaAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIf4CgAAAAAGSA0AArgUAIZkDAQCtBQAhngMBAK0FACGfAwEArQUAIaYDAADEBq4DIqoDAQCsBQAhqwMCALQFACGsAwEArAUAIa4DAQCtBQAhrwMBAKwFACEDAAAAFAAgKgAA2gkAICsAAOEJACATAAAAFAAgBgAApAYAIAcAAKUGACAJAACmBgAgDQAAqAYAICMAAOEJACDZAgEArAUAIdoCAQCsBQAh3gIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACERBgAApAYAIAcAAKUGACAJAACmBgAgDQAAqAYAINkCAQCsBQAh2gIBAKwFACHeAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIZIDQACuBQAhoQNAAJoGACGkAwAAogakAyKmAwAAowamAyKnA4AAAAABqAMBAK0FACGpAwEArQUAIREGAAD7BgAgBwAA_AYAIAkAAP0GACAMAAD-BgAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAABkgNAAAAAAaEDQAAAAAGkAwAAAKQDAqYDAAAApgMCpwOAAAAAAagDAQAAAAGpAwEAAAABAgAAAEAAICoAAOIJACAXBgAA9AYAIAcAAPUGACAIAAD2BgAgCgAAhgcAIAwAAPkGACAPAAD3BgAgEAAA-AYAINkCAQAAAAHaAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB_gKAAAAAAZIDQAAAAAGZAwEAAAABngMBAAAAAZ8DAQAAAAGmAwAAAK4DAqoDAQAAAAGrAwIAAAABrAMBAAAAAa4DAQAAAAGvAwEAAAABAgAAABIAICoAAOQJACANBAAA0wcAIAUAANQHACAGAADSBwAgCQAA1QcAIBYAANYHACAXAADXBwAg2QIBAAAAAdoCAQAAAAHeAgEAAAAB3wJAAAAAAfICAQAAAAGSA0AAAAABsQMBAAAAAQIAAAAKACAqAADmCQAgAwAAABQAICoAAOIJACArAADqCQAgEwAAABQAIAYAAKQGACAHAAClBgAgCQAApgYAIAwAAKcGACAjAADqCQAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAhkgNAAK4FACGhA0AAmgYAIaQDAACiBqQDIqYDAACjBqYDIqcDgAAAAAGoAwEArQUAIakDAQCtBQAhEQYAAKQGACAHAAClBgAgCQAApgYAIAwAAKcGACDZAgEArAUAIdoCAQCsBQAh3gIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACGSA0AArgUAIaEDQACaBgAhpAMAAKIGpAMipgMAAKMGpgMipwOAAAAAAagDAQCtBQAhqQMBAK0FACEDAAAAEAAgKgAA5AkAICsAAO0JACAZAAAAEAAgBgAAxgYAIAcAAMcGACAIAADIBgAgCgAAhQcAIAwAAMsGACAPAADJBgAgEAAAygYAICMAAO0JACDZAgEArAUAIdoCAQCsBQAh3wJAAK4FACHxAgEArAUAIfICAQCsBQAh_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_QkAIAsEAACdCAAgBQAAnggAIAkAAKAIACAXAACiCAAgGQAAnwgAINkCAQAAAAHaAgEAAAAB3gIBAAAAAd8CQAAAAAGSA0AAAAABswMBAAAAAQIAAABVACAqAAD_CQAgBdkCAQAAAAHfAkAAAAABjgMAAACOAwKPAwEAAAABkAOAAAAAAQMAAABhACAqAAD7CQAgKwAAhAoAIBMAAABhACAZAACpCAAgGgAAqAgAIBsAAKoIACAcAACrCAAgHQAArAgAICMAAIQKACDZAgEArAUAId8CQACuBQAhjgMAAKYIuQMikgNAAK4FACG0AwEArAUAIbUDAQCsBQAhtgMBAKwFACG3AwEArAUAIbkDIACnCAAhugMgAKcIACG7AwEArQUAIbwDQACaBgAhERkAAKkIACAaAACoCAAgGwAAqggAIBwAAKsIACAdAACsCAAg2QIBAKwFACHfAkAArgUAIY4DAACmCLkDIpIDQACuBQAhtAMBAKwFACG1AwEArAUAIbYDAQCsBQAhtwMBAKwFACG5AyAApwgAIboDIACnCAAhuwMBAK0FACG8A0AAmgYAIQMAAAAIACAqAAD9CQAgKwAAhwoAIA8AAAAIACAEAACTBwAgBQAAlAcAIAYAAJIHACAJAACVBwAgFwAAlwcAIBgAAJgHACAjAACHCgAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhsQMBAK0FACENBAAAkwcAIAUAAJQHACAGAACSBwAgCQAAlQcAIBcAAJcHACAYAACYBwAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACHyAgEArAUAIZIDQACuBQAhsQMBAK0FACEDAAAAUwAgKgAA_wkAICsAAIoKACANAAAAUwAgBAAA5AcAIAUAAOUHACAJAADnBwAgFwAA6QcAIBkAAOYHACAjAACKCgAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACGSA0AArgUAIbMDAQCsBQAhCwQAAOQHACAFAADlBwAgCQAA5wcAIBcAAOkHACAZAADmBwAg2QIBAKwFACHaAgEArAUAId4CAQCsBQAh3wJAAK4FACGSA0AArgUAIbMDAQCsBQAhCwMAAPsFACAGAAD5BQAgBwAA-gUAIBQAAPwFACDZAgEAAAAB3wJAAAAAAfECAQAAAAHyAgEAAAAB8wIBAAAAAZIDQAAAAAGTAwEAAAABAgAAADEAICoAAIsKACADAAAALwAgKgAAiwoAICsAAI8KACANAAAALwAgAwAA5QUAIAYAAOMFACAHAADkBQAgFAAA5gUAICMAAI8KACDZAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIfMCAQCsBQAhkgNAAK4FACGTAwEArQUAIQsDAADlBQAgBgAA4wUAIAcAAOQFACAUAADmBQAg2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACHzAgEArAUAIZIDQACuBQAhkwMBAK0FACELAwAA-wUAIAYAAPkFACAHAAD6BQAgFQAA_QUAINkCAQAAAAHfAkAAAAAB8QIBAAAAAfICAQAAAAHzAgEAAAABkgNAAAAAAZMDAQAAAAECAAAAMQAgKgAAkAoAIAjZAgEAAAAB3wJAAAAAAfECAQAAAAHzAgEAAAABhwMBAAAAAYkDAAAAiQMCigMBAAAAAYsDgAAAAAEDAAAALwAgKgAAkAoAICsAAJUKACANAAAALwAgAwAA5QUAIAYAAOMFACAHAADkBQAgFQAA5wUAICMAAJUKACDZAgEArAUAId8CQACuBQAh8QIBAKwFACHyAgEArAUAIfMCAQCsBQAhkgNAAK4FACGTAwEArQUAIQsDAADlBQAgBgAA4wUAIAcAAOQFACAVAADnBQAg2QIBAKwFACHfAkAArgUAIfECAQCsBQAh8gIBAKwFACHzAgEArAUAIZIDQACuBQAhkwMBAK0FACEHEQAA1gUAINkCAQAAAAHfAkAAAAABhwMBAAAAAY4DAAAAjgMCjwMBAAAAAZADgAAAAAECAAAANQAgKgAAlgoAIAMAAAAzACAqAACWCgAgKwAAmgoAIAkAAAAzACARAADIBQAgIwAAmgoAINkCAQCsBQAh3wJAAK4FACGHAwEArAUAIY4DAADHBY4DIo8DAQCsBQAhkAOAAAAAAQcRAADIBQAg2QIBAKwFACHfAkAArgUAIYcDAQCsBQAhjgMAAMcFjgMijwMBAKwFACGQA4AAAAABBw4AFhZZDhlSBRoGAhtWAxxXBB1YBgIDAAEGAAMHBAABBQcCCUoGDgAVFksOF0wHGQsECAQAAQUPBQYAAwkTBg4AFBYyDhdBBxhECQIDAAEHAAQJBgADBwAECAABChUHDCoIDSsJDgANDyULECkMBgYAAwcABAkWBgwaCA0dCQ4ACgIKAAcLGwYDBwAECh8HCx4GAgkgAAwhAAELAAYBCwAGAwwuAA8sABAtAAYDAAEGAAMHAAQOABMUNg8VPRIDDgAREQAOEzoQARIADwETOwABEQAOARQ-AAUFRQAJRgAWRwAXSAAYSQAFBU0ACU8AFlAAF1EAGU4ABhZfABlbABpaABtcABxdAB1eAAAAAAMOABswABwxAB0AAAADDgAbMAAcMQAdAQQAAQEEAAEDDgAiMAAjMQAkAAAAAw4AIjAAIzEAJAIDAAEGAAMCAwABBgADAw4AKTAAKjEAKwAAAAMOACkwACoxACsCBAABBgADAgQAAQYAAwMOADAwADExADIAAAADDgAwMAAxMQAyAgMAAQcABAIDAAEHAAQDDgA3MAA4MQA5AAAAAw4ANzAAODEAOQQGAAMHAAQIAAEK2QEHBAYAAwcABAgAAQrfAQcFDgA-MABBMQBCggEAP4MBAEAAAAAAAAUOAD4wAEExAEKCAQA_gwEAQAIGAAMHAAQCBgADBwAEAw4ARzAASDEASQAAAAMOAEcwAEgxAEkCCgAHC4cCBgIKAAcLjQIGAw4ATjAATzEAUAAAAAMOAE4wAE8xAFADBwAECqACBwufAgYDBwAECqcCBwumAgYDDgBVMABWMQBXAAAAAw4AVTAAVjEAVwELAAYBCwAGBQ4AXDAAXzEAYIIBAF2DAQBeAAAAAAAFDgBcMABfMQBgggEAXYMBAF4BCwAGAQsABgUOAGUwAGgxAGmCAQBmgwEAZwAAAAAABQ4AZTAAaDEAaYIBAGaDAQBnAwMAAQYAAwcABAMDAAEGAAMHAAQDDgBuMABvMQBwAAAAAw4AbjAAbzEAcAERAA4BEQAOBQ4AdTAAeDEAeYIBAHaDAQB3AAAAAAAFDgB1MAB4MQB5ggEAdoMBAHcBEQAOAREADgMOAH4wAH8xAIABAAAAAw4AfjAAfzEAgAEBEgAPARIADwMOAIUBMACGATEAhwEAAAADDgCFATAAhgExAIcBAAAABQ4AjQEwAJABMQCRAYIBAI4BgwEAjwEAAAAAAAUOAI0BMACQATEAkQGCAQCOAYMBAI8BAAAAAw4AlwEwAJgBMQCZAQAAAAMOAJcBMACYATEAmQEAAAAFDgCfATAAogExAKMBggEAoAGDAQChAQAAAAAABQ4AnwEwAKIBMQCjAYIBAKABgwEAoQEAAAADDgCpATAAqgExAKsBAAAAAw4AqQEwAKoBMQCrAR4CAR9gASBjASFkASJlASRnASVpFyZqGCdsAShuFylvGSxwAS1xAS5yFzJ1GjN2HjR3AzV4AzZ5Azd6Azh7Azl9Azp_FzuAAR88ggEDPYQBFz6FASA_hgEDQIcBA0GIARdCiwEhQ4wBJUSNAQJFjgECRo8BAkeQAQJIkQECSZMBAkqVARdLlgEmTJgBAk2aARdOmwEnT5wBAlCdAQJRngEXUqEBKFOiASxUowEEVaQBBFalAQRXpgEEWKcBBFmpAQRaqwEXW6wBLVyuAQRdsAEXXrEBLl-yAQRgswEEYbQBF2K3AS9juAEzZLkBBWW6AQVmuwEFZ7wBBWi9AQVpvwEFasEBF2vCATRsxAEFbcYBF27HATVvyAEFcMkBBXHKARdyzQE2c84BOnTPAQZ10AEGdtEBBnfSAQZ40wEGedUBBnrXARd72AE7fNsBBn3dARd-3gE8f-ABBoAB4QEGgQHiAReEAeUBPYUB5gFDhgHnAQeHAegBB4gB6QEHiQHqAQeKAesBB4sB7QEHjAHvAReNAfABRI4B8gEHjwH0AReQAfUBRZEB9gEHkgH3AQeTAfgBF5QB-wFGlQH8AUqWAf0BCJcB_gEImAH_AQiZAYACCJoBgQIImwGDAgicAYUCF50BhgJLngGJAgifAYsCF6ABjAJMoQGOAgiiAY8CCKMBkAIXpAGTAk2lAZQCUaYBlQIJpwGWAgmoAZcCCakBmAIJqgGZAgmrAZsCCawBnQIXrQGeAlKuAaICCa8BpAIXsAGlAlOxAagCCbIBqQIJswGqAhe0Aa0CVLUBrgJYtgGvAgu3AbACC7gBsQILuQGyAgu6AbMCC7sBtQILvAG3Ahe9AbgCWb4BugILvwG8AhfAAb0CWsEBvgILwgG_AgvDAcACF8QBwwJbxQHEAmHGAcUCDMcBxgIMyAHHAgzJAcgCDMoByQIMywHLAgzMAc0CF80BzgJizgHQAgzPAdICF9AB0wJj0QHUAgzSAdUCDNMB1gIX1AHZAmTVAdoCatYB2wIO1wHcAg7YAd0CDtkB3gIO2gHfAg7bAeECDtwB4wIX3QHkAmveAeYCDt8B6AIX4AHpAmzhAeoCDuIB6wIO4wHsAhfkAe8CbeUB8AJx5gHyAhLnAfMCEugB9QIS6QH2AhLqAfcCEusB-QIS7AH7AhftAfwCcu4B_gIS7wGAAxfwAYEDc_EBggMS8gGDAxLzAYQDF_QBhwN09QGIA3r2AYkDD_cBigMP-AGLAw_5AYwDD_oBjQMP-wGPAw_8AZEDF_0BkgN7_gGUAw__AZYDF4AClwN8gQKYAw-CApkDD4MCmgMXhAKdA32FAp4DgQGGAp8DEIcCoAMQiAKhAxCJAqIDEIoCowMQiwKlAxCMAqcDF40CqAOCAY4CqgMQjwKsAxeQAq0DgwGRAq4DEJICrwMQkwKwAxeUArMDhAGVArQDiAGWArYDiQGXArcDiQGYAroDiQGZArsDiQGaArwDiQGbAr4DiQGcAsADF50CwQOKAZ4CwwOJAZ8CxQMXoALGA4sBoQLHA4kBogLIA4kBowLJAxekAswDjAGlAs0DkgGmAs8DkwGnAtADkwGoAtMDkwGpAtQDkwGqAtUDkwGrAtcDkwGsAtkDF60C2gOUAa4C3AOTAa8C3gMXsALfA5UBsQLgA5MBsgLhA5MBswLiAxe0AuUDlgG1AuYDmgG2AugDmwG3AukDmwG4AuwDmwG5Au0DmwG6Au4DmwG7AvADmwG8AvIDF70C8wOcAb4C9QObAb8C9wMXwAL4A50BwQL5A5sBwgL6A5sBwwL7AxfEAv4DngHFAv8DpAHGAoEEpQHHAoIEpQHIAoUEpQHJAoYEpQHKAocEpQHLAokEpQHMAosEF80CjASmAc4CjgSlAc8CkAQX0AKRBKcB0QKSBKUB0gKTBKUB0wKUBBfUApcEqAHVApgErAE"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("node:buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.js"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// src/domain/generated/prisma/internal/prismaNamespace.ts
import * as runtime2 from "@prisma/client/runtime/client";
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var defineExtension = runtime2.Extensions.defineExtension;

// src/domain/generated/prisma/enums.ts
var OrganizationRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER"
};
var WorkspaceRole = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER"
};
var ConnectorType = {
  GOOGLE_DRIVE: "GOOGLE_DRIVE",
  GITHUB: "GITHUB",
  NOTION: "NOTION",
  CONFLUENCE: "CONFLUENCE",
  JIRA: "JIRA",
  SLACK: "SLACK",
  SHAREPOINT: "SHAREPOINT",
  POSTGRESQL: "POSTGRESQL"
};

// src/domain/generated/prisma/client.ts
var PrismaClient = getPrismaClientClass();

// src/domain/modules/connectors/connector-credentials.util.ts
function useConnectorDemo(config2) {
  return config2.mode === "demo" || config2.useStub === true;
}
function str(config2, key) {
  const v = config2[key];
  return typeof v === "string" && v.trim() ? v.trim() : void 0;
}
function hasLiveConnectorConfig(type, config2) {
  if (useConnectorDemo(config2)) {
    return false;
  }
  switch (type) {
    case "GITHUB":
      return Boolean(str(config2, "token") && str(config2, "owner") && str(config2, "repo"));
    case "POSTGRESQL":
      return Boolean(str(config2, "connectionString") && str(config2, "sql"));
    case "NOTION":
      return Boolean(str(config2, "token") && str(config2, "databaseId"));
    case "SLACK":
      return Boolean(str(config2, "token") && str(config2, "channelId"));
    case "JIRA":
      return Boolean(
        str(config2, "baseUrl") && str(config2, "email") && str(config2, "apiToken")
      );
    case "CONFLUENCE":
      return Boolean(
        str(config2, "baseUrl") && str(config2, "email") && str(config2, "apiToken")
      );
    case "GOOGLE_DRIVE":
      return Boolean(str(config2, "accessToken") && str(config2, "folderId"));
    case "SHAREPOINT":
      return Boolean(
        str(config2, "accessToken") && str(config2, "siteId") && str(config2, "driveId")
      );
    default:
      return false;
  }
}

// src/domain/modules/connectors/drivers/live-connector.drivers.ts
import { Pool } from "pg";
function cfgStr(config2, key) {
  const v = config2[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Connector config missing "${key}"`);
  }
  return v.trim();
}
function decodeBase64Content(encoded) {
  return Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8");
}
async function httpJson(url, init = {}) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}
var LiveConnectorBase = class {
  logger = new Logger(this.constructor.name);
  canSync(ctx) {
    return hasLiveConnectorConfig(this.type, ctx.config);
  }
  async connect(ctx) {
    this.logger.log(`connect ${this.type} connector=${ctx.connectorId}`);
  }
  async disconnect(ctx) {
    this.logger.log(`disconnect ${this.type} connector=${ctx.connectorId}`);
  }
  async testConnection(ctx) {
    if (!this.canSync(ctx)) {
      return false;
    }
    try {
      const result = await this.sync(ctx);
      return result.items.length >= 0;
    } catch {
      return false;
    }
  }
};
var GithubConnectorDriver = class extends LiveConnectorBase {
  type = "GITHUB";
  async sync(ctx) {
    const token = cfgStr(ctx.config, "token");
    const owner = cfgStr(ctx.config, "owner");
    const repo = cfgStr(ctx.config, "repo");
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const items = [];
    const readme = await httpJson(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    );
    if (readme.content) {
      const text = decodeBase64Content(readme.content);
      items.push({
        externalId: `github-${owner}-${repo}-readme`,
        name: "README.md",
        content: text,
        mimeType: "text/markdown",
        externalUpdatedAt: /* @__PURE__ */ new Date(),
        metadata: { source: "github", sha: readme.sha }
      });
    }
    const tree = await httpJson(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      { headers }
    );
    for (const entry of tree.filter((e) => e.type === "file")) {
      if (!/\.(md|txt)$/i.test(entry.name)) {
        continue;
      }
      const file = await httpJson(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(entry.path)}`,
        { headers }
      );
      if (!file.content) continue;
      items.push({
        externalId: `github-${entry.sha}`,
        name: entry.name,
        content: decodeBase64Content(file.content),
        mimeType: entry.name.endsWith(".md") ? "text/markdown" : "text/plain",
        externalUpdatedAt: /* @__PURE__ */ new Date(),
        metadata: { path: entry.path, sha: entry.sha }
      });
    }
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var PostgresqlConnectorDriver = class extends LiveConnectorBase {
  type = "POSTGRESQL";
  async sync(ctx) {
    const connectionString = cfgStr(ctx.config, "connectionString");
    const sql = cfgStr(ctx.config, "sql");
    const pool = new Pool({ connectionString, max: 2 });
    try {
      const result = await pool.query(sql);
      const idCol = typeof ctx.config.idColumn === "string" && ctx.config.idColumn || "id";
      const nameCol = typeof ctx.config.nameColumn === "string" && ctx.config.nameColumn || "name";
      const contentCol = typeof ctx.config.contentColumn === "string" && ctx.config.contentColumn || "content";
      const items = result.rows.map((row, i) => {
        const id = String(row[idCol] ?? `row-${i}`);
        const name = String(row[nameCol] ?? `record-${id}`);
        const content = String(row[contentCol] ?? JSON.stringify(row));
        return {
          externalId: `pg-${id}`,
          name: `${name}.txt`,
          content,
          mimeType: "text/plain",
          externalUpdatedAt: /* @__PURE__ */ new Date(),
          metadata: { tableRow: id }
        };
      });
      return {
        items,
        deletedExternalIds: [],
        nextCursor: (/* @__PURE__ */ new Date()).toISOString()
      };
    } finally {
      await pool.end();
    }
  }
};
var NotionConnectorDriver = class extends LiveConnectorBase {
  type = "NOTION";
  async sync(ctx) {
    const token = cfgStr(ctx.config, "token");
    const databaseId = cfgStr(ctx.config, "databaseId");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };
    const data = await httpJson(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      { method: "POST", headers, body: JSON.stringify({ page_size: 50 }) }
    );
    const items = [];
    for (const page of data.results ?? []) {
      const text = JSON.stringify(page.properties, null, 2);
      items.push({
        externalId: `notion-${page.id}`,
        name: `notion-page-${page.id}.json`,
        content: text,
        mimeType: "application/json",
        externalUpdatedAt: new Date(page.last_edited_time),
        metadata: { notionPageId: page.id }
      });
    }
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var SlackConnectorDriver = class extends LiveConnectorBase {
  type = "SLACK";
  async sync(ctx) {
    const token = cfgStr(ctx.config, "token");
    const channelId = cfgStr(ctx.config, "channelId");
    const params = new URLSearchParams({
      channel: channelId,
      limit: "100"
    });
    if (ctx.syncCursor) {
      params.set("oldest", ctx.syncCursor);
    }
    const data = await httpJson(`https://slack.com/api/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const items = (data.messages ?? []).filter((m) => m.text).map((m) => ({
      externalId: `slack-${channelId}-${m.ts}`,
      name: `slack-${m.ts}.txt`,
      content: m.text ?? "",
      mimeType: "text/plain",
      externalUpdatedAt: new Date(Number(m.ts) * 1e3),
      metadata: { user: m.user, ts: m.ts }
    }));
    const newest = data.messages?.[0]?.ts ?? ctx.syncCursor;
    return {
      items,
      deletedExternalIds: [],
      nextCursor: newest
    };
  }
};
var JiraConnectorDriver = class extends LiveConnectorBase {
  type = "JIRA";
  async sync(ctx) {
    const baseUrl = cfgStr(ctx.config, "baseUrl").replace(/\/$/, "");
    const email = cfgStr(ctx.config, "email");
    const apiToken = cfgStr(ctx.config, "apiToken");
    const jql = typeof ctx.config.jql === "string" && ctx.config.jql || "order by updated DESC";
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const data = await httpJson(
      `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
    );
    const items = (data.issues ?? []).map((issue) => {
      const desc = typeof issue.fields.description === "string" ? issue.fields.description : JSON.stringify(issue.fields.description ?? {});
      const content = `${issue.fields.summary ?? issue.key}

${desc}`;
      return {
        externalId: `jira-${issue.key}`,
        name: `${issue.key}.txt`,
        content,
        mimeType: "text/plain",
        externalUpdatedAt: issue.fields.updated ? new Date(issue.fields.updated) : /* @__PURE__ */ new Date(),
        metadata: { jiraKey: issue.key }
      };
    });
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var ConfluenceConnectorDriver = class extends LiveConnectorBase {
  type = "CONFLUENCE";
  async sync(ctx) {
    const baseUrl = cfgStr(ctx.config, "baseUrl").replace(/\/$/, "");
    const email = cfgStr(ctx.config, "email");
    const apiToken = cfgStr(ctx.config, "apiToken");
    const cql = typeof ctx.config.cql === "string" && ctx.config.cql || "type=page order by lastModified desc";
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const data = await httpJson(
      `${baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
    );
    const items = [];
    for (const row of data.results ?? []) {
      const pageId = row.content.id;
      const page = await httpJson(`${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage`, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }
      });
      const html = page.body?.storage?.value ?? row.excerpt ?? "";
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      items.push({
        externalId: `confluence-${pageId}`,
        name: `${page.title ?? pageId}.txt`,
        content: text,
        mimeType: "text/plain",
        externalUpdatedAt: /* @__PURE__ */ new Date(),
        metadata: { confluencePageId: pageId }
      });
    }
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var GoogleDriveConnectorDriver = class extends LiveConnectorBase {
  type = "GOOGLE_DRIVE";
  async sync(ctx) {
    const accessToken = cfgStr(ctx.config, "accessToken");
    const folderId = cfgStr(ctx.config, "folderId");
    const q = `'${folderId}' in parents and trashed=false`;
    const list = await httpJson(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const items = [];
    for (const file of list.files ?? []) {
      if (!file.mimeType.startsWith("text/") && !/\.(md|txt)$/i.test(file.name)) {
        continue;
      }
      const exported = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const content = exported.ok ? await exported.text() : await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then((r) => r.text());
      items.push({
        externalId: `gdrive-${file.id}`,
        name: file.name,
        content,
        mimeType: file.mimeType,
        externalUpdatedAt: file.modifiedTime ? new Date(file.modifiedTime) : /* @__PURE__ */ new Date(),
        metadata: { driveFileId: file.id }
      });
    }
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var SharepointConnectorDriver = class extends LiveConnectorBase {
  type = "SHAREPOINT";
  async sync(ctx) {
    const accessToken = cfgStr(ctx.config, "accessToken");
    const siteId = cfgStr(ctx.config, "siteId");
    const driveId = cfgStr(ctx.config, "driveId");
    const folderPath = typeof ctx.config.folderPath === "string" && ctx.config.folderPath || "root";
    const list = await httpJson(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${folderPath}:/children`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const items = [];
    for (const entry of list.value ?? []) {
      if (!entry.file) continue;
      const content = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${entry.id}/content`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then((r) => r.text());
      items.push({
        externalId: `sharepoint-${entry.id}`,
        name: entry.name,
        content,
        mimeType: entry.file.mimeType ?? "text/plain",
        externalUpdatedAt: entry.lastModifiedDateTime ? new Date(entry.lastModifiedDateTime) : /* @__PURE__ */ new Date(),
        metadata: { itemId: entry.id }
      });
    }
    return {
      items,
      deletedExternalIds: [],
      nextCursor: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var LIVE_CONNECTOR_DRIVERS = [
  new GithubConnectorDriver(),
  new PostgresqlConnectorDriver(),
  new NotionConnectorDriver(),
  new SlackConnectorDriver(),
  new JiraConnectorDriver(),
  new ConfluenceConnectorDriver(),
  new GoogleDriveConnectorDriver(),
  new SharepointConnectorDriver()
];

// src/domain/modules/connectors/drivers/stub-connector.driver.ts
import { createHash as createHash3 } from "crypto";
var StubConnectorDriver = class _StubConnectorDriver {
  constructor(type) {
    this.type = type;
  }
  logger = new Logger(_StubConnectorDriver.name);
  async connect(ctx) {
    this.logger.warn(`STUB connect ${this.type} connector=${ctx.connectorId}`);
  }
  async disconnect(ctx) {
    this.logger.warn(
      `STUB disconnect ${this.type} connector=${ctx.connectorId}`
    );
  }
  async testConnection(ctx) {
    this.logger.warn(
      `STUB testConnection ${this.type} connector=${ctx.connectorId}`
    );
    return true;
  }
  async sync(ctx) {
    this.logger.warn(`STUB sync ${this.type} connector=${ctx.connectorId}`);
    const seed = typeof ctx.config.seed === "string" && ctx.config.seed || ctx.connectorId;
    const stamp = ctx.syncCursor || "v1";
    const items = [1, 2, 3].map((n) => {
      const externalId = `${this.type.toLowerCase()}-${seed}-item-${n}`;
      const content = [
        `Stub ${this.type} document #${n}`,
        `Connector: ${ctx.connectorId}`,
        `Workspace: ${ctx.workspaceId}`,
        `Cursor: ${stamp}`,
        `Knowledge sample: item ${n} describes Memora connector sync for ${this.type}.`
      ].join("\n");
      return {
        externalId,
        name: `${this.type}-item-${n}.txt`,
        content,
        mimeType: "text/plain",
        externalUpdatedAt: /* @__PURE__ */ new Date(),
        metadata: {
          stub: true,
          type: this.type,
          hash: createHash3("sha256").update(content).digest("hex")
        }
      };
    });
    return {
      items,
      deletedExternalIds: [],
      nextCursor: `stub-${Date.now()}`
    };
  }
};

// src/domain/modules/connectors/drivers/delegating.connector.ts
var DelegatingConnectorDriver = class _DelegatingConnectorDriver {
  constructor(type) {
    this.type = type;
    this.stub = new StubConnectorDriver(
      type
    );
    this.live = LIVE_CONNECTOR_DRIVERS.find((d) => d.type === type);
  }
  logger = new Logger(_DelegatingConnectorDriver.name);
  stub;
  live;
  pick(ctx) {
    if (hasLiveConnectorConfig(this.type, ctx.config) && this.live) {
      return this.live;
    }
    return this.stub;
  }
  async connect(ctx) {
    const driver = this.pick(ctx);
    if (driver === this.stub) {
      this.logger.debug(`${this.type}: demo/stub connect`);
    }
    return driver.connect(ctx);
  }
  async disconnect(ctx) {
    return this.pick(ctx).disconnect(ctx);
  }
  async testConnection(ctx) {
    return this.pick(ctx).testConnection(ctx);
  }
  async sync(ctx) {
    const driver = this.pick(ctx);
    if (driver === this.stub) {
      this.logger.debug(`${this.type}: demo/stub sync`);
    }
    return driver.sync(ctx);
  }
};

// src/domain/modules/connectors/connector.registry.ts
var ConnectorRegistry = class {
  drivers = /* @__PURE__ */ new Map();
  constructor() {
    for (const type of Object.values(ConnectorType)) {
      this.drivers.set(type, new DelegatingConnectorDriver(type));
    }
  }
  get(type) {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`No connector driver registered for ${type}`);
    }
    return driver;
  }
  listTypes() {
    return [...this.drivers.keys()];
  }
};

// src/domain/modules/connectors/connector-sync.service.ts
import { createHash as createHash4 } from "crypto";
var ConnectorSyncService = class _ConnectorSyncService {
  constructor(prisma, registry, storage, documentQueue) {
    this.prisma = prisma;
    this.registry = registry;
    this.storage = storage;
    this.documentQueue = documentQueue;
  }
  logger = new Logger(_ConnectorSyncService.name);
  async syncConnector(connectorId) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId }
    });
    if (!connector) {
      this.logger.warn(`Connector ${connectorId} not found`);
      return { created: 0, updated: 0, skipped: 0, deleted: 0 };
    }
    await this.prisma.connector.update({
      where: { id: connectorId },
      data: { status: "SYNCING", lastError: null }
    });
    const stats = { created: 0, updated: 0, skipped: 0, deleted: 0 };
    try {
      const driver = this.registry.get(connector.type);
      const ctx = {
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        organizationId: connector.organizationId,
        config: connector.config || {},
        syncCursor: connector.syncCursor
      };
      const result = await driver.sync(ctx);
      for (const item of result.items) {
        const contentHash = createHash4("sha256").update(item.content).digest("hex");
        const existing = await this.prisma.connectorSyncItem.findUnique({
          where: {
            connectorId_externalId: {
              connectorId,
              externalId: item.externalId
            }
          }
        });
        if (existing?.contentHash === contentHash && existing.documentId) {
          await this.prisma.connectorSyncItem.update({
            where: { id: existing.id },
            data: {
              lastSyncedAt: /* @__PURE__ */ new Date(),
              externalUpdatedAt: item.externalUpdatedAt,
              deletedAt: null
            }
          });
          stats.skipped += 1;
          continue;
        }
        const buffer = Buffer.from(item.content, "utf8");
        const stored = await this.storage.save(
          connector.workspaceId,
          item.name,
          buffer
        );
        let documentId = existing?.documentId ?? null;
        if (documentId) {
          await this.prisma.document.update({
            where: { id: documentId },
            data: {
              name: item.name,
              mimeType: item.mimeType || "text/plain",
              sizeBytes: buffer.length,
              storageKey: stored.key,
              status: "PENDING",
              contentHash,
              externalId: item.externalId,
              connectorId,
              metadata: {
                connectorType: connector.type,
                ...item.metadata || {}
              },
              errorMessage: null
            }
          });
          stats.updated += 1;
        } else {
          const doc = await this.prisma.document.create({
            data: {
              name: item.name,
              mimeType: item.mimeType || "text/plain",
              sizeBytes: buffer.length,
              storageKey: stored.key,
              status: "PENDING",
              organizationId: connector.organizationId,
              workspaceId: connector.workspaceId,
              uploadedById: connector.createdById,
              connectorId,
              externalId: item.externalId,
              contentHash,
              metadata: {
                connectorType: connector.type,
                ...item.metadata || {}
              }
            }
          });
          documentId = doc.id;
          stats.created += 1;
        }
        await this.prisma.connectorSyncItem.upsert({
          where: {
            connectorId_externalId: {
              connectorId,
              externalId: item.externalId
            }
          },
          create: {
            connectorId,
            documentId,
            externalId: item.externalId,
            externalUpdatedAt: item.externalUpdatedAt,
            contentHash,
            lastSyncedAt: /* @__PURE__ */ new Date(),
            metadata: item.metadata || {}
          },
          update: {
            documentId,
            externalUpdatedAt: item.externalUpdatedAt,
            contentHash,
            lastSyncedAt: /* @__PURE__ */ new Date(),
            deletedAt: null,
            metadata: item.metadata || {}
          }
        });
        await this.documentQueue.add(
          "process",
          { documentId },
          {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: { type: "exponential", delay: 2e3 }
          }
        );
      }
      for (const externalId of result.deletedExternalIds) {
        const existing = await this.prisma.connectorSyncItem.findUnique({
          where: {
            connectorId_externalId: { connectorId, externalId }
          }
        });
        if (!existing) continue;
        if (existing.documentId) {
          await this.prisma.document.delete({
            where: { id: existing.documentId }
          });
        }
        await this.prisma.connectorSyncItem.update({
          where: { id: existing.id },
          data: {
            deletedAt: /* @__PURE__ */ new Date(),
            documentId: null,
            lastSyncedAt: /* @__PURE__ */ new Date()
          }
        });
        stats.deleted += 1;
      }
      await this.prisma.connector.update({
        where: { id: connectorId },
        data: {
          status: "CONNECTED",
          lastSyncedAt: /* @__PURE__ */ new Date(),
          syncCursor: result.nextCursor,
          lastError: null
        }
      });
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connector sync failed";
      await this.prisma.connector.update({
        where: { id: connectorId },
        data: { status: "ERROR", lastError: message }
      });
      throw error;
    }
  }
};

// src/domain/modules/connectors/connectors.service.ts
var ConnectorsService = class {
  constructor(prisma, membership, registry, syncQueue) {
    this.prisma = prisma;
    this.membership = membership;
    this.registry = registry;
    this.syncQueue = syncQueue;
  }
  listTypes() {
    return this.registry.listTypes();
  }
  async create(userId, workspaceId, dto) {
    const membership = await this.membership.assertWorkspaceRole(
      userId,
      workspaceId,
      ["ADMIN" /* ADMIN */]
    );
    if (!this.registry.listTypes().includes(dto.type)) {
      throw new BadRequestException(`Unsupported connector type: ${dto.type}`);
    }
    const type = dto.type;
    const connector = await this.prisma.connector.create({
      data: {
        name: dto.name,
        type,
        config: dto.config || {},
        status: "DISCONNECTED",
        organizationId: membership.workspace.organizationId,
        workspaceId,
        createdById: userId
      }
    });
    const driver = this.registry.get(type);
    await driver.connect({
      connectorId: connector.id,
      workspaceId,
      organizationId: membership.workspace.organizationId,
      config: dto.config || {},
      syncCursor: null
    });
    return this.prisma.connector.update({
      where: { id: connector.id },
      data: { status: "CONNECTED" }
    });
  }
  async findAll(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.connector.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { syncItems: true, documents: true } }
      }
    });
  }
  async findOne(userId, connectorId) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: {
        _count: { select: { syncItems: true, documents: true } },
        syncItems: {
          where: { deletedAt: null },
          take: 20,
          orderBy: { updatedAt: "desc" }
        }
      }
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    await this.membership.assertWorkspaceMember(userId, connector.workspaceId);
    return connector;
  }
  async update(userId, connectorId, dto) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      "ADMIN" /* ADMIN */
    ]);
    return this.prisma.connector.update({
      where: { id: connectorId },
      data: {
        name: dto.name,
        config: dto.config !== void 0 ? dto.config : void 0
      }
    });
  }
  async remove(userId, connectorId) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      "ADMIN" /* ADMIN */
    ]);
    const driver = this.registry.get(connector.type);
    await driver.disconnect({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      organizationId: connector.organizationId,
      config: connector.config || {},
      syncCursor: connector.syncCursor
    });
    await this.prisma.connector.delete({ where: { id: connectorId } });
    return { success: true };
  }
  async testConnection(userId, connectorId) {
    const connector = await this.findOne(userId, connectorId);
    const driver = this.registry.get(connector.type);
    const ok = await driver.testConnection({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      organizationId: connector.organizationId,
      config: connector.config || {},
      syncCursor: connector.syncCursor
    });
    return { ok };
  }
  async enqueueSync(userId, connectorId) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      "ADMIN" /* ADMIN */
    ]);
    const job = await this.syncQueue.add(
      "sync",
      { connectorId },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: "exponential", delay: 3e3 }
      }
    );
    return { jobId: job.id, connectorId, status: "queued" };
  }
};

// src/domain/common/constants/app.constants.ts
var APP_CONSTANTS = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },
  PASSWORD: {
    MIN_LENGTH: 8
  },
  JWT: {
    ACCESS_TOKEN_EXPIRES: "15m",
    REFRESH_TOKEN_EXPIRES: "7d"
  }
};

// src/domain/common/utils/pagination.util.ts
function getSkipTake(page = 1, limit = APP_CONSTANTS.PAGINATION.DEFAULT_LIMIT) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(
    Math.max(limit, 1),
    APP_CONSTANTS.PAGINATION.MAX_LIMIT
  );
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit
  };
}
function paginatedResult(items, total, page, limit) {
  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0
    }
  };
}

// src/domain/modules/documents/documents.service.ts
var DocumentsService = class {
  constructor(prisma, membership, storage, documentQueue) {
    this.prisma = prisma;
    this.membership = membership;
    this.storage = storage;
    this.documentQueue = documentQueue;
  }
  async upload(userId, workspaceId, file) {
    const membership = await this.membership.assertWorkspaceMember(
      userId,
      workspaceId
    );
    if (!file) {
      throw new BadRequestException("File is required");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("File too large (max 20MB)");
    }
    if (!ALLOWED_MIME_TYPES.includes(
      file.mimetype
    ) && !file.originalname.match(/\.(pdf|docx|txt|md)$/i)) {
      throw new BadRequestException(
        "Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown"
      );
    }
    const stored = await this.storage.save(
      workspaceId,
      file.originalname,
      file.buffer
    );
    const document = await this.prisma.document.create({
      data: {
        name: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        storageKey: stored.key,
        status: "PENDING",
        organizationId: membership.workspace.organizationId,
        workspaceId,
        uploadedById: userId
      }
    });
    await this.documentQueue.add(
      "process",
      { documentId: document.id },
      { removeOnComplete: 100, removeOnFail: 50, attempts: 3 }
    );
    return document;
  }
  async findAll(userId, workspaceId, page = 1, limit = 20) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    const { skip, take, page: p2, limit: l } = getSkipTake(page, limit);
    const where = { workspaceId };
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.document.count({ where })
    ]);
    return paginatedResult(items, total, p2, l);
  }
  async findOne(userId, documentId) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        _count: { select: { chunks: true } }
      }
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    await this.membership.assertWorkspaceMember(userId, document.workspaceId);
    return document;
  }
  async remove(userId, documentId) {
    const document = await this.findOne(userId, documentId);
    await this.storage.delete(document.storageKey);
    await this.prisma.document.delete({ where: { id: documentId } });
    return { success: true };
  }
  /** Re-run extract / chunk / embed (e.g. after switching from stub to OpenAI). */
  async reprocess(userId, documentId) {
    const document = await this.findOne(userId, documentId);
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: "PENDING", errorMessage: null }
    });
    await this.documentQueue.add(
      "process",
      { documentId: document.id },
      { removeOnComplete: 100, removeOnFail: 50, attempts: 3 }
    );
    return { documentId: document.id, status: "PENDING" };
  }
};

// src/domain/modules/evaluation/evaluation.service.ts
import { readFileSync } from "fs";
import { join as join2 } from "path";
var EvaluationService = class {
  constructor(prisma, retrieval, ai) {
    this.prisma = prisma;
    this.retrieval = retrieval;
    this.ai = ai;
  }
  loadDataset() {
    const path = join2(__dirname, "golden-dataset.json");
    return JSON.parse(readFileSync(path, "utf8"));
  }
  /**
   * Runs retrieval-focused eval against the golden set.
   * Answer relevance / faithfulness use AiClient LLM-as-judge when OpenAI is active.
   */
  async run(input) {
    const dataset = this.loadDataset();
    const topK = input.topK ?? 5;
    const details = [];
    let recallSum = 0;
    let precisionSum = 0;
    let mrrSum = 0;
    let citationSum = 0;
    let relevanceSum = 0;
    let faithfulnessSum = 0;
    let latencySum = 0;
    let evalTokenCost = 0;
    for (const item of dataset) {
      const started = Date.now();
      const hits = await this.retrieval.search(
        input.userId,
        input.workspaceId,
        item.question,
        topK
      );
      const latencyMs = Date.now() - started;
      latencySum += latencyMs;
      const blob = hits.map((h) => h.content + " " + h.documentName).join("\n");
      const relevantFlags = hits.map(
        (h) => item.expectedSourceHints.some(
          (hint) => (h.content + h.documentName).toLowerCase().includes(hint.toLowerCase())
        )
      );
      const relevantCount = relevantFlags.filter(Boolean).length;
      const recall = relevantCount > 0 ? 1 : 0;
      const precision = hits.length ? relevantCount / hits.length : 0;
      const firstRelevant = relevantFlags.findIndex(Boolean);
      const mrr = firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0;
      const citationAccuracy = item.expectedSourceHints.every(
        (hint) => blob.toLowerCase().includes(hint.toLowerCase())
      ) ? 1 : relevantCount / Math.max(item.expectedSourceHints.length, 1);
      const judge = await this.ai.judgeRetrievalContext({
        question: item.question,
        retrievedContext: blob,
        expectedAnswerHints: item.expectedAnswerHints
      });
      const answerRelevance = judge.answerRelevance;
      const faithfulness = judge.faithfulness;
      evalTokenCost += (blob.length + item.question.length) / 4 * 15e-8;
      recallSum += recall;
      precisionSum += precision;
      mrrSum += mrr;
      citationSum += citationAccuracy;
      relevanceSum += answerRelevance;
      faithfulnessSum += faithfulness;
      details.push({
        id: item.id,
        question: item.question,
        latencyMs,
        recall,
        precision,
        mrr,
        citationAccuracy,
        answerRelevance,
        faithfulness,
        hitCount: hits.length
      });
    }
    const n = dataset.length || 1;
    const metrics = {
      recallAtK: recallSum / n,
      precisionAtK: precisionSum / n,
      mrr: mrrSum / n,
      citationAccuracy: citationSum / n,
      answerRelevance: relevanceSum / n,
      faithfulness: faithfulnessSum / n,
      averageLatencyMs: latencySum / n,
      tokenCost: evalTokenCost,
      topK,
      cases: n
    };
    const run = await this.prisma.evaluationRun.create({
      data: {
        name: `golden-${(/* @__PURE__ */ new Date()).toISOString()}`,
        datasetVersion: "v1",
        metrics,
        details,
        createdById: input.createdById
      }
    });
    return { runId: run.id, metrics, details };
  }
  listRuns() {
    return this.prisma.evaluationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }
};

// src/domain/modules/feedback/feedback.service.ts
var FeedbackService = class {
  constructor(prisma, membership) {
    this.prisma = prisma;
    this.membership = membership;
  }
  async create(userId, messageId, dto) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });
    if (!message || message.role !== "ASSISTANT") {
      throw new NotFoundException("Assistant message not found");
    }
    await this.membership.assertWorkspaceMember(
      userId,
      message.conversation.workspaceId
    );
    try {
      return await this.prisma.messageFeedback.create({
        data: {
          rating: dto.rating,
          comment: dto.comment,
          retrievedChunks: message.citations ?? void 0,
          userId,
          workspaceId: message.conversation.workspaceId,
          conversationId: message.conversationId,
          messageId
        }
      });
    } catch {
      throw new ConflictException("Feedback already submitted for this message");
    }
  }
  async listForWorkspace(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.messageFeedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }
};

// src/domain/modules/health/health.service.ts
var HealthService = class {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }
  live() {
    return {
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async check() {
    return this.ready();
  }
  async ready() {
    const checks = {
      database: "down",
      redis: "down"
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = "up";
    } catch {
      checks.database = "down";
    }
    try {
      const pong = await this.redis.ping();
      checks.redis = pong === "PONG" ? "up" : "down";
    } catch {
      checks.redis = "down";
    }
    const healthy = checks.database === "up" && checks.redis === "up";
    if (!healthy) {
      throw new ServiceUnavailableException({
        status: "degraded",
        checks,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return {
      status: "ready",
      checks,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};

// src/domain/common/utils/slug.util.ts
function generateSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// src/domain/modules/organizations/organizations.service.ts
var OrganizationsService = class {
  constructor(prisma, membership) {
    this.prisma = prisma;
    this.membership = membership;
  }
  async create(userId, dto) {
    const baseSlug = generateSlug(dto.name);
    const slug = await this.uniqueSlug(baseSlug);
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          createdById: userId
        }
      });
      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId,
          role: OrganizationRole.OWNER
        }
      });
      return organization;
    });
  }
  async findAllForUser(userId, page = 1, limit = 20) {
    const { skip, take, page: p2, limit: l } = getSkipTake(page, limit);
    const where = { members: { some: { userId } } };
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.organization.count({ where })
    ]);
    return paginatedResult(items, total, p2, l);
  }
  async findOne(userId, organizationId) {
    await this.membership.assertOrgMember(userId, organizationId);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId }
    });
    if (!organization) {
      throw new NotFoundException("Organization not found");
    }
    return organization;
  }
  async update(userId, organizationId, dto) {
    await this.membership.assertOrgRole(userId, organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN
    ]);
    const data = {};
    if (dto.name) {
      data.name = dto.name;
      data.slug = await this.uniqueSlug(generateSlug(dto.name), organizationId);
    }
    return this.prisma.organization.update({
      where: { id: organizationId },
      data
    });
  }
  async remove(userId, organizationId) {
    await this.membership.assertOrgRole(userId, organizationId, [
      OrganizationRole.OWNER
    ]);
    await this.prisma.organization.delete({ where: { id: organizationId } });
    return { success: true };
  }
  async listMembers(userId, organizationId) {
    await this.membership.assertOrgMember(userId, organizationId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }
  async addMember(actorId, organizationId, dto) {
    await this.membership.assertOrgRole(actorId, organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN
    ]);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const existing = await this.membership.getOrgMembership(
      user.id,
      organizationId
    );
    if (existing) {
      throw new ConflictException("User is already a member");
    }
    return this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: dto.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }
  async updateMember(actorId, organizationId, targetUserId, dto) {
    const actor = await this.membership.assertOrgRole(
      actorId,
      organizationId,
      [OrganizationRole.OWNER, OrganizationRole.ADMIN]
    );
    const target = await this.membership.getOrgMembership(
      targetUserId,
      organizationId
    );
    if (!target) {
      throw new NotFoundException("Member not found");
    }
    if (target.role === OrganizationRole.OWNER && actor.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException("Only owner can change owner role");
    }
    if (dto.role === OrganizationRole.OWNER && actor.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException("Only owner can transfer ownership");
    }
    if (target.role === OrganizationRole.OWNER && dto.role !== OrganizationRole.OWNER) {
      const owners = await this.prisma.organizationMember.count({
        where: { organizationId, role: OrganizationRole.OWNER }
      });
      if (owners <= 1) {
        throw new BadRequestException("Organization must keep at least one owner");
      }
    }
    return this.prisma.organizationMember.update({
      where: { id: target.id },
      data: { role: dto.role }
    });
  }
  async removeMember(actorId, organizationId, targetUserId) {
    const actor = await this.membership.assertOrgRole(
      actorId,
      organizationId,
      [OrganizationRole.OWNER, OrganizationRole.ADMIN]
    );
    const target = await this.membership.getOrgMembership(
      targetUserId,
      organizationId
    );
    if (!target) {
      throw new NotFoundException("Member not found");
    }
    if (target.role === OrganizationRole.OWNER) {
      if (actor.role !== OrganizationRole.OWNER) {
        throw new ForbiddenException("Only owner can remove an owner");
      }
      const owners = await this.prisma.organizationMember.count({
        where: { organizationId, role: OrganizationRole.OWNER }
      });
      if (owners <= 1) {
        throw new BadRequestException("Organization must keep at least one owner");
      }
    }
    await this.prisma.organizationMember.delete({ where: { id: target.id } });
    return { success: true };
  }
  async uniqueSlug(base, excludeId) {
    let slug = base || "org";
    let i = 0;
    while (true) {
      const candidate = i === 0 ? slug : `${slug}-${i}`;
      const existing = await this.prisma.organization.findUnique({
        where: { slug: candidate }
      });
      if (!existing || existing.id === excludeId) {
        return candidate;
      }
      i += 1;
    }
  }
};

// src/domain/modules/queues/document-processing.service.ts
import { createHash as createHash5 } from "crypto";
var DocumentProcessingService = class _DocumentProcessingService {
  constructor(prisma, storage, ai, summaryQueue) {
    this.prisma = prisma;
    this.storage = storage;
    this.ai = ai;
    this.summaryQueue = summaryQueue;
  }
  logger = new Logger(_DocumentProcessingService.name);
  async processDocument(documentId) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId }
    });
    if (!document) {
      this.logger.warn(`Document ${documentId} not found`);
      return;
    }
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING", errorMessage: null }
    });
    try {
      const buffer = await this.storage.read(document.storageKey);
      const extractedText = await this.ai.extractText({
        buffer,
        mimeType: document.mimeType,
        filename: document.name
      });
      const contentHash = createHash5("sha256").update(extractedText).digest("hex");
      await this.prisma.documentVersion.create({
        data: {
          documentId,
          version: 1,
          contentHash,
          extractedText
        }
      });
      const drafts = await this.ai.chunkText(extractedText);
      const embeddings = await this.ai.embed(drafts.map((d) => d.content));
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });
      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i];
        const embedding = embeddings[i];
        const chunk = await this.prisma.documentChunk.create({
          data: {
            documentId,
            organizationId: document.organizationId,
            workspaceId: document.workspaceId,
            content: draft.content,
            chunkIndex: draft.chunkIndex,
            pageNumber: draft.pageNumber,
            tokenCount: draft.content.split(/\s+/).length,
            metadata: draft.metadata ?? {}
          }
        });
        await this.prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          `[${embedding.join(",")}]`,
          chunk.id
        );
      }
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "READY" }
      });
      await this.summaryQueue.add(
        "document",
        { kind: "DOCUMENT", documentId },
        {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: "exponential", delay: 2e3 }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document processing failed";
      this.logger.error(`Failed processing ${documentId}: ${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED", errorMessage: message }
      });
      throw error;
    }
  }
};

// src/domain/modules/retrieval/retrieval.service.ts
var RetrievalService = class {
  constructor(prisma, membership, ai) {
    this.prisma = prisma;
    this.membership = membership;
    this.ai = ai;
  }
  async search(userId, workspaceId, query, topK = 8) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    const started = Date.now();
    const [queryEmbedding] = await this.ai.embed([query]);
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const vectorHits = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        c.id,
        c."documentId",
        c.content,
        c."pageNumber",
        d.name AS "documentName",
        (1 - (c.embedding <=> $1::vector))::float AS score,
        false AS "isSummary"
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = $2
        AND d.status = 'READY'
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      vectorLiteral,
      workspaceId,
      topK
    );
    const lexicalHits = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        c.id,
        c."documentId",
        c.content,
        c."pageNumber",
        d.name AS "documentName",
        ts_rank(
          to_tsvector('english', c.content),
          plainto_tsquery('english', $1)
        )::float AS score,
        false AS "isSummary"
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = $2
        AND d.status = 'READY'
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
      ORDER BY score DESC
      LIMIT $3
      `,
      query,
      workspaceId,
      topK
    );
    const summaryHits = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        s.id,
        COALESCE(s."documentId", s.id) AS "documentId",
        s.summary AS content,
        NULL::int AS "pageNumber",
        ('[summary:' || s.kind || '] ' || s.title) AS "documentName",
        (1 - (s.embedding <=> $1::vector))::float AS score,
        true AS "isSummary"
      FROM "KnowledgeSummary" s
      WHERE s."workspaceId" = $2
        AND s.embedding IS NOT NULL
      ORDER BY s.embedding <=> $1::vector
      LIMIT $3
      `,
      vectorLiteral,
      workspaceId,
      Math.max(3, Math.floor(topK / 2))
    );
    const fused = this.reciprocalRankFusion(
      [...vectorHits ?? [], ...summaryHits ?? []],
      lexicalHits ?? [],
      topK * 2
    );
    const mapped = fused.map((h) => ({
      chunkId: h.id,
      documentId: h.documentId,
      documentName: h.documentName,
      content: h.content,
      pageNumber: h.pageNumber,
      score: Number(h.score),
      sourceUrl: null,
      metadata: {
        isSummary: Boolean(h.isSummary)
      }
    }));
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true }
    });
    await this.prisma.retrievalQueryLog.create({
      data: {
        workspaceId,
        organizationId: workspace?.organizationId,
        userId,
        query,
        topK,
        resultCount: mapped.length,
        latencyMs: Date.now() - started
      }
    });
    return this.ai.rerank(query, mapped);
  }
  reciprocalRankFusion(vectorHits, lexicalHits, limit) {
    const k = 60;
    const scores = /* @__PURE__ */ new Map();
    const add = (hit, rank) => {
      const current = scores.get(hit.id) ?? { hit, score: 0 };
      current.score += 1 / (k + rank + 1);
      current.hit = { ...hit, score: current.score };
      scores.set(hit.id, current);
    };
    vectorHits.forEach((hit, rank) => add(hit, rank));
    lexicalHits.forEach((hit, rank) => add(hit, rank));
    return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((x) => ({ ...x.hit, score: x.score }));
  }
};

// src/domain/modules/summaries/knowledge-summary.service.ts
import { createHash as createHash6 } from "crypto";
var KnowledgeSummaryService = class _KnowledgeSummaryService {
  constructor(prisma, membership, ai, summaryQueue) {
    this.prisma = prisma;
    this.membership = membership;
    this.ai = ai;
    this.summaryQueue = summaryQueue;
  }
  logger = new Logger(_KnowledgeSummaryService.name);
  async enqueueDocumentForUser(userId, documentId) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId }
    });
    if (!document) throw new NotFoundException("Document not found");
    await this.membership.assertWorkspaceMember(userId, document.workspaceId);
    await this.enqueueDocument(documentId);
    return { status: "queued", kind: "DOCUMENT", documentId };
  }
  async enqueueDocument(documentId) {
    await this.summaryQueue.add(
      "document",
      { kind: "DOCUMENT", documentId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: "exponential", delay: 2e3 }
      }
    );
  }
  async enqueueWorkspace(userId, workspaceId) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      "ADMIN" /* ADMIN */
    ]);
    await this.summaryQueue.add(
      "workspace",
      { kind: "WORKSPACE", workspaceId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: "exponential", delay: 2e3 }
      }
    );
    return { status: "queued", kind: "WORKSPACE", workspaceId };
  }
  async enqueueConnector(userId, connectorId) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId }
    });
    if (!connector) throw new NotFoundException("Connector not found");
    await this.membership.assertWorkspaceRole(
      userId,
      connector.workspaceId,
      ["ADMIN" /* ADMIN */]
    );
    await this.summaryQueue.add(
      "connector",
      { kind: "CONNECTOR", connectorId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: "exponential", delay: 2e3 }
      }
    );
    return { status: "queued", kind: "CONNECTOR", connectorId };
  }
  async listForWorkspace(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.knowledgeSummary.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        kind: true,
        title: true,
        summary: true,
        documentId: true,
        connectorId: true,
        updatedAt: true
      }
    });
  }
  async processJob(data) {
    if (data.kind === "DOCUMENT") {
      await this.summarizeDocument(data.documentId);
      const doc = await this.prisma.document.findUnique({
        where: { id: data.documentId },
        select: { workspaceId: true }
      });
      if (doc) {
        await this.summaryQueue.add(
          "workspace",
          { kind: "WORKSPACE", workspaceId: doc.workspaceId },
          {
            removeOnComplete: 50,
            removeOnFail: 20,
            attempts: 2,
            backoff: { type: "exponential", delay: 2e3 },
            delay: 1500
          }
        );
      }
      return;
    }
    if (data.kind === "WORKSPACE") {
      await this.summarizeWorkspace(data.workspaceId);
      return;
    }
    if (data.kind === "CONNECTOR") {
      await this.summarizeConnector(data.connectorId);
      const connector = await this.prisma.connector.findUnique({
        where: { id: data.connectorId },
        select: { workspaceId: true }
      });
      if (connector) {
        await this.summaryQueue.add(
          "workspace",
          { kind: "WORKSPACE", workspaceId: connector.workspaceId },
          {
            removeOnComplete: 50,
            removeOnFail: 20,
            attempts: 2,
            delay: 1500
          }
        );
      }
    }
  }
  async summarizeDocument(documentId) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 }
      }
    });
    if (!document || document.status !== "READY") {
      this.logger.warn(`Skip document summary \u2014 not READY: ${documentId}`);
      return;
    }
    const text = document.versions[0]?.extractedText || `${document.name} (${document.mimeType})`;
    const sourceHash = createHash6("sha256").update(text).digest("hex");
    const existing = await this.prisma.knowledgeSummary.findUnique({
      where: { documentId }
    });
    if (existing?.sourceHash === sourceHash) {
      return;
    }
    const summary = await this.ai.summarizeKnowledge({
      kind: "DOCUMENT",
      title: document.name,
      text: text.slice(0, 12e3)
    });
    await this.upsertKnowledgeSummary({
      kind: "DOCUMENT",
      title: document.name,
      summary,
      sourceHash,
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
      connectorId: null
    });
  }
  async summarizeWorkspace(workspaceId) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId }
    });
    if (!workspace) return;
    const docs = await this.prisma.knowledgeSummary.findMany({
      where: { workspaceId, kind: "DOCUMENT" },
      take: 40,
      orderBy: { updatedAt: "desc" }
    });
    const connectors = await this.prisma.knowledgeSummary.findMany({
      where: { workspaceId, kind: "CONNECTOR" },
      take: 20,
      orderBy: { updatedAt: "desc" }
    });
    const text = [
      `Workspace: ${workspace.name}`,
      workspace.description || "",
      ...docs.map((d) => `Doc: ${d.title} \u2014 ${d.summary}`),
      ...connectors.map((c) => `Connector: ${c.title} \u2014 ${c.summary}`)
    ].filter(Boolean).join("\n");
    const sourceHash = createHash6("sha256").update(text).digest("hex");
    const existing = await this.prisma.knowledgeSummary.findFirst({
      where: { workspaceId, kind: "WORKSPACE", documentId: null, connectorId: null }
    });
    if (existing?.sourceHash === sourceHash) return;
    const summary = await this.ai.summarizeKnowledge({
      kind: "WORKSPACE",
      title: workspace.name,
      text: text.slice(0, 12e3)
    });
    if (existing) {
      await this.prisma.knowledgeSummary.update({
        where: { id: existing.id },
        data: { title: workspace.name, summary, sourceHash }
      });
      await this.writeEmbedding(existing.id, summary);
      return;
    }
    await this.upsertKnowledgeSummary({
      kind: "WORKSPACE",
      title: workspace.name,
      summary,
      sourceHash,
      organizationId: workspace.organizationId,
      workspaceId,
      documentId: null,
      connectorId: null
    });
  }
  async summarizeConnector(connectorId) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: {
        documents: {
          where: { status: "READY" },
          take: 30,
          orderBy: { updatedAt: "desc" },
          include: {
            knowledgeSummary: true
          }
        }
      }
    });
    if (!connector) return;
    const text = [
      `Connector: ${connector.name} (${connector.type})`,
      ...connector.documents.map(
        (d) => d.knowledgeSummary?.summary || `Document ${d.name} status=${d.status}`
      )
    ].join("\n");
    const sourceHash = createHash6("sha256").update(text).digest("hex");
    const existing = await this.prisma.knowledgeSummary.findUnique({
      where: { connectorId }
    });
    if (existing?.sourceHash === sourceHash) return;
    const summary = await this.ai.summarizeKnowledge({
      kind: "CONNECTOR",
      title: connector.name,
      text: text.slice(0, 12e3)
    });
    await this.upsertKnowledgeSummary({
      kind: "CONNECTOR",
      title: connector.name,
      summary,
      sourceHash,
      organizationId: connector.organizationId,
      workspaceId: connector.workspaceId,
      documentId: null,
      connectorId: connector.id
    });
  }
  async upsertKnowledgeSummary(input) {
    let id;
    if (input.documentId) {
      const row = await this.prisma.knowledgeSummary.upsert({
        where: { documentId: input.documentId },
        create: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          documentId: input.documentId
        },
        update: {
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash
        }
      });
      id = row.id;
    } else if (input.connectorId) {
      const row = await this.prisma.knowledgeSummary.upsert({
        where: { connectorId: input.connectorId },
        create: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          connectorId: input.connectorId
        },
        update: {
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash
        }
      });
      id = row.id;
    } else {
      const row = await this.prisma.knowledgeSummary.create({
        data: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId
        }
      });
      id = row.id;
    }
    await this.writeEmbedding(id, input.summary);
  }
  async writeEmbedding(summaryId, summary) {
    const [embedding] = await this.ai.embed([summary]);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeSummary" SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      summaryId
    );
  }
};

// src/domain/common/utils/password.util.ts
import * as bcrypt from "bcrypt";
var SALT_ROUNDS = 12;
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}
async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// src/domain/modules/users/users.service.ts
var UsersService = class {
  constructor(prisma) {
    this.prisma = prisma;
  }
  async create(data) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const passwordHash = await hashPassword(data.password);
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName
      }
    });
    return toSafeUser(user);
  }
  async findByEmail(email) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
  }
  async findById(id) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }
  async findSafeById(id) {
    return toSafeUser(await this.findById(id));
  }
  async validateCredentials(email, password) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("Account is inactive");
    }
    const valid2 = await comparePassword(password, user.passwordHash);
    if (!valid2) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }
  async setRefreshTokenHash(userId, refreshTokenHash) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash }
    });
  }
  async touchLastLogin(userId) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: /* @__PURE__ */ new Date() }
    });
  }
  async updateMe(userId, dto) {
    const data = {};
    if (dto.firstName !== void 0) data.firstName = dto.firstName;
    if (dto.lastName !== void 0) data.lastName = dto.lastName;
    if (dto.password) {
      data.passwordHash = await hashPassword(dto.password);
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data
    });
    return toSafeUser(user);
  }
};

// src/domain/modules/workspaces/workspaces.service.ts
var WorkspacesService = class {
  constructor(prisma, membership) {
    this.prisma = prisma;
    this.membership = membership;
  }
  async create(userId, dto) {
    await this.membership.assertOrgRole(userId, dto.organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN
    ]);
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: dto.name,
          description: dto.description,
          organizationId: dto.organizationId,
          createdById: userId
        }
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.ADMIN
        }
      });
      return workspace;
    });
  }
  async findAllForUser(userId, page = 1, limit = 20) {
    const { skip, take, page: p2, limit: l } = getSkipTake(page, limit);
    const where = { members: { some: { userId } } };
    const [items, total] = await Promise.all([
      this.prisma.workspace.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.workspace.count({ where })
    ]);
    return paginatedResult(items, total, p2, l);
  }
  async findOne(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId }
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
    return workspace;
  }
  async update(userId, workspaceId, dto) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      WorkspaceRole.ADMIN
    ]);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: dto.name,
        description: dto.description
      }
    });
  }
  async remove(userId, workspaceId) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      WorkspaceRole.ADMIN
    ]);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    return { success: true };
  }
  async listMembers(userId, workspaceId) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }
  async addMember(actorId, workspaceId, dto) {
    const membership = await this.membership.assertWorkspaceRole(
      actorId,
      workspaceId,
      [WorkspaceRole.ADMIN]
    );
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    await this.membership.assertOrgMember(
      user.id,
      membership.workspace.organizationId
    );
    const existing = await this.membership.getWorkspaceMembership(
      user.id,
      workspaceId
    );
    if (existing) {
      throw new ConflictException("User is already a workspace member");
    }
    return this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: dto.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }
  async updateMember(actorId, workspaceId, targetUserId, dto) {
    await this.membership.assertWorkspaceRole(actorId, workspaceId, [
      WorkspaceRole.ADMIN
    ]);
    const target = await this.membership.getWorkspaceMembership(
      targetUserId,
      workspaceId
    );
    if (!target) {
      throw new NotFoundException("Member not found");
    }
    return this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: dto.role }
    });
  }
  async removeMember(actorId, workspaceId, targetUserId) {
    await this.membership.assertWorkspaceRole(actorId, workspaceId, [
      WorkspaceRole.ADMIN
    ]);
    const target = await this.membership.getWorkspaceMembership(
      targetUserId,
      workspaceId
    );
    if (!target) {
      throw new NotFoundException("Member not found");
    }
    await this.prisma.workspaceMember.delete({ where: { id: target.id } });
    return { success: true };
  }
};

// src/domain/prisma/prisma.service.ts
import { PrismaPg } from "@prisma/adapter-pg";
var PrismaService = class extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // Fail boot in seconds if Postgres is unreachable. pg's default is no timeout.
      connectionTimeoutMillis: 5e3
    });
    super({ adapter });
  }
  async onModuleInit() {
    await this.$connect();
  }
};

// src/domain/redis/redis.service.ts
var RedisService = class {
  constructor(client) {
    this.client = client;
  }
  getClient() {
    return this.client;
  }
  async connect() {
    if (this.client.status === "wait") {
      await this.client.connect();
    }
  }
  async onModuleDestroy() {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
  async ping() {
    await this.connect();
    return this.client.ping();
  }
  async get(key) {
    await this.connect();
    return this.client.get(key);
  }
  async set(key, value, ttlSeconds) {
    await this.connect();
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }
  async del(key) {
    await this.connect();
    await this.client.del(key);
  }
  async incr(key) {
    await this.connect();
    return this.client.incr(key);
  }
  async pexpire(key, ttlMs) {
    await this.connect();
    await this.client.pexpire(key, ttlMs);
  }
  async pttl(key) {
    await this.connect();
    return this.client.pttl(key);
  }
};

// src/domain/storage/local-file.storage.ts
import { createWriteStream, promises as fs } from "fs";
import { dirname, join as join3 } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { randomUUID as randomUUID2 } from "crypto";
var LocalFileStorage = class {
  root;
  constructor(config2) {
    this.root = config2.get("storage.root") || join3(process.cwd(), "storage");
  }
  async save(workspaceId, originalName, buffer) {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = join3(workspaceId, `${randomUUID2()}-${safeName}`).replace(
      /\\/g,
      "/"
    );
    const absolutePath = this.absolutePath(key);
    await fs.mkdir(dirname(absolutePath), { recursive: true });
    await pipeline(Readable.from(buffer), createWriteStream(absolutePath));
    return { key, absolutePath };
  }
  absolutePath(key) {
    return join3(this.root, key);
  }
  async read(key) {
    return fs.readFile(this.absolutePath(key));
  }
  async delete(key) {
    await fs.unlink(this.absolutePath(key)).catch(() => void 0);
  }
};

// src/domain/config/configuration.ts
var configuration_default = () => ({
  app: {
    name: process.env.APP_NAME,
    version: process.env.APP_VERSION,
    port: parseInt(process.env.PORT || "7000", 10),
    environment: process.env.NODE_ENV || "development"
  },
  database: {
    url: process.env.DATABASE_URL
  },
  redis: {
    /** TCP URL (Upstash: rediss://default:…@….upstash.io:6379). Overrides host/port/password. */
    url: process.env.REDIS_URL || void 0,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || void 0,
    restUrl: process.env.UPSTASH_REDIS_REST_URL || void 0,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN || void 0
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
  },
  storage: {
    root: process.env.STORAGE_ROOT || void 0
  },
  rag: {
    embeddingDimensions: parseInt(
      process.env.EMBEDDING_DIMENSIONS || "1536",
      10
    )
  },
  ai: {
    provider: process.env.AI_PROVIDER || "auto",
    serviceUrl: process.env.AI_SERVICE_URL || void 0,
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      summaryModel: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini"
    }
  }
});

// src/lib/config.ts
function getByPath(obj, path) {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return current[key];
    }
    return void 0;
  }, obj);
}
function createConfigService() {
  const root = configuration_default();
  return {
    get(path) {
      return getByPath(root, path);
    },
    getOrThrow(path) {
      const value = getByPath(root, path);
      if (value === void 0 || value === null) {
        throw new Error(`Missing required config: ${path}`);
      }
      return value;
    }
  };
}

// src/lib/redis-connection.ts
import Redis from "ioredis";
function createRedisClient(config2) {
  const url = config2.get("redis.url")?.trim();
  if (url) {
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
  }
  return new Redis({
    host: config2.getOrThrow("redis.host"),
    port: config2.get("redis.port") ?? 6379,
    password: config2.get("redis.password") || void 0,
    maxRetriesPerRequest: null,
    lazyConnect: true
  });
}

// src/lib/container.ts
async function createContainer() {
  const config2 = createConfigService();
  const prisma = new PrismaService();
  await prisma.$connect();
  const redisApp = createRedisClient(config2);
  const bullRedis = createRedisClient(config2);
  const redis = new RedisService(redisApp);
  await redis.connect();
  await bullRedis.connect();
  const documentQueue = new Queue(DOCUMENT_QUEUE, {
    connection: bullRedis
  });
  const connectorSyncQueue = new Queue(
    CONNECTOR_SYNC_QUEUE,
    { connection: bullRedis }
  );
  const summaryQueue = new Queue(SUMMARY_QUEUE, {
    connection: bullRedis
  });
  const membership = new MembershipService(prisma);
  const audit = new AuditService(prisma);
  const users = new UsersService(prisma);
  const jwt3 = new JwtService();
  const auth = new AuthService(users, jwt3, config2);
  const storage = new LocalFileStorage(config2);
  const registry = new ConnectorRegistry();
  const stubAi = new StubAiClient();
  const openAi = new OpenAiAiClient(config2);
  openAi.onModuleInit();
  const serviceUrl = config2.get("ai.serviceUrl");
  let ai;
  if (serviceUrl?.trim()) {
    ai = new HttpAiClient(config2);
  } else {
    const provider = resolveAiProvider(
      config2.get("ai.provider"),
      config2.get("ai.openai.apiKey")
    );
    ai = provider === "openai" ? openAi : stubAi;
  }
  const usage = new UsageService(prisma);
  const organizations = new OrganizationsService(prisma, membership);
  const workspaces = new WorkspacesService(prisma, membership);
  const documentProcessing = new DocumentProcessingService(
    prisma,
    storage,
    ai,
    summaryQueue
  );
  const documents = new DocumentsService(
    prisma,
    membership,
    storage,
    documentQueue
  );
  const connectorSync = new ConnectorSyncService(
    prisma,
    registry,
    storage,
    documentQueue
  );
  const connectors = new ConnectorsService(
    prisma,
    membership,
    registry,
    connectorSyncQueue
  );
  const retrieval = new RetrievalService(prisma, membership, ai);
  const memory = new ConversationMemoryService(prisma, ai);
  const summaries = new KnowledgeSummaryService(
    prisma,
    membership,
    ai,
    summaryQueue
  );
  const chat = new ChatService(
    prisma,
    membership,
    retrieval,
    memory,
    ai,
    summaryQueue,
    usage,
    audit
  );
  const feedback = new FeedbackService(prisma, membership);
  const admin = new AdminService(prisma, redis, usage);
  const evaluation = new EvaluationService(prisma, retrieval, ai);
  const health = new HealthService(prisma, redis);
  return {
    config: config2,
    prisma,
    redis,
    bullRedis,
    documentQueue,
    connectorSyncQueue,
    summaryQueue,
    auth,
    users,
    organizations,
    workspaces,
    documents,
    connectors,
    connectorSync,
    retrieval,
    chat,
    memory,
    summaries,
    feedback,
    admin,
    analytics: usage,
    evaluation,
    health,
    documentProcessing,
    ai
  };
}
async function shutdownContainer(c) {
  await c.documentQueue.close();
  await c.connectorSyncQueue.close();
  await c.summaryQueue.close();
  await c.redis.onModuleDestroy();
  if (c.bullRedis.status !== "end") {
    await c.bullRedis.quit();
  }
  await c.prisma.$disconnect();
}

// src/main.ts
async function main() {
  loadEnv();
  const container = await createContainer();
  const app = createApp(container);
  const port = container.config.get("app.port") ?? 7e3;
  const server = app.listen(port, () => {
    console.log(`Memora API v2 http://localhost:${port}`);
    console.log(`Swagger http://localhost:${port}/docs`);
    console.log(`Health http://localhost:${port}/health`);
  });
  const close = async () => {
    server.close();
    await shutdownContainer(container);
    process.exit(0);
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=main.js.map
