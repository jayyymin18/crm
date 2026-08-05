import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ContextLogger } from "./logging/context-logger";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	// Vercel terminates TLS and forwards internally over plain HTTP, so without
	// this Express sees every request as http:// regardless of what the client
	// actually used. Better Auth checks the request's perceived origin against
	// trustedOrigins (which only lists the https:// URLs) before setting the
	// cross-subdomain session cookie — a protocol mismatch there makes it
	// silently skip the Set-Cookie as a safety measure, so the OAuth callback
	// completes and redirects but the browser never ends up signed in.
	app.set("trust proxy", true);

	app.use(helmet());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	return app;
}
