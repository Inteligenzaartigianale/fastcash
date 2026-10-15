import serverless from "serverless-http";
import app from "./app";
import { ensureLicenseStorage } from "./lib/licensing";

const handle = serverless(app, { binary: ["application/zip"] });
let ready: Promise<void> | null = null;

export const handler = async (event: unknown, context: unknown) => {
  ready ??= ensureLicenseStorage();
  await ready;
  return handle(event as never, context as never);
};
