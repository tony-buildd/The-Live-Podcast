import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

let cachedClient: ConvexHttpClient | null = null;

export class ConvexConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvexConfigurationError";
  }
}

export function isConvexConfigurationError(
  error: unknown,
): error is ConvexConfigurationError {
  return error instanceof ConvexConfigurationError;
}

function getConfiguredConvexUrl(): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();

  if (!convexUrl) {
    throw new ConvexConfigurationError(
      "NEXT_PUBLIC_CONVEX_URL is not configured. Run `npm run convex:dev` and copy the generated Convex URL into your .env file.",
    );
  }

  if (convexUrl.includes("your-deployment")) {
    throw new ConvexConfigurationError(
      "NEXT_PUBLIC_CONVEX_URL is still using the placeholder value. Run `npm run convex:dev` and replace it with your real Convex deployment URL.",
    );
  }

  try {
    new URL(convexUrl);
  } catch {
    throw new ConvexConfigurationError(
      "NEXT_PUBLIC_CONVEX_URL is not a valid URL. Set it to the Convex deployment URL from `npm run convex:dev` or the Convex dashboard.",
    );
  }

  return convexUrl;
}

export function getConvexClient(): ConvexHttpClient {
  if (cachedClient) {
    return cachedClient;
  }

  const convexUrl = getConfiguredConvexUrl();

  cachedClient = new ConvexHttpClient(convexUrl);
  return cachedClient;
}

export { api };
