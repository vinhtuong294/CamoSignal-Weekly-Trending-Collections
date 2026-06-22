export default function AdditionalPage() {
  return (
    <s-page heading="Weekly Trending Collections">
      <s-section heading="Metafields">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            The theme should read sidekick.weekly_trending_collections as a
            list.collection_reference metafield and use those collections for
            product page slots 3 and 4.
          </s-paragraph>
          <s-paragraph>
            sidekick.weekly_trending_last_run stores the latest sync timestamp,
            and sidekick.weekly_trending_debug stores the top 10 scoring details.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
