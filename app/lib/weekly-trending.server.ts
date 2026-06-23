const NAMESPACE = "sidekick";
const WEEKLY_TRENDING_COLLECTIONS_KEY = "weekly_trending_collections";
const WEEKLY_TRENDING_LAST_RUN_KEY = "weekly_trending_last_run";
const WEEKLY_TRENDING_DEBUG_KEY = "weekly_trending_debug";
const DEFAULT_WINDOW_DAYS = 7;
const ORDERS_PAGE_SIZE = 50;
const PRODUCT_COLLECTION_LIMIT = 20;
const EXCLUDED_COLLECTION_HANDLES = [
  "all",
  "best-seller",
  "best-sellers",
  "new-arrival",
  "new-arrivals",
  "graphictee",
  "graphic-tee",
  "independence-day",
  "independence day",
];
const EXCLUDED_PRODUCT_PHRASES = [
  "shipping protection",
  "protection apparel",
];

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type CollectionNode = {
  id: string;
  title: string;
  handle: string;
  productsCount?: {
    count?: number | null;
  } | null;
};

type OrderLineItem = {
  title?: string | null;
  quantity?: number | null;
  product?: {
    id: string;
    title: string;
    handle: string;
    collections?: {
      nodes: CollectionNode[];
    } | null;
  } | null;
};

type WeeklyOrdersResponse = {
  orders: {
    nodes: Array<{
      id: string;
      name: string;
      processedAt?: string | null;
      cancelledAt?: string | null;
      lineItems: {
        nodes: OrderLineItem[];
        pageInfo: {
          hasNextPage: boolean;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
};

type ShopMetafieldsResponse = {
  shop: {
    id: string;
    name: string;
    metafields: {
      nodes: Array<{
        namespace: string;
        key: string;
        type: string;
        value: string;
        updatedAt: string;
      }>;
    };
  };
};

type MetafieldsSetResponse = {
  metafieldsSet: {
    metafields?: Array<{
      namespace: string;
      key: string;
      type: string;
      value: string;
      updatedAt: string;
    }> | null;
    userErrors: Array<{
      field?: string[] | null;
      message: string;
      code?: string | null;
    }>;
  };
};

export type RankedTrendingCollection = {
  rank: number;
  id: string;
  title: string;
  handle: string;
  unitsSold: number;
  productsCount: number | null;
};

export type WeeklyTrendingDebug = {
  status: "ready" | "empty";
  windowDays: number;
  sinceDate: string;
  lastRun: string;
  excludedCollections: string[];
  ordersScanned: number;
  cancelledOrdersSkipped: number;
  lineItemsScanned: number;
  productsScanned: number;
  collections: RankedTrendingCollection[];
};

export type WeeklyTrendingStatus = {
  shopName: string;
  lastRun: string | null;
  collectionIds: string[];
  debug: WeeklyTrendingDebug | null;
};

const SHOP_METAFIELDS_QUERY = `#graphql
  query CamoSignalWeeklyTrendingShopMetafields {
    shop {
      id
      name
      metafields(first: 20, namespace: "${NAMESPACE}") {
        nodes {
          namespace
          key
          type
          value
          updatedAt
        }
      }
    }
  }
`;

const WEEKLY_ORDERS_QUERY = `#graphql
  query CamoSignalWeeklyTrendingOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        id
        name
        processedAt
        cancelledAt
        lineItems(first: 100) {
          nodes {
            title
            quantity
            product {
              id
              title
              handle
              collections(first: ${PRODUCT_COLLECTION_LIMIT}) {
                nodes {
                  id
                  title
                  handle
                  productsCount {
                    count
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SET_SHOP_METAFIELDS_MUTATION = `#graphql
  mutation CamoSignalSetWeeklyTrendingMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
        type
        value
        updatedAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export async function getWeeklyTrendingStatus(
  admin: AdminGraphqlClient,
): Promise<WeeklyTrendingStatus> {
  const data = await graphql<ShopMetafieldsResponse>(
    admin,
    SHOP_METAFIELDS_QUERY,
  );
  const metafields = data.shop.metafields.nodes;
  const collectionsMetafield = findMetafield(
    metafields,
    WEEKLY_TRENDING_COLLECTIONS_KEY,
  );
  const lastRunMetafield = findMetafield(
    metafields,
    WEEKLY_TRENDING_LAST_RUN_KEY,
  );
  const debugMetafield = findMetafield(metafields, WEEKLY_TRENDING_DEBUG_KEY);

  return {
    shopName: data.shop.name,
    lastRun: lastRunMetafield?.value ?? null,
    collectionIds: parseJsonStringArray(collectionsMetafield?.value),
    debug: parseDebug(debugMetafield?.value),
  };
}

export async function syncWeeklyTrendingCollections(
  admin: AdminGraphqlClient,
  options: { windowDays?: number } = {},
) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const shopData = await graphql<ShopMetafieldsResponse>(
    admin,
    SHOP_METAFIELDS_QUERY,
  );
  const sinceDate = getSinceDate(windowDays);
  const orderQuery = `processed_at:>=${sinceDate}`;
  const collectionScores = new Map<
    string,
    Omit<RankedTrendingCollection, "rank">
  >();
  let ordersScanned = 0;
  let cancelledOrdersSkipped = 0;
  let lineItemsScanned = 0;
  let productsScanned = 0;
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: WeeklyOrdersResponse = await graphql<WeeklyOrdersResponse>(
      admin,
      WEEKLY_ORDERS_QUERY,
      {
        first: ORDERS_PAGE_SIZE,
        after,
        query: orderQuery,
      },
    );

    for (const order of data.orders.nodes) {
      ordersScanned += 1;

      if (order.cancelledAt) {
        cancelledOrdersSkipped += 1;
        continue;
      }

      for (const lineItem of order.lineItems.nodes) {
        lineItemsScanned += 1;
        const quantity = Math.max(0, Number(lineItem.quantity ?? 0));
        const product = lineItem.product;

        if (!product || quantity <= 0) continue;
        if (productIsExcluded(product.title, product.handle, lineItem.title)) {
          continue;
        }

        productsScanned += 1;
        const seenCollectionIds = new Set<string>();

        for (const collection of product.collections?.nodes ?? []) {
          if (seenCollectionIds.has(collection.id)) continue;
          seenCollectionIds.add(collection.id);
          if (collectionIsExcluded(collection)) continue;

          const current = collectionScores.get(collection.id);
          collectionScores.set(collection.id, {
            id: collection.id,
            title: collection.title,
            handle: collection.handle,
            unitsSold: (current?.unitsSold ?? 0) + quantity,
            productsCount: collection.productsCount?.count ?? null,
          });
        }
      }
    }

    hasNextPage = data.orders.pageInfo.hasNextPage;
    after = data.orders.pageInfo.endCursor ?? null;
  }

  const rankedCollections = [...collectionScores.values()]
    .sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
      if ((a.productsCount ?? 0) !== (b.productsCount ?? 0)) {
        return (a.productsCount ?? Number.MAX_SAFE_INTEGER) -
          (b.productsCount ?? Number.MAX_SAFE_INTEGER);
      }
      return a.title.localeCompare(b.title);
    })
    .map((collection, index) => ({
      rank: index + 1,
      ...collection,
    }));

  const selectedCollections = rankedCollections.slice(0, 2);
  const lastRun = new Date().toISOString();
  const debug: WeeklyTrendingDebug = {
    status: selectedCollections.length > 0 ? "ready" : "empty",
    windowDays,
    sinceDate,
    lastRun,
    excludedCollections: EXCLUDED_COLLECTION_HANDLES,
    ordersScanned,
    cancelledOrdersSkipped,
    lineItemsScanned,
    productsScanned,
    collections: rankedCollections.slice(0, 10),
  };

  await setShopMetafields(
    admin,
    shopData.shop.id,
    rankedCollections.slice(0, 10),
    debug,
  );

  return {
    shopName: shopData.shop.name,
    lastRun,
    selectedCollections,
    debug,
  };
}

async function setShopMetafields(
  admin: AdminGraphqlClient,
  ownerId: string,
  collections: RankedTrendingCollection[],
  debug: WeeklyTrendingDebug,
) {
  const data = await graphql<MetafieldsSetResponse>(
    admin,
    SET_SHOP_METAFIELDS_MUTATION,
    {
      metafields: [
        {
          ownerId,
          namespace: NAMESPACE,
          key: WEEKLY_TRENDING_COLLECTIONS_KEY,
          type: "list.collection_reference",
          value: JSON.stringify(collections.map((collection) => collection.id)),
        },
        {
          ownerId,
          namespace: NAMESPACE,
          key: WEEKLY_TRENDING_LAST_RUN_KEY,
          type: "date_time",
          value: debug.lastRun,
        },
        {
          ownerId,
          namespace: NAMESPACE,
          key: WEEKLY_TRENDING_DEBUG_KEY,
          type: "json",
          value: JSON.stringify(debug),
        },
      ],
    },
  );

  const errors = data.metafieldsSet.userErrors;
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
}

async function graphql<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as GraphqlResponse<T>;

  if (!response.ok || json.errors?.length) {
    const message = json.errors?.map((error) => error.message).join("; ") ||
      response.statusText;
    throw new Error(message);
  }

  if (!json.data) throw new Error("Shopify returned no data.");
  return json.data;
}

function findMetafield(
  metafields: ShopMetafieldsResponse["shop"]["metafields"]["nodes"],
  key: string,
) {
  return metafields.find((metafield) => metafield.key === key);
}

function getSinceDate(windowDays: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  return since.toISOString().slice(0, 10);
}

function collectionIsExcluded(collection: CollectionNode) {
  return EXCLUDED_COLLECTION_HANDLES.includes(normalize(collection.handle)) ||
    EXCLUDED_COLLECTION_HANDLES.includes(normalize(collection.title));
}

function productIsExcluded(
  productTitle: string,
  productHandle: string,
  lineItemTitle?: string | null,
) {
  const combined = `${productTitle} ${productHandle} ${lineItemTitle ?? ""}`
    .toLowerCase();
  return EXCLUDED_PRODUCT_PHRASES.some((phrase) => combined.includes(phrase));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseJsonStringArray(value?: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseDebug(value?: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as WeeklyTrendingDebug;
  } catch {
    return null;
  }
}
