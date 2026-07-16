<template>
  <div class="page-stack">
    <header class="page-heading page-heading--with-action">
      <div>
        <span class="eyebrow">Library</span>
        <h1>Voice assets</h1>
        <p>Browse, filter, upload, and manage assets once the Server API is integrated.</p>
      </div>
      <button type="button" disabled title="Upload is not implemented in Phase 0">
        Upload audio
      </button>
    </header>

    <section class="empty-state" aria-labelledby="empty-assets-title">
      <span class="empty-state__mark" aria-hidden="true">VA</span>
      <h2 id="empty-assets-title">No assets loaded</h2>
      <p>
        This is an honest initialization state, not a completed asset browser. The list will be
        connected to the versioned public REST API in the first vertical slice.
      </p>
    </section>
  </div>
</template>
