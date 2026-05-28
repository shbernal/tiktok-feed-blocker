import type { BrowserContext, Route } from '@playwright/test'

const mediaSetupScript = `
<script>
  for (const media of document.querySelectorAll('video, audio')) {
    media.muted = false
    media.volume = 0.75
  }
</script>
`

const pageShell = (title: string, body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        font-family: system-ui, sans-serif;
      }

      main,
      section,
      #column-list-container,
      .ejpasz60-fixture {
        min-height: 420px;
        padding: 24px;
      }

      .DivCommentSidebarTransitionWrapper-fixture,
      .SectionCommentSidebarContainer-fixture {
        display: block;
      }
    </style>
  </head>
  <body>
    ${body}
    ${mediaSetupScript}
  </body>
</html>`

const homePage = pageShell(
  'TikTok Home Fixture',
  `
    <nav class="DivFeedNavigationContainer-fixture">Home navigation</nav>
    <div class="progress-js-inner">Primary progress</div>
    <div class="progress-fixture">Secondary progress</div>
    <main id="column-list-container">
      <h1>Home feed fixture</h1>
      <video id="home-video"></video>
    </main>
    <aside class="AsideOneColumnSidebar-fixture">
      <div class="DivCommentSidebarTransitionWrapper-fixture">
        <section
          id="home-comment-sidebar"
          class="SectionCommentSidebarContainer-fixture"
        >
          Comments fixture
        </section>
      </div>
    </aside>
  `,
)

const explorePage = pageShell(
  'TikTok Explore Fixture',
  `
    <main id="main-content-explore_page">
      <h1>Explore fixture</h1>
      <video id="explore-video"></video>
    </main>
    <section
      class="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout-fixture"
    >
      Explore layout fixture
    </section>
  `,
)

const livePage = pageShell(
  'TikTok Live Fixture',
  `
    <div class="ejpasz60-fixture">
      <h1>Live fixture</h1>
      <video id="live-video"></video>
      <audio id="live-audio"></audio>
    </div>
  `,
)

const getFixtureHtml = (url: string) => {
  const { pathname } = new URL(url)

  if (pathname.startsWith('/live')) {
    return livePage
  }

  if (pathname.startsWith('/explore')) {
    return explorePage
  }

  return homePage
}

const fulfillTikTokRoute = async (route: Route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: getFixtureHtml(route.request().url()),
  })
}

export const installTikTokFixtureRoutes = async (context: BrowserContext) => {
  await context.route('https://www.tiktok.com/**', fulfillTikTokRoute)
}
