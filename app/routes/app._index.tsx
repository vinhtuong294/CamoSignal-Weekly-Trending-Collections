import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getWeeklyTrendingStatus,
  syncWeeklyTrendingCollections,
} from "../lib/weekly-trending.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  return await getWeeklyTrendingStatus(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    return {
      ok: true,
      result: await syncWeeklyTrendingCollections(admin),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed.",
    };
  }
};

export default function Index() {
  const initialStatus = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const autoSyncStarted = useRef(false);
  const isLoading = fetcher.state !== "idle";
  const syncResult = fetcher.data?.ok ? fetcher.data.result : null;
  const error = fetcher.data?.ok === false ? fetcher.data.error : null;
  const currentStatus = syncResult ?? initialStatus;
  const selectedCollections =
    "selectedCollections" in currentStatus
      ? currentStatus.selectedCollections
      : currentStatus.debug?.collections.slice(0, 2) ?? [];

  useEffect(() => {
    if (autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    fetcher.submit({ intent: "sync" }, { method: "POST" });
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Weekly trending collections synced");
    } else if (fetcher.data?.ok === false) {
      shopify.toast.show("Weekly trending sync failed", { isError: true });
    }
  }, [fetcher.data, shopify]);

  const runSync = () => {
    fetcher.submit({ intent: "sync" }, { method: "POST" });
  };

  return (
    <s-page heading="Weekly Trending Collections">
      <s-button
        slot="primary-action"
        onClick={runSync}
        {...(isLoading ? { loading: true } : {})}
      >
        Run sync
      </s-button>

      <s-section heading="Status">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            This app scans paid order line items from the last 7 days, ranks
            collections by units sold, skips utility collections, then writes
            the top 2 collections to the shop metafield
            sidekick.weekly_trending_collections.
          </s-paragraph>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-paragraph>Shop: {currentStatus.shopName}</s-paragraph>
              <s-paragraph>
                Last run:{" "}
                {currentStatus.lastRun
                  ? formatDateTime(currentStatus.lastRun)
                  : "Not synced yet"}
              </s-paragraph>
              <s-paragraph>
                Orders scanned: {currentStatus.debug?.ordersScanned ?? 0}
              </s-paragraph>
              <s-paragraph>
                Products counted: {currentStatus.debug?.productsScanned ?? 0}
              </s-paragraph>
            </s-stack>
          </s-box>
          {error && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-paragraph>{error}</s-paragraph>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Selected collections">
        {selectedCollections.length > 0 ? (
          <s-stack direction="block" gap="base">
            {selectedCollections.map((collection) => (
              <s-box
                key={collection.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small">
                  <s-paragraph>
                    #{collection.rank} {collection.title}
                  </s-paragraph>
                  <s-paragraph>Handle: {collection.handle}</s-paragraph>
                  <s-paragraph>Units sold: {collection.unitsSold}</s-paragraph>
                  <s-paragraph>
                    Products in collection: {collection.productsCount ?? "N/A"}
                  </s-paragraph>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        ) : (
          <s-paragraph>
            No trending collections found yet. The metafield will be written as
            an empty list until qualifying sales exist.
          </s-paragraph>
        )}
      </s-section>

      <s-section heading="Top 10 debug">
        {currentStatus.debug?.collections.length ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <code>
                {JSON.stringify(currentStatus.debug.collections, null, 2)}
              </code>
            </pre>
          </s-box>
        ) : (
          <s-paragraph>No debug data yet.</s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
