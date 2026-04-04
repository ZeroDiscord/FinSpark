export const platformSnippetTemplates = {
  web: `trackFeature({
  feature: "Upload Documents",
  action: "open"
})`,
  android: `AnalyticsTracker.track(
  "Upload Documents",
  "open"
)`,
}

export const integrationStepsByPlatform = {
  web: [
    'Install the generated SDK or paste the snippet into your analytics layer.',
    'Initialize the tracker at application boot.',
    'Call trackFeature whenever a user opens, submits, or completes a feature step.',
    'Verify events in the dashboard within a few minutes.',
  ],
  android: [
    'Download the Android package and add it to your app module.',
    'Initialize AnalyticsTracker in Application.onCreate.',
    'Track important feature actions from screens and view models.',
    'Validate event ingestion in the dashboard after a test session.',
  ],
}
