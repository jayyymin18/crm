import { sso } from "@better-auth/sso";
import { db } from "@crm/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { createHash } from "node:crypto";
import { AUTH_COOKIE_PREFIX } from "./cookies";
import { env } from "./env";
import { ensureWorkspaceMembership } from "./organization";
import { SYNC_SCOPES } from "./scopes";
import { notifySignedIn } from "./signed-in";
import {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
} from "./workspace";

// Temporary: prints which deployment loaded this module and a short,
// irreversible hash of BETTER_AUTH_SECRET, so a secret mismatch between
// crm-app and crm-api (which each load their own copy of this module) shows
// up directly in each project's Vercel logs instead of being guessed at.
const secretHash = process.env.BETTER_AUTH_SECRET
	? createHash("sha256")
			.update(process.env.BETTER_AUTH_SECRET)
			.digest("hex")
			.slice(0, 12)
	: "MISSING";
console.log(
	`[auth-secret-check] deployment=${process.env.VERCEL_URL ?? "unknown"} secretHash=${secretHash}`,
);

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

if (env.google) {
	socialProviders.google = {
		...env.google,

		scope: [...SYNC_SCOPES],

		accessType: "offline",

		...(primaryWorkspaceDomain() ? { hd: primaryWorkspaceDomain() } : {}),
	};
}

export const auth = betterAuth({
	appName: "CRM",

	database: prismaAdapter(db, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: false,
	},

	socialProviders,

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		// Temporarily disabled while diagnosing a session cookie that stops
		// validating within a second of being set on Vercel — this removes the
		// separate encrypted/possibly-chunked session_data cookie from the
		// picture, leaving only the plain DB-backed session_token cookie.
		cookieCache: {
			enabled: false,
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
	},

	advanced: {
		cookiePrefix: AUTH_COOKIE_PREFIX,

		useSecureCookies: env.isProduction,
		...(env.cookieDomain && {
			crossSubDomainCookies: {
				enabled: true,
				domain: env.cookieDomain,
			},
		}),
	},

	trustedOrigins: [...env.trustedOrigins],
	hooks: {},

	plugins: [
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			creatorRole: "owner",

			schema: {
				organization: {
					additionalFields: {
						website: {
							type: "string",
							required: false,
						},
					},
				},
			},
		}),

		sso({
			organizationProvisioning: { disabled: true },
		}),
	],

	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (!hasSignInAllowList()) {
						throw new APIError("FORBIDDEN", {
							message:
								'No one can sign in yet: set ALLOWED_SIGN_IN in .env to your email domain (for example ALLOWED_SIGN_IN="acme.com") and restart.',
						});
					}

					if (!isWorkspaceEmail(user.email)) {
						const domain = primaryWorkspaceDomain();
						throw new APIError("FORBIDDEN", {
							message: domain
								? `This CRM is private. Sign in with your @${domain} account.`
								: "This CRM is private. That address is not on the allow-list.",
						});
					}

					return { data: user };
				},
			},
		},

		session: {
			create: {
				before: async (session) => {
					const workspaceId = await ensureWorkspaceMembership(session.userId);

					return {
						data: { ...session, activeOrganizationId: workspaceId ?? null },
					};
				},

				after: async (session) => {
					const user = await db.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});

					if (user) await notifySignedIn(user);
				},
			},
		},
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
