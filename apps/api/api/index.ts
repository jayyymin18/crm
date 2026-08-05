import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/create-app";

type ExpressInstance = (req: IncomingMessage, res: ServerResponse) => void;

let instancePromise: Promise<ExpressInstance> | null = null;

function getInstance(): Promise<ExpressInstance> {
	if (!instancePromise) {
		instancePromise = (async () => {
			const app = await createApp();
			await app.init();
			return app.getHttpAdapter().getInstance() as ExpressInstance;
		})();
	}
	return instancePromise;
}

export default async function handler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const instance = await getInstance();

	// Vercel ends the invocation as soon as this function's returned promise
	// resolves. Firing the Express handler without waiting for the response to
	// actually finish let the runtime freeze the instance mid-request, cutting
	// off in-flight async work (e.g. Better Auth's OAuth `verification` row
	// insert) before it committed — the client saw a valid 200, but the write
	// never landed.
	await new Promise<void>((resolve, reject) => {
		res.on("finish", resolve);
		res.on("close", resolve);
		res.on("error", reject);
		instance(req, res);
	});
}
