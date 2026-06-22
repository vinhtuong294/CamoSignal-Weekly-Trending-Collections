import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncWeeklyTrendingCollections } from "../lib/weekly-trending.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, shop, topic } = await authenticate.webhook(request);

  if (!session || !admin) return new Response();

  try {
    const result = await syncWeeklyTrendingCollections(admin);
    console.log(
      `Synced ${result.selectedCollections.length} weekly trending collections for ${shop} from ${topic}.`,
    );
  } catch (error) {
    console.error(`Failed to sync weekly trending collections for ${shop}.`, error);
  }

  return new Response();
};
