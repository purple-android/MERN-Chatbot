function getToken() {
  return localStorage.getItem('token');
}

const POLL_INTERVAL_MS = 4000;            // ask for status every 4 seconds
const MAX_POLL_MS = 30 * 60 * 1000;       // give up after 30 minutes (safety cap)

// ── summarizeDocument ──
// Starts a background summarization job and polls until it finishes. The return
// shape is unchanged from before — { summary } on success, { error } on failure —
// so callers (App.js) don't need to change. The difference is that no single
// request stays open for the whole job, so proxy/load-balancer timeouts can't kill it.
export async function summarizeDocument(text) {
  try {
    // 1. Start the job — returns almost instantly with a jobId.
    const startRes = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ text })
    });

    const startData = await startRes.json();

    if (!startRes.ok || !startData.jobId) {
      return { error: startData.error || 'Failed to start summarization.' };
    }

    const jobId = startData.jobId;

    // 2. Poll the status endpoint until the job is done.
    const deadline = Date.now() + MAX_POLL_MS;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      let job;
      try {
        const res = await fetch(`/api/summarize/${jobId}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        job = await res.json();
      } catch (e) {
        // Transient network hiccup during a poll — keep trying.
        continue;
      }

      if (job.status === 'completed') return { summary: job.result };
      if (job.status === 'failed')    return { error: job.error || 'Summarization failed.' };
      // 'processing' → keep polling
    }

    return { error: 'Summarization is taking too long. Please try again with a shorter document.' };

  } catch (err) {
    return { error: 'Could not reach the server. Please check your connection.' };
  }
}
