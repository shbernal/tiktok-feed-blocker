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
      #tiktok-live-main-container-id {
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
    <main id="column-list-container">
      <h1>Home feed fixture</h1>
      <video id="home-video"></video>
      <!-- Real TikTok renders the seek bar inside the feed container with a
           capital-P hashed class, so hiding the container covers it. -->
      <div
        id="home-video-progress"
        class="css-9p2al5-7937d88b--DivVideoProgressContainer eer0cdn0"
      >
        Video progress
      </div>
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

// Real TikTok carries the ExploreLayout styled-component class on the very node
// that holds the id, with a per-build hash between every name segment. The old
// fixture split them across two elements and joined the segments directly,
// which let a selector pass here that matches nothing in production.
const explorePage = pageShell(
  'TikTok Explore Fixture',
  `
    <main
      id="main-content-explore_page"
      class="ehxe0ik0 css-9bjk8h-7937d88b--DivShareLayoutBase-7937d88b--StyledShareLayoutV2-7937d88b--ExploreLayout eme3bfk0"
    >
      <h1>Explore fixture</h1>
      <video id="explore-video"></video>
    </main>
  `,
)

// Opening a video from the Explore grid is a client-side navigation: TikTok
// pushes `/@user/video/<id>` and mounts the player modal as a sibling of the
// Explore container, which stays in the DOM, visible and full size, behind it.
// That is why the fixture keeps the Explore markup and adds the player rather
// than replacing one with the other.
const exploreVideoPage = pageShell(
  'TikTok Explore Video Fixture',
  `
    <main
      id="main-content-explore_page"
      class="ehxe0ik0 css-9bjk8h-7937d88b--DivShareLayoutBase-7937d88b--StyledShareLayoutV2-7937d88b--ExploreLayout eme3bfk0"
    >
      <h1>Explore fixture</h1>
      <video id="explore-video"></video>
    </main>
    <div id="explore-video-modal">
      <h1>Video detail fixture</h1>
      <video id="explore-modal-video"></video>
    </div>
  `,
)

// The old fixture had no `#tiktok-live-main-container-id` at all, so Live
// coverage rested entirely on a hashed class that real TikTok had already
// rotated away. The classes here are the real ones, kept only so the fixture
// looks like the page; nothing targets them.
const livePage = pageShell(
  'TikTok Live Fixture',
  `
    <div id="tiktok-live-main-container-id" class="tiktok-mikc7i e1x0ojj00">
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

  if (/^\/@[^/]+\/video\//.test(pathname)) {
    return exploreVideoPage
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
