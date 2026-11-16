import { createMiddleware } from "@tanstack/react-start";

export const enforceChatAccess = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  const { enforceChatReadBarrier } = await import("./chat-access.server");
  await enforceChatReadBarrier(serverFnMeta.filename, serverFnMeta.name);
  return next();
});