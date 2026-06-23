import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { syncWeeklyTrendingCollections } from "../lib/weekly-trending.server";

const DEFAULT_SHOP_DOMAIN = "apepsd-ha.myshopify.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return await runCronSync(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return await runCronSync(request);
};

async function runCronSync(request: Request) {
  const authResult = authorizeCronRequest(request);
  if (authResult) return authResult;

  const shop = process.env.SHOPIFY_SHOP_DOMAIN || DEFAULT_SHOP_DOMAIN;
  const { admin } = await unauthenticated.admin(shop);
  const result = await syncWeeklyTrendingCollections(admin);

  return Response.json({
    ok: true,
    shop: result.shopName,
    lastRun: result.lastRun,
    selectedCollections: result.selectedCollections,
  });
}

function authorizeCronRequest(request: Request) {
  const expectedToken = process.env.CRON_SYNC_TOKEN;

  if (!expectedToken) {
    return Response.json(
      { ok: false, error: "CRON_SYNC_TOKEN is not configured." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (!token || token !== expectedToken) {
    return Response.json(
      { ok: false, error: "Unauthorized cron sync request." },
      { status: 401 },
    );
  }

  return null;
}
